import type {
  LocalNodeIdentity,
  PhraseRecord,
} from "@mycelium/client";
import { renderFormResult } from "./formRendering";
import type { FormResult } from "./formRendering";
import { escapeAttribute, escapeHtml } from "./uiFormatting";

export type ObserveFormState = {
  surfaceText: string;
  languageHint: string;
  phoneticHint: string;
};

export type ProposeFormState = {
  phraseId: string;
  referenceMeaning: string;
  context: string;
  confidence: string;
};

export type ContributionRenderingState = {
  observingPhrase: boolean;
  proposingMeaning: boolean;
  observeForm: ObserveFormState;
  proposeForm: ProposeFormState;
  observeResult?: FormResult;
  proposeResult?: FormResult;
  selectedPhrase?: PhraseRecord;
  nodeIdentity?: LocalNodeIdentity;
};

function currentProposePhraseId(state: ContributionRenderingState): string {
  return state.proposeForm.phraseId || state.selectedPhrase?.phrase_id || "";
}

export function renderObservePhrase(state: ContributionRenderingState): string {
  return `
    <section class="panel contribution-panel">
      <div class="panel-heading">
        <h2>Observe Phrase</h2>
      </div>
      <form id="observe-phrase-form" class="contribution-form">
        <label>
          <span>surface_text</span>
          <input
            name="surface_text"
            value="${escapeAttribute(state.observeForm.surfaceText)}"
            autocomplete="off"
            ${state.observingPhrase ? "disabled" : ""}
          />
        </label>
        <label>
          <span>language_hint</span>
          <input
            name="language_hint"
            value="${escapeAttribute(state.observeForm.languageHint)}"
            autocomplete="off"
            ${state.observingPhrase ? "disabled" : ""}
          />
        </label>
        <label>
          <span>phonetic_hint</span>
          <input
            name="phonetic_hint"
            value="${escapeAttribute(state.observeForm.phoneticHint)}"
            autocomplete="off"
            ${state.observingPhrase ? "disabled" : ""}
          />
        </label>
        <button type="submit" ${state.observingPhrase ? "disabled" : ""}>
          ${state.observingPhrase ? "Saving..." : "Observe Phrase"}
        </button>
      </form>
      ${renderFormResult(state.observeResult)}
    </section>
  `;
}

export function renderProposeMeaning(state: ContributionRenderingState): string {
  const defaultAuthor = state.nodeIdentity?.default_author;

  return `
    <section class="panel contribution-panel">
      <div class="panel-heading">
        <h2>Propose Meaning</h2>
      </div>
      <form id="propose-meaning-form" class="contribution-form">
        <label>
          <span>phrase_id</span>
          <input
            name="phrase_id"
            value="${escapeAttribute(currentProposePhraseId(state))}"
            autocomplete="off"
            ${state.proposingMeaning ? "disabled" : ""}
          />
        </label>
        <label>
          <span>reference_meaning</span>
          <textarea
            name="reference_meaning"
            rows="3"
            ${state.proposingMeaning ? "disabled" : ""}
          >${escapeHtml(state.proposeForm.referenceMeaning)}</textarea>
        </label>
        <label>
          <span>context</span>
          <input
            name="context"
            value="${escapeAttribute(state.proposeForm.context)}"
            autocomplete="off"
            ${state.proposingMeaning ? "disabled" : ""}
          />
        </label>
        <label>
          <span>confidence</span>
          <input
            name="confidence"
            type="number"
            min="0"
            max="1"
            step="0.05"
            value="${escapeAttribute(state.proposeForm.confidence)}"
            ${state.proposingMeaning ? "disabled" : ""}
          />
        </label>
        <button type="submit" ${state.proposingMeaning ? "disabled" : ""}>
          ${state.proposingMeaning ? "Saving..." : "Propose Meaning"}
        </button>
      </form>
      <p class="muted form-note">Default author: ${escapeHtml(defaultAuthor ?? "local identity not loaded")}</p>
      ${renderFormResult(state.proposeResult)}
    </section>
  `;
}
