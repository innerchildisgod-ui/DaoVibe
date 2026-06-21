export function text(value: unknown, fallback = "Not available"): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}



export function escapeHtml(value: unknown): string {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}



export function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}



export function statusText(value: boolean | undefined): string {
  return value === true ? "true" : value === false ? "false" : "unknown";
}



export function optionalTrimmed(value: string): string | undefined {
  const trimmedValue = value.trim();

  return trimmedValue ? trimmedValue : undefined;
}



export function slugFromText(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return slug || fallback;
}



export function createPhraseId(surfaceText: string): string {
  return `phrase_${slugFromText(surfaceText, "observed")}_${Date.now().toString(36)}`;
}



export function createMeaningId(phraseId: string, referenceMeaning: string): string {
  const baseText = `${phraseId}_${referenceMeaning}`;

  return `meaning_${slugFromText(baseText, "proposal")}_${Date.now().toString(36)}`;
}
