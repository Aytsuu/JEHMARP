export type TaglineFontSize = "sm" | "md" | "lg" | "xl";
export type TaglineFontWeight = 400 | 500 | 600 | 700;

export type TaglineRunStyle = {
  fontSize: TaglineFontSize;
  fontWeight: TaglineFontWeight;
  italic: boolean;
};

export type TaglineRun = TaglineRunStyle & {
  text: string;
};

export type TaglineItem = {
  runs: TaglineRun[];
};

export const DEFAULT_TAGLINE_FONT_SIZE: TaglineFontSize = "lg";
export const DEFAULT_TAGLINE_FONT_WEIGHT: TaglineFontWeight = 600;

export const TAGLINE_FONT_SIZES: TaglineFontSize[] = ["sm", "md", "lg", "xl"];
export const TAGLINE_FONT_WEIGHTS: TaglineFontWeight[] = [400, 500, 600, 700];

export const DEFAULT_TAGLINE_RUN_STYLE: TaglineRunStyle = {
  fontSize: DEFAULT_TAGLINE_FONT_SIZE,
  fontWeight: DEFAULT_TAGLINE_FONT_WEIGHT,
  italic: false,
};

export function createDefaultTaglineRun(text: string): TaglineRun {
  return {
    text,
    ...DEFAULT_TAGLINE_RUN_STYLE,
  };
}

export function createDefaultTaglineItem(text: string): TaglineItem {
  const trimmed = text.trim();
  return {
    runs: trimmed.length > 0 ? [createDefaultTaglineRun(trimmed)] : [],
  };
}

function parseTaglineFontSize(value: unknown): TaglineFontSize {
  return typeof value === "string" && TAGLINE_FONT_SIZES.includes(value as TaglineFontSize)
    ? (value as TaglineFontSize)
    : DEFAULT_TAGLINE_FONT_SIZE;
}

function parseTaglineFontWeight(value: unknown): TaglineFontWeight {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return TAGLINE_FONT_WEIGHTS.includes(numeric as TaglineFontWeight)
    ? (numeric as TaglineFontWeight)
    : DEFAULT_TAGLINE_FONT_WEIGHT;
}

function parseTaglineRunStyle(record: Record<string, unknown>): TaglineRunStyle {
  return {
    fontSize: parseTaglineFontSize(record.fontSize),
    fontWeight: parseTaglineFontWeight(record.fontWeight),
    italic: record.italic === true,
  };
}

function parseTaglineRun(value: unknown): TaglineRun | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";

  if (!text) {
    return null;
  }

  return {
    text,
    ...parseTaglineRunStyle(record),
  };
}

function runsFromLegacyRecord(record: Record<string, unknown>): TaglineRun[] | null {
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) {
    return null;
  }

  return [
    {
      text,
      ...parseTaglineRunStyle(record),
    },
  ];
}

function runsFromHtml(html: string): TaglineRun[] {
  const runs: TaglineRun[] = [];
  const pattern =
    /<span\b[^>]*class="([^"]*tagline-mark[^"]*)"[^>]*>([\s\S]*?)<\/span>|([^<]+)/gi;

  let match = pattern.exec(html);
  while (match) {
    if (match[3]) {
      runs.push(createDefaultTaglineRun(match[3]));
    } else if (match[1] && match[2] !== undefined) {
      runs.push({
        text: decodeHtmlEntities(stripHtml(match[2])),
        ...parseTaglineRunStyleFromClassName(match[1]),
      });
    }

    match = pattern.exec(html);
  }

  const merged = mergeAdjacentRuns(runs).filter((run) => run.text.length > 0);
  return merged.length > 0 ? merged : [createDefaultTaglineRun(stripHtml(html))];
}

function parseTaglineRunStyleFromClassName(className: string): TaglineRunStyle {
  const classes = className.split(/\s+/);
  const fontSize =
    TAGLINE_FONT_SIZES.find((size) => classes.includes(`tagline-mark--size-${size}`)) ??
    DEFAULT_TAGLINE_FONT_SIZE;
  const fontWeight =
    TAGLINE_FONT_WEIGHTS.find((weight) =>
      classes.includes(`tagline-mark--weight-${weight}`),
    ) ?? DEFAULT_TAGLINE_FONT_WEIGHT;
  const italic = classes.includes("tagline-mark--italic");

  return { fontSize, fontWeight, italic };
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ""));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function escapeTaglineText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function isDefaultTaglineRunStyle(style: TaglineRunStyle): boolean {
  return (
    style.fontSize === DEFAULT_TAGLINE_FONT_SIZE &&
    style.fontWeight === DEFAULT_TAGLINE_FONT_WEIGHT &&
    style.italic === false
  );
}

export function getTaglineMarkClassName(style: TaglineRunStyle): string {
  const classes = [
    "tagline-mark",
    `tagline-mark--size-${style.fontSize}`,
    `tagline-mark--weight-${style.fontWeight}`,
  ];

  if (style.italic) {
    classes.push("tagline-mark--italic");
  }

  return classes.join(" ");
}

export function mergeAdjacentRuns(runs: TaglineRun[]): TaglineRun[] {
  return runs.reduce<TaglineRun[]>((merged, run) => {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.fontSize === run.fontSize &&
      previous.fontWeight === run.fontWeight &&
      previous.italic === run.italic
    ) {
      merged[merged.length - 1] = {
        ...previous,
        text: previous.text + run.text,
      };
      return merged;
    }

    merged.push({ ...run });
    return merged;
  }, []);
}

export function getTaglinePlainText(item: TaglineItem): string {
  return item.runs.map((run) => run.text).join("").trim();
}

export function normalizeTaglineItem(value: unknown): TaglineItem | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? createDefaultTaglineItem(text) : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (Array.isArray(record.runs)) {
    const runs = mergeAdjacentRuns(
      record.runs.flatMap((run) => {
        const parsed = parseTaglineRun(run);
        return parsed ? [parsed] : [];
      }),
    );

    return getTaglinePlainText({ runs }).length > 0 ? { runs } : null;
  }

  if (typeof record.html === "string" && record.html.trim().length > 0) {
    const runs = runsFromHtml(record.html.trim());
    return getTaglinePlainText({ runs }).length > 0 ? { runs } : null;
  }

  const legacyRuns = runsFromLegacyRecord(record);
  return legacyRuns ? { runs: legacyRuns } : null;
}

export function normalizeTaglineItems(value: unknown): TaglineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const normalized = normalizeTaglineItem(item);
    return normalized ? [normalized] : [];
  });
}

export function parseTaglineItemsEditorPayload(value: unknown): TaglineItem[] {
  let parsed: unknown = value;

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error("At least one tagline is required.");
    }

    if (trimmed.includes("\n") && !trimmed.startsWith("[")) {
      return taglineItemsFromPlainText(trimmed);
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("Taglines must be valid JSON.");
    }
  }

  const items = normalizeTaglineItems(parsed);

  if (items.length === 0 || items.every((item) => getTaglinePlainText(item).length === 0)) {
    throw new Error("At least one tagline is required.");
  }

  return items;
}

export function renderTaglineRunsToHtml(runs: TaglineRun[]): string {
  return mergeAdjacentRuns(runs)
    .map((run) => {
      if (isDefaultTaglineRunStyle(run)) {
        return escapeTaglineText(run.text);
      }

      return `<span class="${getTaglineMarkClassName(run)}" data-tagline-mark="true">${escapeTaglineText(run.text)}</span>`;
    })
    .join("");
}

export function renderTaglineDisplayStackHtml(items: TaglineItem[]): string {
  if (items.length === 0) {
    return `<p class="tagline-headline tagline-headline--placeholder">Taglines have not been added yet.</p>`;
  }

  return items
    .map(
      (item) =>
        `<p class="tagline-headline">${renderTaglineRunsToHtml(item.runs)}</p>`,
    )
    .join("");
}

export function renderTaglinesEditorHtml(items: TaglineItem[]): string {
  if (items.length === 0) {
    return "";
  }

  return items
    .map(
      (item) =>
        `<div data-tagline-line="true">${renderTaglineRunsToHtml(item.runs)}</div>`,
    )
    .join("");
}

export function taglineItemsFromPlainText(value: string): TaglineItem[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => createDefaultTaglineItem(line));
}
