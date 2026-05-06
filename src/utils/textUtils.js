/**
 * Extract only the English/Latin portion of a product name.
 * Handles ALL formats and separators (dash, underscore, space):
 *   "Girl Dress - 女式连衣裙"   → "Girl Dress"
 *   "女式连衣裙 - Lady Dress"   → "Lady Dress"
 *   "女式连衣裙_Lady Dress"     → "Lady Dress"
 *   "女式连衣裙 _ Lady Dress"   → "Lady Dress"
 *   "Girl Set 3pcs 套装三件套"  → "Girl Set 3pcs"
 *   "套装三件套 Girl Set"       → "Girl Set"
 */
export const englishOnly = (name) => {
  if (!name) return '';
  const str = name.toString().trim();

  // Split on any separator: dash, en-dash, em-dash, underscore
  const parts = str.split(/\s*[-–—_]\s*/);

  // Find the part that contains Latin/English letters and NO CJK
  const hasCJK = (s) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
  const hasLatin = (s) => /[a-zA-Z]/.test(s);

  // First: look for a separated part that is purely English
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed && hasLatin(trimmed) && !hasCJK(trimmed)) {
      return trimmed;
    }
  }

  // Second: strip all CJK characters and separators, clean up
  const stripped = str
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]+/g, '')
    .replace(/^\s*[-–—_\s]+/, '')
    .replace(/\s*[-–—_\s]+$/, '')
    .trim();

  return stripped || str;
};
