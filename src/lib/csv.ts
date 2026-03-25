/** Escape a value for CSV: wrap in quotes if it contains commas, quotes, or newlines. */
function escapeField(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV string from a header row and data rows. */
export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeField).join(","),
    ...rows.map((row) => row.map(escapeField).join(",")),
  ];
  return lines.join("\n") + "\n";
}
