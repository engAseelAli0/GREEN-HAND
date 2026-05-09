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

/**
 * Maps color names to CSS colors for UI display.
 * Handles English, Arabic, and mixed string formats.
 */
export const extractColorCSS = (colorStr) => {
    if (!colorStr) return 'transparent';
    const lower = colorStr.toLowerCase();
    
    // Common mappings
    if (lower.includes('red') || lower.includes('أحمر')) return '#ef4444';
    if (lower.includes('blue') || lower.includes('أزرق')) return '#3b82f6';
    if (lower.includes('green') || lower.includes('أخضر')) return '#22c55e';
    if (lower.includes('black') || lower.includes('أسود')) return '#000000';
    if (lower.includes('white') || lower.includes('أبيض')) return '#ffffff';
    if (lower.includes('yellow') || lower.includes('أصفر')) return '#eab308';
    if (lower.includes('pink') || lower.includes('وردي') || lower.includes('زهر')) return '#ec4899';
    if (lower.includes('purple') || lower.includes('بنفسجي')) return '#a855f7';
    if (lower.includes('orange') || lower.includes('برتقالي')) return '#f97316';
    if (lower.includes('gray') || lower.includes('grey') || lower.includes('رمادي')) return '#6b7280';
    if (lower.includes('brown') || lower.includes('بني')) return '#78350f';
    if (lower.includes('beige') || lower.includes('بيج')) return '#f5f5dc';
    if (lower.includes('gold') || lower.includes('ذهبي')) return '#ffd700';
    if (lower.includes('silver') || lower.includes('فضي')) return '#c0c0c0';
    if (lower.includes('navy') || lower.includes('كحلي')) return '#1e3a8a';
    if (lower.includes('maroon') || lower.includes('عنابي')) return '#7f1d1d';
    if (lower.includes('olive') || lower.includes('زيتي')) return '#3f6212';
    if (lower.includes('teal')) return '#0f766e';
    if (lower.includes('cyan') || lower.includes('سماوي')) return '#06b6d4';
    if (lower.includes('apricot') || lower.includes('مشمشي')) return '#fbceb1';
    
    // Try to extract an English word before any separator
    const englishPart = colorStr.split(/[-_]/)[0].trim().replace(/\s+/g, '');
    return englishPart || 'transparent';
};
