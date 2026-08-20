/**
 * Minimal RFC 4180 CSV writer — quotes every field and doubles inner quotes,
 * which is all an attendance export needs. A library would be more code to
 * audit than the eight lines below.
 */
function escapeCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  // CRLF and a trailing newline keep Excel happy.
  return lines.join('\r\n') + '\r\n';
}
