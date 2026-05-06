/**
 * Extract only the English portion of a product name.
 * Product names are stored as "English Name - 中文名" or "English Name-中文名".
 * This returns only the English part before any CJK characters.
 */
export const englishOnly = (name) => {
  if (!name) return '';
  const str = name.toString();
  // Split on " - " or "-" followed by CJK characters
  const dashSplit = str.split(/\s*[-–—]\s*(?=[\u4e00-\u9fff\u3400-\u4dbf])/);
  if (dashSplit.length > 1) return dashSplit[0].trim();
  // Fallback: remove any CJK characters and trim
  return str.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]+/g, '').trim();
};
