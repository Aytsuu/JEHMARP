const LAST_AUTO_RETRY_KEY = "system-issue:last-auto-retry";
const BOUNCE_WINDOW_MS = 2_000;

type LastAutoRetry = {
  returnTo: string;
  at: number;
};

type SystemIssueAutoRetryOptions = {
  now?: number;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  location?: Pick<Location, "replace">;
};

export function readLastSystemIssueAutoRetry(
  storage: Pick<Storage, "getItem"> = sessionStorage,
): LastAutoRetry | null {
  const raw = storage.getItem(LAST_AUTO_RETRY_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as LastAutoRetry;

    if (typeof parsed.returnTo !== "string" || typeof parsed.at !== "number") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function getSystemIssueAutoRetryDecision(
  returnTo: string,
  now = Date.now(),
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = sessionStorage,
) {
  if (!returnTo || returnTo === "/") {
    return { shouldRetry: false as const };
  }

  const lastRetry = readLastSystemIssueAutoRetry(storage);

  if (
    lastRetry &&
    lastRetry.returnTo === returnTo &&
    now - lastRetry.at < BOUNCE_WINDOW_MS
  ) {
    storage.removeItem(LAST_AUTO_RETRY_KEY);
    return { shouldRetry: false as const };
  }

  storage.setItem(
    LAST_AUTO_RETRY_KEY,
    JSON.stringify({
      returnTo,
      at: now,
    } satisfies LastAutoRetry),
  );

  return { shouldRetry: true as const };
}

export function clearSystemIssueRetryState(
  storage: Pick<Storage, "removeItem"> = sessionStorage,
) {
  storage.removeItem(LAST_AUTO_RETRY_KEY);
}

export function initSystemIssueAutoRetry(
  returnTo: string,
  options: SystemIssueAutoRetryOptions = {},
) {
  const decision = getSystemIssueAutoRetryDecision(
    returnTo,
    options.now,
    options.storage,
  );

  if (decision.shouldRetry) {
    (options.location ?? window.location).replace(returnTo);
  }
}

export function initSystemIssueAutoRetryFromDocument(
  root: Pick<ParentNode, "querySelector"> = document,
  options: SystemIssueAutoRetryOptions = {},
) {
  const retryLink = root.querySelector<HTMLAnchorElement>("[data-system-issue-retry]");
  const returnTo = retryLink?.getAttribute("href")?.trim() ?? "";

  initSystemIssueAutoRetry(returnTo, options);
}
