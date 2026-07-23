import { describe, expect, it } from "vitest";

import {
  clearSystemIssueRetryState,
  getSystemIssueAutoRetryDecision,
  initSystemIssueAutoRetryFromDocument,
  readLastSystemIssueAutoRetry,
} from "./system-issue-retry";

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("system issue auto retry", () => {
  it("retries a safe return path on first visit", () => {
    const storage = createStorage();

    expect(
      getSystemIssueAutoRetryDecision("/admin/invoices", 1_000, storage),
    ).toEqual({ shouldRetry: true });
    expect(readLastSystemIssueAutoRetry(storage)).toEqual({
      returnTo: "/admin/invoices",
      at: 1_000,
    });
  });

  it("does not retry when no return path is available", () => {
    const storage = createStorage();

    expect(getSystemIssueAutoRetryDecision("/", 1_000, storage)).toEqual({
      shouldRetry: false,
    });
    expect(readLastSystemIssueAutoRetry(storage)).toBeNull();
  });

  it("stops auto retrying when the page bounces back immediately", () => {
    const storage = createStorage();

    expect(
      getSystemIssueAutoRetryDecision("/admin/invoices", 1_000, storage).shouldRetry,
    ).toBe(true);
    expect(
      getSystemIssueAutoRetryDecision("/admin/invoices", 1_500, storage).shouldRetry,
    ).toBe(false);
    expect(readLastSystemIssueAutoRetry(storage)).toBeNull();
  });

  it("retries again after a manual reload once the bounce window has passed", () => {
    const storage = createStorage();

    getSystemIssueAutoRetryDecision("/admin/invoices", 1_000, storage);
    getSystemIssueAutoRetryDecision("/admin/invoices", 1_500, storage);

    expect(
      getSystemIssueAutoRetryDecision("/admin/invoices", 4_000, storage).shouldRetry,
    ).toBe(true);
  });

  it("resets the retry marker after a successful page load", () => {
    const storage = createStorage();

    getSystemIssueAutoRetryDecision("/admin/invoices", 1_000, storage);
    clearSystemIssueRetryState(storage);

    expect(readLastSystemIssueAutoRetry(storage)).toBeNull();
    expect(
      getSystemIssueAutoRetryDecision("/admin/invoices", 1_100, storage).shouldRetry,
    ).toBe(true);
  });

  it("processes the retry link from the system issue page on initial render", () => {
    const storage = createStorage();
    const replaceCalls: string[] = [];
    const root = document.createElement("main");
    root.innerHTML = `
      <a href="/admin/customers" data-system-issue-retry>Try again</a>
    `;

    initSystemIssueAutoRetryFromDocument(root, {
      now: 1_000,
      storage,
      location: {
        replace: (path: string) => {
          replaceCalls.push(path);
        },
      },
    });

    expect(replaceCalls).toEqual(["/admin/customers"]);
    expect(readLastSystemIssueAutoRetry(storage)).toEqual({
      returnTo: "/admin/customers",
      at: 1_000,
    });
  });
});
