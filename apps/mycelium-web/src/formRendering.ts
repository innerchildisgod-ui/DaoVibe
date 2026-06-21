import { escapeHtml, text } from "./uiFormatting";

export type FormResult = {
  kind: "success" | "error";
  message: string;
};

export function field(label: string, value: unknown): string {
  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

export function renderFormResult(result: FormResult | undefined): string {
  if (!result) {
    return "";
  }

  return `<p class="form-message ${result.kind}">${escapeHtml(result.message)}</p>`;
}
