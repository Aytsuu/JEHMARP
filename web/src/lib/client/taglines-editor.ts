import { ADMIN_JSON_ACTION_PATH } from "@/lib/admin-dashboard/json-action-path";
import {
  DEFAULT_TAGLINE_RUN_STYLE,
  type TaglineFontSize,
  type TaglineFontWeight,
  type TaglineItem,
  type TaglineRun,
  type TaglineRunStyle,
  createDefaultTaglineItem,
  getTaglineMarkClassName,
  getTaglinePlainText,
  isDefaultTaglineRunStyle,
  mergeAdjacentRuns,
  normalizeTaglineItems,
  renderTaglineDisplayStackHtml,
  renderTaglinesEditorHtml,
} from "@/lib/public-website/home-taglines";

type TaglinesEditorForm = HTMLFormElement & {
  dataset: DOMStringMap & {
    taglinesBound?: string;
    taglinesSaving?: string;
  };
};

type PartialTaglineRunStyle = Partial<TaglineRunStyle>;

type AdminActionJsonResponse = {
  success: boolean;
  error?: string;
  sectionContent?: Record<string, unknown>;
};

const SAVING_FLAG = "taglinesSaving";
const SAVE_DEBOUNCE_MS = 500;
const LINE_SELECTOR = ":scope > [data-tagline-line], :scope > div, :scope > p";
const MIXED_SELECT_VALUE = "__mixed__";

const saveTimers = new WeakMap<TaglinesEditorForm, number>();
const lastSavedPayloads = new WeakMap<TaglinesEditorForm, string>();
const savedSelections = new WeakMap<TaglinesEditorForm, Range>();
const pendingInputStyles = new WeakMap<TaglinesEditorForm, TaglineRunStyle>();
const bindAbortControllers = new WeakMap<TaglinesEditorForm, AbortController>();
const skipNextInputEvent = new WeakMap<TaglinesEditorForm, boolean>();

function getRangeText(range: Range): string {
  return range.cloneContents().textContent ?? "";
}

function isWhitespaceOnlyRange(range: Range): boolean {
  const text = getRangeText(range);
  return text.length === 0 || text.trim().length === 0;
}

function collapseSelectionToEnd(selection: Selection) {
  if (selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function shouldUsePendingStyle(selection: Selection): boolean {
  if (!selection.rangeCount || selection.isCollapsed) {
    return true;
  }

  return isWhitespaceOnlyRange(selection.getRangeAt(0));
}

function getEditor(form: TaglinesEditorForm) {
  return form.querySelector<HTMLElement>("[data-taglines-editor]");
}

function getPanel(form: TaglinesEditorForm) {
  return form.querySelector<HTMLElement>("[data-taglines-panel]");
}

function getHiddenJson(form: TaglinesEditorForm) {
  return form.querySelector<HTMLInputElement>("[data-taglines-json]");
}

function getCurrentContentInput(form: TaglinesEditorForm) {
  return form.querySelector<HTMLInputElement>('input[name="currentContent"]');
}

function isTaglineMarkElement(element: HTMLElement): boolean {
  return (
    element.dataset.taglineMark === "true" || element.classList.contains("tagline-mark")
  );
}

function parseStyleFromMark(element: HTMLElement): TaglineRunStyle {
  const className = typeof element.className === "string" ? element.className : "";
  const fontSizeMatch = className.match(/tagline-mark--size-(sm|md|lg|xl)/);
  const weightMatch = className.match(/tagline-mark--weight-(400|500|600|700)/);

  return {
    fontSize: (fontSizeMatch?.[1] ?? DEFAULT_TAGLINE_RUN_STYLE.fontSize) as TaglineFontSize,
    fontWeight: Number(
      weightMatch?.[1] ?? DEFAULT_TAGLINE_RUN_STYLE.fontWeight,
    ) as TaglineFontWeight,
    italic: className.includes("tagline-mark--italic"),
  };
}

function serializeNode(node: Node, inherited: TaglineRunStyle): TaglineRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ text, ...inherited }] : [];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as HTMLElement;

  if (element.tagName === "BR") {
    return [{ text: "\n", ...inherited }];
  }

  const nextStyle = isTaglineMarkElement(element) ? parseStyleFromMark(element) : inherited;

  return [...element.childNodes].flatMap((child) => serializeNode(child, nextStyle));
}

function serializeLineElement(line: HTMLElement): TaglineItem {
  const runs = mergeAdjacentRuns(
    [...line.childNodes].flatMap((child) =>
      serializeNode(child, DEFAULT_TAGLINE_RUN_STYLE),
    ),
  ).filter((run) => run.text.length > 0);

  return runs.length > 0 ? { runs } : createDefaultTaglineItem("");
}

function normalizeEditorLines(editor: HTMLElement) {
  const lineElements = [...editor.querySelectorAll<HTMLElement>(LINE_SELECTOR)];

  if (lineElements.length === 0) {
    const text = editor.textContent ?? "";
    if (!text.trim()) {
      editor.innerHTML = "";
      return;
    }

    const line = document.createElement("div");
    line.dataset.taglineLine = "true";
    line.innerHTML = editor.innerHTML;
    editor.innerHTML = "";
    editor.append(line);
    return;
  }

  lineElements.forEach((line) => {
    line.dataset.taglineLine = "true";
  });
}

function serializeEditorToItems(editor: HTMLElement): TaglineItem[] {
  normalizeEditorLines(editor);

  const lineElements = [...editor.querySelectorAll<HTMLElement>(LINE_SELECTOR)];
  if (lineElements.length === 0) {
    const text = editor.textContent?.trim() ?? "";
    return text.length > 0 ? [createDefaultTaglineItem(text)] : [];
  }

  return lineElements.flatMap((line) => {
    const item = serializeLineElement(line);
    return getTaglinePlainText(item).length > 0 ? [item] : [];
  });
}

function populateEditor(editor: HTMLElement, items: TaglineItem[]) {
  editor.innerHTML = renderTaglinesEditorHtml(items);

  if (!editor.textContent?.trim()) {
    editor.innerHTML = "";
  }
}

function mergeStyle(style: PartialTaglineRunStyle): TaglineRunStyle {
  return {
    fontSize: style.fontSize ?? DEFAULT_TAGLINE_RUN_STYLE.fontSize,
    fontWeight: style.fontWeight ?? DEFAULT_TAGLINE_RUN_STYLE.fontWeight,
    italic: style.italic ?? DEFAULT_TAGLINE_RUN_STYLE.italic,
  };
}

function getStyleAtNode(node: Node | null, editor: HTMLElement): TaglineRunStyle {
  let current: Node | null = node;

  while (current && current !== editor) {
    if (current instanceof HTMLElement && isTaglineMarkElement(current)) {
      return parseStyleFromMark(current);
    }

    current = current.parentNode;
  }

  return { ...DEFAULT_TAGLINE_RUN_STYLE };
}

type SelectionStyleState = {
  fontSize: TaglineFontSize;
  fontWeight: TaglineFontWeight;
  italic: boolean;
  sizeMixed: boolean;
  weightMixed: boolean;
  italicMixed: boolean;
};

function getTextNodesInRange(range: Range): Text[] {
  const nodes: Text[] = [];

  if (range.collapsed) {
    return nodes;
  }

  const ancestor = range.commonAncestorContainer;
  const root =
    ancestor.nodeType === Node.ELEMENT_NODE
      ? (ancestor as Element)
      : ancestor.parentElement;

  if (!root) {
    return nodes;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!range.intersectsNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }

      const text = node.textContent ?? "";
      if (!text) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  return nodes;
}

function getSelectedTextFromNode(range: Range, textNode: Text): string {
  const content = textNode.data;
  let start = 0;
  let end = content.length;

  if (range.startContainer === textNode) {
    start = range.startOffset;
  }

  if (range.endContainer === textNode) {
    end = range.endOffset;
  }

  return content.slice(start, end);
}

function getRunsFromRange(editor: HTMLElement, range: Range): TaglineRun[] {
  const textNodes = getTextNodesInRange(range);

  if (textNodes.length === 0) {
    const text = getRangeText(range);
    if (!text) {
      return [];
    }

    const style = getStyleAtNode(range.startContainer, editor);
    return [{ text, ...style }];
  }

  const runs = textNodes
    .map((textNode) => {
      const text = getSelectedTextFromNode(range, textNode);
      if (!text) {
        return null;
      }

      const style = getStyleAtNode(textNode, editor);
      return { text, ...style };
    })
    .filter((run): run is TaglineRun => run !== null);

  return mergeAdjacentRuns(runs);
}

function getSelectionStyleState(editor: HTMLElement, range: Range): SelectionStyleState {
  const sizes = new Set<TaglineFontSize>();
  const weights = new Set<TaglineFontWeight>();
  const italics = new Set<boolean>();

  const textNodes = getTextNodesInRange(range);

  if (textNodes.length === 0) {
    const style = getStyleAtNode(range.startContainer, editor);
    sizes.add(style.fontSize);
    weights.add(style.fontWeight);
    italics.add(style.italic);
  } else {
    textNodes.forEach((textNode) => {
      const style = getStyleAtNode(textNode, editor);
      sizes.add(style.fontSize);
      weights.add(style.fontWeight);
      italics.add(style.italic);
    });
  }

  const sizeValues = [...sizes];
  const weightValues = [...weights];
  const italicValues = [...italics];

  return {
    fontSize: sizeValues[0] ?? DEFAULT_TAGLINE_RUN_STYLE.fontSize,
    fontWeight: weightValues[0] ?? DEFAULT_TAGLINE_RUN_STYLE.fontWeight,
    italic: italicValues[0] ?? DEFAULT_TAGLINE_RUN_STYLE.italic,
    sizeMixed: sizeValues.length > 1,
    weightMixed: weightValues.length > 1,
    italicMixed: italicValues.length > 1,
  };
}

function setToolbarStyle(form: TaglinesEditorForm, state: SelectionStyleState) {
  const sizeSelect = form.querySelector<HTMLSelectElement>("[data-tagline-size-select]");
  const weightSelect = form.querySelector<HTMLSelectElement>("[data-tagline-weight-select]");
  const italicButton = form.querySelector<HTMLElement>("[data-tagline-italic]");

  if (sizeSelect) {
    sizeSelect.value = state.sizeMixed ? MIXED_SELECT_VALUE : state.fontSize;
  }

  if (weightSelect) {
    weightSelect.value = state.weightMixed ? MIXED_SELECT_VALUE : String(state.fontWeight);
  }

  if (italicButton) {
    const isItalic = state.italicMixed ? false : state.italic;
    italicButton.setAttribute("aria-pressed", isItalic ? "true" : "false");
    italicButton.classList.toggle("is-active", isItalic);
    italicButton.classList.toggle("is-mixed", state.italicMixed);
    italicButton.setAttribute("aria-label", state.italicMixed ? "Italic (mixed)" : "Italic");
  }
}

function updateToolbarStateFromSelection(form: TaglinesEditorForm) {
  const editor = getEditor(form);
  const selection = window.getSelection();

  if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) {
    return;
  }

  if (selection.isCollapsed || selection.rangeCount === 0) {
    const pending = pendingInputStyles.get(form);
    const style = pending ?? getStyleAtNode(selection.anchorNode, editor);
    setToolbarStyle(form, {
      ...style,
      sizeMixed: false,
      weightMixed: false,
      italicMixed: false,
    });
    return;
  }

  setToolbarStyle(form, getSelectionStyleState(editor, selection.getRangeAt(0)));
}

function runsToFragment(runs: TaglineRun[]): DocumentFragment {
  const fragment = document.createDocumentFragment();

  for (const run of mergeAdjacentRuns(runs)) {
    if (isDefaultTaglineRunStyle(run)) {
      fragment.appendChild(document.createTextNode(run.text));
      continue;
    }

    const span = document.createElement("span");
    span.className = getTaglineMarkClassName(run);
    span.dataset.taglineMark = "true";
    span.textContent = run.text;
    fragment.appendChild(span);
  }

  return fragment;
}

function applyPartialStyleToRange(
  editor: HTMLElement,
  range: Range,
  partialStyle: PartialTaglineRunStyle,
): boolean {
  if (range.collapsed || !editor.contains(range.commonAncestorContainer)) {
    return false;
  }

  const runs = getRunsFromRange(editor, range).filter((run) => run.text.length > 0);

  if (runs.length === 0) {
    return false;
  }

  const updatedRuns = runs.map((run) => ({
    text: run.text,
    ...mergeStyle({ ...run, ...partialStyle }),
  }));

  range.deleteContents();

  const fragment = runsToFragment(updatedRuns);
  const firstNode = fragment.firstChild;
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);

  const selection = window.getSelection();
  if (selection && firstNode && lastNode) {
    const mergedRange = document.createRange();
    mergedRange.setStartBefore(firstNode);
    mergedRange.setEndAfter(lastNode);
    selection.removeAllRanges();
    selection.addRange(mergedRange);
  }

  return true;
}

function stylesMatch(left: TaglineRunStyle, right: TaglineRunStyle): boolean {
  return (
    left.fontSize === right.fontSize &&
    left.fontWeight === right.fontWeight &&
    left.italic === right.italic
  );
}

function placeCaretInTextNode(textNode: Text, offset: number, selection: Selection) {
  const nextRange = document.createRange();
  nextRange.setStart(textNode, offset);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function createMarkSpan(style: TaglineRunStyle, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = getTaglineMarkClassName(style);
  span.dataset.taglineMark = "true";
  span.textContent = text;
  return span;
}

function cloneMarkWithText(mark: HTMLElement, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = mark.className;
  span.dataset.taglineMark = "true";
  span.textContent = text;
  return span;
}

function insertStyledTextBreakingMark(
  mark: HTMLElement,
  textNode: Text,
  offset: number,
  text: string,
  style: TaglineRunStyle,
  selection: Selection,
) {
  const parent = mark.parentNode;
  if (!parent) {
    return;
  }

  const before = textNode.data.slice(0, offset);
  const after = textNode.data.slice(offset);
  const fragment = document.createDocumentFragment();

  if (before) {
    fragment.appendChild(cloneMarkWithText(mark, before));
  }

  const newSpan = createMarkSpan(style, text);
  fragment.appendChild(newSpan);

  if (after) {
    fragment.appendChild(cloneMarkWithText(mark, after));
  }

  parent.insertBefore(fragment, mark);
  mark.remove();

  const newTextNode = newSpan.firstChild;
  if (newTextNode?.nodeType === Node.TEXT_NODE) {
    placeCaretInTextNode(newTextNode as Text, text.length, selection);
  }
}

function insertStyledTextAtSelection(
  editor: HTMLElement,
  text: string,
  style: TaglineRunStyle,
) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return;
  }

  if (!range.collapsed) {
    range.deleteContents();
  }

  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const mark = range.startContainer.parentElement;
    if (mark && isTaglineMarkElement(mark)) {
      const textNode = range.startContainer as Text;
      const offset = range.startOffset;

      if (stylesMatch(parseStyleFromMark(mark), style)) {
        const current = textNode.data;
        textNode.data = `${current.slice(0, offset)}${text}${current.slice(offset)}`;
        placeCaretInTextNode(textNode, offset + text.length, selection);
        return;
      }

      insertStyledTextBreakingMark(mark, textNode, offset, text, style, selection);
      return;
    }
  }

  if (range.collapsed && range.startContainer.nodeType === Node.ELEMENT_NODE) {
    const container = range.startContainer as HTMLElement;
    const nodeBefore =
      range.startOffset > 0 ? container.childNodes[range.startOffset - 1] : null;

    if (
      nodeBefore instanceof HTMLElement &&
      isTaglineMarkElement(nodeBefore) &&
      stylesMatch(parseStyleFromMark(nodeBefore), style)
    ) {
      const textNode = nodeBefore.firstChild;
      if (textNode?.nodeType === Node.TEXT_NODE) {
        const textElement = textNode as Text;
        const nextOffset = textElement.data.length + text.length;
        textElement.data += text;
        placeCaretInTextNode(textElement, nextOffset, selection);
        return;
      }
    }
  }

  const span = createMarkSpan(style, text);
  range.insertNode(span);

  const textNode = span.firstChild;
  if (textNode?.nodeType === Node.TEXT_NODE) {
    const textElement = textNode as Text;
    placeCaretInTextNode(textElement, textElement.data.length, selection);
    return;
  }

  const nextRange = document.createRange();
  nextRange.setStartAfter(span);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function applyPendingStyleAtCaret(
  form: TaglinesEditorForm,
  editor: HTMLElement,
  selection: Selection,
  partialStyle: PartialTaglineRunStyle,
): boolean {
  const anchorNode = selection.anchorNode;
  if (!anchorNode) {
    return false;
  }

  const baseStyle =
    pendingInputStyles.get(form) ?? getStyleAtNode(anchorNode, editor);
  const nextStyle = mergeStyle({ ...baseStyle, ...partialStyle });
  pendingInputStyles.set(form, nextStyle);
  setToolbarStyle(form, {
    fontSize: nextStyle.fontSize,
    fontWeight: nextStyle.fontWeight,
    italic: nextStyle.italic,
    sizeMixed: false,
    weightMixed: false,
    italicMixed: false,
  });

  return true;
}

function applyStyleToSelection(form: TaglinesEditorForm, partialStyle: PartialTaglineRunStyle) {
  const editor = getEditor(form);
  if (!editor) {
    window.alert("Click inside the tagline editor to start editing.");
    return false;
  }

  const selection = window.getSelection();
  if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) {
    window.alert("Select text inside the tagline editor first.");
    return false;
  }

  editor.focus();

  if (shouldUsePendingStyle(selection)) {
    if (!selection.isCollapsed && selection.rangeCount > 0) {
      collapseSelectionToEnd(selection);
    }

    return applyPendingStyleAtCaret(form, editor, selection, partialStyle);
  }

  const applied = applyPartialStyleToRange(editor, selection.getRangeAt(0), partialStyle);

  if (applied) {
    pendingInputStyles.delete(form);
    updateToolbarStateFromSelection(form);
  }

  return applied;
}

function serializeForm(form: TaglinesEditorForm, options?: { silent?: boolean }) {
  const editor = getEditor(form);
  const hiddenJson = getHiddenJson(form);
  if (!editor || !hiddenJson) {
    return false;
  }

  const items = serializeEditorToItems(editor);

  if (items.length === 0) {
    if (!options?.silent) {
      window.alert("At least one tagline is required.");
    }
    return false;
  }

  hiddenJson.value = JSON.stringify(items);
  return true;
}

async function readAdminJsonResponse(response: Response): Promise<AdminActionJsonResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected server response. Please refresh and try again.");
  }

  return (await response.json()) as AdminActionJsonResponse;
}

async function submitTaglinesAction(
  form: TaglinesEditorForm,
  formData: FormData,
): Promise<AdminActionJsonResponse> {
  const response = await fetch(ADMIN_JSON_ACTION_PATH, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const result = await readAdminJsonResponse(response);
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to update taglines.");
  }

  return result;
}

function updateCurrentContent(form: TaglinesEditorForm, content: Record<string, unknown>) {
  const currentContentInput = getCurrentContentInput(form);
  if (currentContentInput) {
    currentContentInput.value = JSON.stringify(content);
  }
}

function getTaglinesPreviewSurface(form: TaglinesEditorForm): HTMLElement | null {
  const sectionId = form.querySelector<HTMLInputElement>('input[name="sectionId"]')?.value?.trim();
  if (sectionId) {
    const linkedSurface = document.querySelector<HTMLElement>(
      `[data-taglines-preview-root="${sectionId}"] .tagline-display-stack`,
    );
    if (linkedSurface) {
      return linkedSurface;
    }
  }

  return (
    form
      .closest(".admin-content-editable--taglines")
      ?.querySelector<HTMLElement>(".admin-content-editable__surface .tagline-display-stack") ??
    null
  );
}

function syncTaglinesPreviewFromItems(form: TaglinesEditorForm, items: TaglineItem[]) {
  const surface = getTaglinesPreviewSurface(form);
  if (!surface) {
    return;
  }

  surface.innerHTML = renderTaglineDisplayStackHtml(items);
}

function syncTaglinesPreview(form: TaglinesEditorForm, content: Record<string, unknown>) {
  syncTaglinesPreviewFromItems(form, normalizeTaglineItems(content.items));
}

function updateOptimisticSectionContent(form: TaglinesEditorForm, items: TaglineItem[]) {
  const currentContentInput = getCurrentContentInput(form);
  if (!currentContentInput?.value) {
    return;
  }

  try {
    const content = JSON.parse(currentContentInput.value) as Record<string, unknown>;
    updateCurrentContent(form, { ...content, items });
  } catch {
    // Keep the existing baseline when current content is unavailable.
  }
}

function commitTaglinesDraft(form: TaglinesEditorForm): boolean {
  if (!serializeForm(form, { silent: true })) {
    return false;
  }

  const hiddenJson = getHiddenJson(form);
  if (!hiddenJson) {
    return false;
  }

  const items = JSON.parse(hiddenJson.value) as TaglineItem[];
  syncTaglinesPreviewFromItems(form, items);
  updateOptimisticSectionContent(form, items);
  return true;
}

function revertTaglinesDraft(form: TaglinesEditorForm) {
  const lastSaved = lastSavedPayloads.get(form);
  if (!lastSaved) {
    return;
  }

  const hiddenJson = getHiddenJson(form);
  if (hiddenJson) {
    hiddenJson.value = lastSaved;
  }

  try {
    const items = JSON.parse(lastSaved) as TaglineItem[];
    syncTaglinesPreviewFromItems(form, items);
    updateOptimisticSectionContent(form, items);

    const editor = getEditor(form);
    if (editor) {
      populateEditor(editor, items);
    }
  } catch {
    // Ignore invalid rollback payloads.
  }
}

function setFormSaving(form: TaglinesEditorForm, saving: boolean) {
  form.dataset[SAVING_FLAG] = saving ? "true" : "false";
}

function clearScheduledSave(form: TaglinesEditorForm) {
  const timer = saveTimers.get(form);
  if (timer !== undefined) {
    clearTimeout(timer);
    saveTimers.delete(form);
  }
}

function scheduleTaglinesSave(form: TaglinesEditorForm, delay = SAVE_DEBOUNCE_MS) {
  clearScheduledSave(form);

  const timer = window.setTimeout(() => {
    saveTimers.delete(form);
    void saveTaglines(form);
  }, delay);

  saveTimers.set(form, timer);
}

async function saveTaglines(form: TaglinesEditorForm) {
  if (!serializeForm(form, { silent: true })) {
    return;
  }

  const hiddenJson = getHiddenJson(form);
  if (!hiddenJson) {
    return;
  }

  const payload = hiddenJson.value;
  if (payload === lastSavedPayloads.get(form)) {
    return;
  }

  if (form.dataset[SAVING_FLAG] === "true") {
    scheduleTaglinesSave(form, SAVE_DEBOUNCE_MS);
    return;
  }

  setFormSaving(form, true);
  try {
    const formData = new FormData(form);
    const result = await submitTaglinesAction(form, formData);
    lastSavedPayloads.set(form, payload);

    if (result.sectionContent) {
      updateCurrentContent(form, result.sectionContent);
      syncTaglinesPreview(form, result.sectionContent);
    }
  } catch (error) {
    revertTaglinesDraft(form);
    window.alert(error instanceof Error ? error.message : "Unable to update taglines.");
  } finally {
    setFormSaving(form, false);
  }
}

function saveEditorSelection(form: TaglinesEditorForm) {
  const editor = getEditor(form);
  const selection = window.getSelection();

  if (!editor || !selection || selection.rangeCount === 0) {
    savedSelections.delete(form);
    return;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    savedSelections.delete(form);
    return;
  }

  savedSelections.set(form, range.cloneRange());
}

function restoreEditorSelection(form: TaglinesEditorForm) {
  const savedRange = savedSelections.get(form);
  const selection = window.getSelection();

  if (!savedRange || !selection) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(savedRange);
}

function bindStyleSelect(
  form: TaglinesEditorForm,
  select: HTMLSelectElement,
  onApply: (value: string) => void,
  signal: AbortSignal,
) {
  select.addEventListener(
    "pointerdown",
    (event) => {
      event.stopPropagation();
      saveEditorSelection(form);
    },
    { signal },
  );

  select.addEventListener(
    "mousedown",
    (event) => {
      event.stopPropagation();
    },
    { signal },
  );

  select.addEventListener(
    "change",
    () => {
      if (select.value === MIXED_SELECT_VALUE) {
        return;
      }

      restoreEditorSelection(form);
      onApply(select.value);
      getEditor(form)?.focus();
    },
    { signal },
  );
}

function runEditorCommand(form: TaglinesEditorForm, command: string) {
  const editor = getEditor(form);
  if (!editor) {
    return;
  }

  editor.focus();
  document.execCommand(command, false);
  normalizeEditorLines(editor);
  commitTaglinesDraft(form);
  scheduleTaglinesSave(form);
}

function applyToolbarStyle(form: TaglinesEditorForm, partialStyle: PartialTaglineRunStyle) {
  if (!applyStyleToSelection(form, partialStyle)) {
    return;
  }

  const editor = getEditor(form);
  if (editor) {
    normalizeEditorLines(editor);
  }

  commitTaglinesDraft(form);
  scheduleTaglinesSave(form, 0);
}

function unbindTaglinesForm(form: TaglinesEditorForm) {
  bindAbortControllers.get(form)?.abort();
  bindAbortControllers.delete(form);
  delete form.dataset.taglinesBound;
}

function bindTaglinesForm(form: TaglinesEditorForm) {
  if (form.dataset.taglinesBound === "true") {
    return;
  }

  unbindTaglinesForm(form);

  const controller = new AbortController();
  bindAbortControllers.set(form, controller);
  const { signal } = controller;

  form.dataset.taglinesBound = "true";
  const panel = getPanel(form);
  const editor = getEditor(form);

  panel
    ?.querySelectorAll<HTMLButtonElement>("[data-tagline-command], [data-tagline-italic]")
    .forEach((control) => {
      control.addEventListener(
        "mousedown",
        (event) => {
          event.preventDefault();
        },
        { signal },
      );
    });

  panel?.querySelectorAll<HTMLButtonElement>("[data-tagline-command]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const command = button.dataset.taglineCommand;
        if (!command) {
          return;
        }

        runEditorCommand(form, command);
      },
      { signal },
    );
  });

  const italicButton = form.querySelector<HTMLButtonElement>("[data-tagline-italic]");
  italicButton?.addEventListener(
    "click",
    () => {
      const editor = getEditor(form);
      const selection = window.getSelection();
      if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) {
        window.alert("Select text inside the tagline editor first.");
        return;
      }

      let nextItalic: boolean;
      if (shouldUsePendingStyle(selection)) {
        const baseStyle =
          pendingInputStyles.get(form) ?? getStyleAtNode(selection.anchorNode, editor);
        nextItalic = !baseStyle.italic;
      } else {
        const state = getSelectionStyleState(editor, selection.getRangeAt(0));
        nextItalic = state.italicMixed ? true : !state.italic;
      }

      applyToolbarStyle(form, { italic: nextItalic });
    },
    { signal },
  );

  const sizeSelect = form.querySelector<HTMLSelectElement>("[data-tagline-size-select]");
  if (sizeSelect) {
    bindStyleSelect(
      form,
      sizeSelect,
      (value) => {
        applyToolbarStyle(form, {
          fontSize: (value ?? DEFAULT_TAGLINE_RUN_STYLE.fontSize) as TaglineFontSize,
        });
      },
      signal,
    );
  }

  const weightSelect = form.querySelector<HTMLSelectElement>("[data-tagline-weight-select]");
  if (weightSelect) {
    bindStyleSelect(
      form,
      weightSelect,
      (value) => {
        applyToolbarStyle(form, {
          fontWeight: Number(
            value ?? DEFAULT_TAGLINE_RUN_STYLE.fontWeight,
          ) as TaglineFontWeight,
        });
      },
      signal,
    );
  }

  editor?.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      document.execCommand("insertParagraph", false);
      normalizeEditorLines(editor);
      commitTaglinesDraft(form);
      scheduleTaglinesSave(form);
    },
    { signal },
  );

  editor?.addEventListener(
    "beforeinput",
    (event) => {
      const pendingStyle = pendingInputStyles.get(form);
      if (!pendingStyle) {
        return;
      }

      if (event.inputType !== "insertText" && event.inputType !== "insertReplacementText") {
        return;
      }

      const text = event.data;
      if (text === null || text === undefined) {
        return;
      }

      event.preventDefault();
      skipNextInputEvent.set(form, true);
      insertStyledTextAtSelection(editor, text, pendingStyle);
      normalizeEditorLines(editor);
      commitTaglinesDraft(form);
      scheduleTaglinesSave(form);
    },
    { signal },
  );

  editor?.addEventListener(
    "input",
    () => {
      if (skipNextInputEvent.get(form)) {
        skipNextInputEvent.delete(form);
        return;
      }

      normalizeEditorLines(editor);
      commitTaglinesDraft(form);
      scheduleTaglinesSave(form);
    },
    { signal },
  );

  editor?.addEventListener(
    "keyup",
    () => {
      updateToolbarStateFromSelection(form);
    },
    { signal },
  );

  editor?.addEventListener(
    "mouseup",
    () => {
      updateToolbarStateFromSelection(form);
    },
    { signal },
  );

  document.addEventListener(
    "selectionchange",
    () => {
      updateToolbarStateFromSelection(form);
    },
    { signal },
  );

  editor?.addEventListener(
    "focusout",
    () => {
      commitTaglinesDraft(form);
      void saveTaglines(form);
    },
    { capture: true, signal },
  );

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
    },
    { signal },
  );
}

export function initTaglinesEditors(options?: { rebind?: boolean }) {
  document.querySelectorAll<TaglinesEditorForm>("[data-taglines-form]").forEach((form) => {
    if (options?.rebind) {
      unbindTaglinesForm(form);
    }

    if (form.dataset.taglinesBound === "true") {
      return;
    }

    const hiddenJson = getHiddenJson(form);
    const editor = getEditor(form);

    if (hiddenJson?.value && editor) {
      try {
        const items = JSON.parse(hiddenJson.value) as TaglineItem[];
        lastSavedPayloads.set(form, hiddenJson.value);
        populateEditor(editor, items);
      } catch {
        // Keep server-rendered defaults when JSON is unavailable.
      }
    }

    bindTaglinesForm(form);
    updateToolbarStateFromSelection(form);
  });
}
