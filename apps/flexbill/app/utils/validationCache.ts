const CACHE_PREFIX = "even_validation_";

// El token no cambia hasta el próximo escaneo, así que la cache-key sola no
// detecta una revocación server-side (ej. la mesa se pagó mientras este tab
// seguía abierto). Por eso además de la key por token, cada entrada expira
// sola a los pocos segundos — fuerza una re-validación real contra el
// backend en vez de confiar para siempre en un {valid:true} ya viejo.
const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  result: { valid: boolean; error?: string };
  cachedAt: number;
}

function getCacheKey(
  restaurantId: number,
  branchNumber: number,
  tableNumber: string,
  service?: string,
  sessionToken?: string,
): string {
  const base = `${CACHE_PREFIX}${restaurantId}_${branchNumber}_${tableNumber}`;
  const withService = service ? `${base}_${service}` : base;
  return sessionToken ? `${withService}_${sessionToken}` : withService;
}

export function getValidationFromCache(
  restaurantId: number,
  branchNumber: number,
  tableNumber: string,
  service?: string,
  sessionToken?: string,
): { valid: boolean; error?: string } | null {
  if (typeof window === "undefined") return null;

  try {
    const key = getCacheKey(
      restaurantId,
      branchNumber,
      tableNumber,
      service,
      sessionToken,
    );
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;

    const entry: CacheEntry = JSON.parse(cached);
    // Entradas de un formato viejo (pre-TTL, sin cachedAt/result) no son
    // validas — tratarlas como cache miss en vez de devolver algo a medias.
    if (
      typeof entry?.cachedAt !== "number" ||
      typeof entry?.result?.valid !== "boolean"
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

export function setValidationCache(
  restaurantId: number,
  branchNumber: number,
  tableNumber: string,
  result: { valid: boolean; error?: string },
  service?: string,
  sessionToken?: string,
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getCacheKey(
      restaurantId,
      branchNumber,
      tableNumber,
      service,
      sessionToken,
    );
    const entry: CacheEntry = { result, cachedAt: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // sessionStorage might be unavailable (private mode, full storage)
  }
}

export function invalidateValidationCache(
  restaurantId: number,
  branchNumber: number,
  tableNumber: string,
  service?: string,
  sessionToken?: string,
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getCacheKey(
      restaurantId,
      branchNumber,
      tableNumber,
      service,
      sessionToken,
    );
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearAllValidationCache(): void {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // ignore
  }
}
