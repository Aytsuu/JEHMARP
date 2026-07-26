export function readJsonResponseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})).then((data) =>
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {},
  );
}

export function getEdgeFunctionErrorMessage(
  body: Record<string, unknown>,
  response: Response,
  fallback: string,
): string {
  if (typeof body.error === "string" && body.error.trim().length > 0) {
    return body.error.trim();
  }

  if (typeof body.message === "string" && body.message.trim().length > 0) {
    return mapGatewayMessage(body.message.trim(), response.status);
  }

  if (response.status === 503) {
    return "The submission service is temporarily unavailable. Please try again shortly.";
  }

  return fallback;
}

function mapGatewayMessage(message: string, status: number): string {
  if (status === 503 || message === "name resolution failed") {
    return "The submission service is temporarily unavailable. If you are developing locally, start Supabase Edge Functions with `supabase functions serve`.";
  }

  return message;
}

export class EdgeFunctionRequestError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.name = "EdgeFunctionRequestError";
    this.status = status;
    this.body = body;
  }
}

export async function assertEdgeFunctionSuccess(
  response: Response,
  fallbackMessage: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonResponseBody(response);

  if (!response.ok || typeof body.id !== "string") {
    throw new EdgeFunctionRequestError(
      getEdgeFunctionErrorMessage(body, response, fallbackMessage),
      response.status,
      body,
    );
  }

  return body;
}
