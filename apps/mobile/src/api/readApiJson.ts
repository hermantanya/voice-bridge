export async function readApiJson<T extends Record<string, unknown>>(
  response: Response,
): Promise<T> {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(
      response.ok
        ? "Server returned an empty response"
        : `Server error (${response.status}) with empty body`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const snippet = raw.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      response.ok
        ? "Server returned a non-JSON response"
        : `Server error (${response.status}): ${snippet}`,
    );
  }
}
