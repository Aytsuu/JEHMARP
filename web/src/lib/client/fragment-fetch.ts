export async function readFragmentResponse(response: Response): Promise<string> {
  if (response.status === 503) {
    const redirectUrl = response.headers.get("X-System-Issue-Redirect") || "/system-issue";
    window.location.assign(redirectUrl);
    throw new DOMException("Aborted", "AbortError");
  }

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}.`);
  }

  return response.text();
}
