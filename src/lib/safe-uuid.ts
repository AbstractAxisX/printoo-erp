// crypto.randomUUID() is ONLY available in secure contexts (HTTPS or
// localhost). On a plain-HTTP deployment (e.g. http://BARE-IP:3000) the
// browser omits it → "TypeError: crypto.randomUUID is not a function"
// crashes the whole React tree. These ids are only used as React keys /
// draft-row keys (not security-sensitive), so a getRandomValues fallback
// is perfectly fine.
export function safeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback — works in non-secure contexts (crypto.getRandomValues always exists)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      // eslint-disable-next-line no-bitwise
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (+c / 4)).toString(16)
    );
  }
  // Last resort (very old environments)
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
