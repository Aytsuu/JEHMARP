import { describe, expect, it, vi } from "vitest";

import {
  buildSafeRequestTarget,
  logDevelopmentActionError,
  logDevelopmentLoadError,
  logDevelopmentRequest,
} from "./request-logger";

describe("development request logger", () => {
  it("logs a concise request line with redacted query values", () => {
    const logger = vi.fn();

    logDevelopmentRequest({
      enabled: true,
      logger,
      method: "GET",
      url: new URL("https://example.test/admin/orders?status=pending&page=2"),
      status: 200,
      durationMs: 12.6,
    });

    expect(logger).toHaveBeenCalledWith(
      "[dev:request] GET /admin/orders?page=[set]&status=[set] -> 200 13ms",
    );
  });

  it("does not log when development logging is disabled", () => {
    const logger = vi.fn();

    logDevelopmentRequest({
      enabled: false,
      logger,
      method: "POST",
      url: new URL("https://example.test/api/login"),
      status: 303,
      durationMs: 4,
    });

    expect(logger).not.toHaveBeenCalled();
  });

  it("redacts sensitive path segments and sensitive query values", () => {
    expect(
      buildSafeRequestTarget(
        new URL(
          "https://example.test/customer-registration/sensitive-token?token=secret&next=/shop",
        ),
      ),
    ).toBe("/customer-registration/[token]?next=[set]&token=[redacted]");
  });

  it("logs load errors with a safe request target and cause in development", () => {
    const logger = vi.fn();
    const error = new Error("Unable to load admin role.", {
      cause: {
        code: "42501",
        message: "permission denied for table admin_role",
      },
    });
    error.name = "LoadError";

    logDevelopmentLoadError({
      enabled: true,
      logger,
      error,
      url: new URL("https://example.test/dashboard?token=secret"),
    });

    expect(logger).toHaveBeenCalledWith(
      "[dev:load-error] /dashboard?token=[redacted] LoadError: Unable to load admin role. cause=code=42501 message=permission denied for table admin_role",
    );
  });

  it("logs action errors with action name and safe request target in development", () => {
    const logger = vi.fn();

    logDevelopmentActionError({
      action: "attach-agent-order-customer",
      enabled: true,
      error: new Error("First name is required."),
      logger,
      phase: "validation",
      scope: "admin",
      url: new URL("https://example.test/admin/orders/agent/abc?error=secret"),
    });

    expect(logger).toHaveBeenCalledWith(
      "[dev:action-error] admin attach-agent-order-customer validation /admin/orders/agent/abc?error=[set] Error: First name is required.",
    );
  });
});
