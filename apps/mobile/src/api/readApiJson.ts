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
    const preMatch = raw.match(/<pre>([^<]+)<\/pre>/i);
    const snippet =
      preMatch?.[1]?.trim() ??
      raw.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(
      response.ok
        ? "Server returned a non-JSON response"
        : `Server error (${response.status}): ${snippet}`,
    );
  }
}
