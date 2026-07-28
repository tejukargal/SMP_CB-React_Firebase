/**
 * Converts a string to Proper Case (first letter of each word capitalized).
 * Handles multiple spaces and preserves single characters.
 */
export function toProperCase(str: string): string {
  if (!str) return str;
  return str
    .split(' ')
    .map((word) =>
      word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word
    )
    .join(' ');
}

/**
 * Deterministic slug for a firm name, used as its Firestore doc ID so repeat
 * clearances of the same firm upsert one record instead of creating duplicates.
 */
export function slugifyFirmName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
