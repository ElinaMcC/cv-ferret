// Shared date formatters — en-GB throughout, per CLAUDE.md localisation notes.

// Full date from a YYYY-MM-DD (or ISO) string, e.g. "14 Jun 2026".
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Month and year from a YYYY-MM string, e.g. "Jun 2026".
export function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1)
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
