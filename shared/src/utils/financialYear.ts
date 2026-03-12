/**
 * Returns the current financial year string (e.g. "2025-26").
 * Financial year runs April 1 – March 31.
 */
export function getCurrentFinancialYear(): string {
  const today = new Date();
  const month = today.getMonth(); // 0-indexed; April = 3
  const year = today.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  return generateFYLabel(startYear);
}

/**
 * Generates a financial year label like "2025-26" from the start year.
 */
export function generateFYLabel(startYear: number): string {
  const endYY = String(startYear + 1).slice(-2);
  return `${startYear}-${endYY}`;
}

/**
 * Returns true if the given string is a valid FY label (e.g. "2025-26").
 */
export function isValidFY(fy: string): boolean {
  return /^\d{4}-\d{2}$/.test(fy);
}
