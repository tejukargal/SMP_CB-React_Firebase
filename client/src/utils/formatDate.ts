/**
 * Formats an ISO date string "YYYY-MM-DD" to "DD/MM/YYYY".
 */
export function formatDate(isoDate: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Returns today's date as "YYYY-MM-DD".
 */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
