/**
 * Deriva el origen del backend (`https://host[:puerto]`) a partir de
 * `NEXT_PUBLIC_API_URL`, que normalmente termina en `/api`. Descarta path,
 * query y hash. Si la URL está vacía, es inválida o no es http(s), devuelve
 * `fallback`.
 */
export function getBackendOrigin(
  apiUrl: string | undefined,
  fallback: string,
): string {
  if (!apiUrl) return fallback;
  try {
    const url = new URL(apiUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}
