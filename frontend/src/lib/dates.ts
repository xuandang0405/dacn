export function formatTimestamp(value: string, language: "vi" | "en") {
  const withZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  const timestamp = new Date(withZone);
  return Number.isNaN(timestamp.getTime())
    ? value
    : timestamp.toLocaleString(language === "vi" ? "vi-VN" : "en-US");
}
