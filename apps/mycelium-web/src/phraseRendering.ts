import type {
  BestMeaningExplanationResponse,
  BestMeaningResponse,
  PhraseRecord,
  PhraseSearchResponse,
} from "@mycelium/client";
import { field } from "./formRendering";
import { escapeAttribute, escapeHtml, text } from "./uiFormatting";

export type PhraseRenderingState = {
  loading: boolean;
  loadingPhrase: boolean;
  loadingExplanation: boolean;
  searchError?: string;
  explanationError?: string;
  searchQuery: string;
  searchResults?: PhraseSearchResponse["results"];
  selectedPhrase?: PhraseRecord;
  bestMeaning?: BestMeaningResponse;
  meaningExplanation?: BestMeaningExplanationResponse;
};

function bestMeaningSourceLabel(
  source: "base_meaning" | "correction" | undefined
): string {
  if (source === "correction") {
    return "correction";
  }

  if (source === "base_meaning") {
    return "base meaning";
  }

  return "unknown";
}

export function renderSearchResults(state: PhraseRenderingState): string {
  if (state.searchError) {
    return `<p class="message error">${escapeHtml(state.searchError)}</p>`;
  }

  if (state.searchResults === undefined) {
    return `<p class="muted">Search local phrase knowledge.</p>`;
  }

  if (state.searchResults.length === 0) {
    return `<p class="muted">No matching phrases.</p>`;
  }

  return `
    <div class="result-list">
      ${state.searchResults
        .map(
          (result) => `
            <button class="result-row" type="button" data-phrase-id="${escapeAttribute(result.phrase_id)}">
              <span>
                <strong>${escapeHtml(result.surface_text ?? result.phrase_id)}</strong>
                <small>${escapeHtml(text(result.language_hint, "language unknown"))} - ${escapeHtml(result.meaning_count)} meanings</small>
              </span>
              <span>${escapeHtml(result.safety_label)}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderSearch(state: PhraseRenderingState): string {
  return `
    <section class="panel search-panel">
      <div class="panel-heading">
        <h2>Phrase Search</h2>
      </div>
      <form id="search-form" class="search-form">
        <input
          id="search-input"
          name="query"
          type="search"
          value="${escapeAttribute(state.searchQuery)}"
          placeholder="Search phrases"
          autocomplete="off"
        />
        <button type="submit">Search</button>
      </form>
      ${renderSearchResults(state)}
    </section>
  `;
}

export function renderBestMeaning(state: PhraseRenderingState): string {
  const bestMeaning = state.bestMeaning?.best_meaning;

  if (state.loadingPhrase) {
    return `<p class="muted">Loading phrase detail.</p>`;
  }

  if (!state.selectedPhrase) {
    return `<p class="muted">Select a phrase to inspect meaning.</p>`;
  }

  if (!bestMeaning) {
    return `<p class="muted">No best meaning available.</p>`;
  }

  return `
    <div class="best-meaning">
      <strong>${escapeHtml(bestMeaning.reference_meaning)}</strong>
      <div class="metric-row">
        <span>confidence ${escapeHtml(bestMeaning.confidence)}</span>
        <span>score ${escapeHtml(bestMeaning.score)}</span>
        <span>confirms ${escapeHtml(bestMeaning.confirms)}</span>
        <span>rejects ${escapeHtml(bestMeaning.rejects)}</span>
      </div>
    </div>
  `;
}

export function renderMeaningExplanation(state: PhraseRenderingState): string {
  const explanation = state.meaningExplanation;
  const evidence = explanation?.evidence;

  if (state.loadingPhrase || state.loadingExplanation) {
    return `
      <section class="panel explanation-panel">
        <div class="panel-heading">
          <h2>Why this meaning?</h2>
          <span class="status warn">loading</span>
        </div>
        <p class="muted">Loading explanation.</p>
      </section>
    `;
  }

  if (!state.selectedPhrase) {
    return `
      <section class="panel explanation-panel">
        <div class="panel-heading">
          <h2>Why this meaning?</h2>
        </div>
        <p class="muted">Select a phrase to inspect meaning evidence.</p>
      </section>
    `;
  }

  if (state.explanationError) {
    return `
      <section class="panel explanation-panel">
        <div class="panel-heading">
          <h2>Why this meaning?</h2>
          <span class="status warn">unavailable</span>
        </div>
        <p class="form-message error">${escapeHtml(state.explanationError)}</p>
      </section>
    `;
  }

  if (!explanation || !evidence) {
    return `
      <section class="panel explanation-panel">
        <div class="panel-heading">
          <h2>Why this meaning?</h2>
        </div>
        <p class="muted">No explanation available.</p>
      </section>
    `;
  }

  return `
    <section class="panel explanation-panel">
      <div class="panel-heading">
        <h2>Why this meaning?</h2>
        <span class="status warn">tombstones disabled</span>
      </div>
      <p class="explanation-summary">${escapeHtml(explanation.explanation.summary)}</p>
      <div class="field-grid evidence-grid">
        ${field("source", bestMeaningSourceLabel(explanation.best_meaning?.source))}
        ${field("meaning_count", evidence.meaning_count)}
        ${field("correction_count", evidence.correction_count)}
        ${field("confirmed_corrections", evidence.confirmed_correction_count)}
        ${field("maturing_corrections", evidence.maturing_correction_count)}
        ${field("tombstone_count", evidence.tombstone_count)}
        ${field("confirmed_tombstones", evidence.confirmed_tombstone_count)}
        ${field("tombstone_execution", statusText(explanation.explanation.tombstone_execution_enabled))}
      </div>
      <ul class="reason-list">
        ${explanation.explanation.reasons
          .map((reason) => `<li>${escapeHtml(reason)}</li>`)
          .join("")}
      </ul>
    </section>
  `;
}

export function renderPhraseDetail(state: PhraseRenderingState): string {
  const phrase = state.selectedPhrase;

  return `
    <section class="panel detail-panel">
      <div class="panel-heading">
        <h2>Phrase Detail</h2>
      </div>
      <div class="field-grid">
        ${field("phrase_id", phrase?.phrase_id)}
        ${field("surface_text", phrase?.surface_text)}
        ${field("language_hint", phrase?.language_hint)}
        ${field("safety_label", phrase?.safety_label)}
      </div>
      <h3>Best Meaning</h3>
      ${renderBestMeaning(state)}
    </section>
  `;
}
