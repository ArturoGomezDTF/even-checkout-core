const CACHE_PREFIX = "even_validation_";

function getCacheKey(
  restaurantId: number,
  branchNumber: number,
  service?: string,
): string {
  const base = `${CACHE_PREFIX}${restaurantId}_${branchNumber}`;
  return service ? `${base}_${service}` : base;
}

export function getValidationFromCache(
  restaurantId: number,
  branchNumber: number,
  service?: string,
): { valid: boolean; error?: string } | null {
  if (typeof window === "undefined") return null;

  try {
    const key = getCacheKey(restaurantId, branchNumber, service);
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

export function setValidationCache(
  restaurantId: number,
  branchNumber: number,
  result: { valid: boolean; error?: string },
  service?: string,
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getCacheKey(restaurantId, branchNumber, service);
    sessionStorage.setItem(key, JSON.stringify(result));
  } catch {
    // sessionStorage might be unavailable (private mode, full storage)
  }
}
