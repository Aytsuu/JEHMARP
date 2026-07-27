import { describe, expect, it } from "vitest";

import {
  EdgeFunctionRequestError,
  assertEdgeFunctionSuccess,
  getEdgeFunctionErrorMessage,
} from "./edge-function-response";

describe("edge-function-response", () => {
  it("prefers edge function error messages", () => {
    const response = new Response(null, { status: 429 });

    expect(
      getEdgeFunctionErrorMessage(
        { error: "Too many applications were submitted from this email." },
        response,
        "Unable to submit reseller application.",
      ),
    ).toBe("Too many applications were submitted from this email.");
  });

  it("maps Supabase gateway messages into a user-facing error", () => {
    const response = new Response(null, { status: 503 });

    expect(
      getEdgeFunctionErrorMessage(
        { message: "name resolution failed" },
        response,
        "Unable to submit reseller application.",
      ),
    ).toContain("supabase functions serve");
  });

  it("throws when the edge function response is missing an id", async () => {
    const response = new Response(JSON.stringify({ message: "name resolution failed" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });

    await expect(
      assertEdgeFunctionSuccess(response, "Unable to submit reseller application."),
    ).rejects.toBeInstanceOf(EdgeFunctionRequestError);
  });

  it("returns the parsed body when the edge function succeeds", async () => {
    const response = new Response(
      JSON.stringify({ id: "reseller-application-id", emailDeliveryStatus: "sent" }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );

    await expect(
      assertEdgeFunctionSuccess(response, "Unable to submit reseller application."),
    ).resolves.toEqual({
      id: "reseller-application-id",
      emailDeliveryStatus: "sent",
    });
  });
});
