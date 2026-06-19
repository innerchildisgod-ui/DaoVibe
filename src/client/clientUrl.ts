export type ClientQueryValue = string | number | undefined;

export function normalizeClientBaseUrl(baseUrl: string): string {
  const trimmedBaseUrl = baseUrl.trim();

  if (!trimmedBaseUrl) {
    throw new Error("baseUrl is required");
  }

  return trimmedBaseUrl.replace(/\/+$/, "");
}

export function buildClientUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, ClientQueryValue>
): string {
  const normalizedBaseUrl = normalizeClientBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBaseUrl}${normalizedPath}`);

  if (query) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }

    const queryText = params.toString();

    if (queryText) {
      url.search = queryText;
    }
  }

  return url.toString();
}
