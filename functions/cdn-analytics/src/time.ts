const CDN_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)$/;

export function parseUtcTimestamp(value: string): Date | null {
  const match = CDN_TIMESTAMP.exec(value);
  const normalized = match ? `${match[1]}T${match[2]}Z` : value;
  const timestamp = new Date(normalized);

  return Number.isFinite(timestamp.getTime()) ? timestamp : null;
}
