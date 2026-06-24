import {
  MyceliumClient,
  type BestMeaningExplanationResponse,
  type BestMeaningResponse,
  type CorrectionSummary,
  type LocalNodeIdentity,
  type LocalNodeSettings,
  type NodeDiagnosticsResponse,
  type NodeStatusResponse,
  type ObservePhraseResponse,
  type PhrasePacketTraceResponse,
  type PhraseRecord,
  type PhraseSearchResponse,
  type ProposeMeaningResponse,
  type SyncStatusResponse,
  type TombstoneSummary,
} from "@mycelium/client";
import "./styles.css";
import { createAppActions } from "./appActions";

import { state } from "./appState";
import type { AppState } from "./appState";

import { renderCommerceStatus } from "./commerceRendering";

import {
  renderObservePhrase,
  renderProposeMeaning,
  renderProposeMeaningCorrection,
  renderVoteMeaningCorrection,
} from "./contributionRendering";
import type {
  ObserveFormState,
  ProposeFormState,
} from "./contributionRendering";

import {
  renderGovernance,
  renderGovernanceEvidence,
} from "./governanceRendering";

import {
  renderPacketTrace,
  renderPacketTraceRows,
  renderPacketTypeCounts,
} from "./packetTraceRendering";

import {
  renderBestMeaning,
  renderMeaningExplanation,
  renderSearch,
  renderSearchResults,
} from "./phraseRendering";

import {
  renderHeader,
  renderLocalSettings,
  renderNodeDiagnostics,
  renderNodeStatus,
  renderSyncStatus,
} from "./shellRendering";

import { field, renderFormResult } from "./formRendering";
import type { FormResult } from "./formRendering";

import {
  createMeaningId,
  createPhraseId,
  escapeAttribute,
  escapeHtml,
  optionalTrimmed,
  statusText,
  text,
} from "./uiFormatting";


const DEFAULT_API_BASE_URL = "http://localhost:3000";
const configuredApiBaseUrl = import.meta.env.VITE_MYCELIUM_API_BASE_URL;
const apiBaseUrl =
  configuredApiBaseUrl ??
  (import.meta.env.DEV ? window.location.origin : DEFAULT_API_BASE_URL);
const visibleApiBaseUrl = configuredApiBaseUrl ?? DEFAULT_API_BASE_URL;
const client = new MyceliumClient({ baseUrl: apiBaseUrl });

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

function setState(nextState: Partial<AppState>): void {
  Object.assign(state, nextState);
  render();
}

const {
  loadStatus,
  loadDiagnostics,
  loadPaymentStatus,
  loadOrderFulfillmentStatus,
  searchPhrases,
  selectPhrase,
  prefillCorrectionVote,
  loadPacketTrace,
  refreshAfterWrite,
  observePhrase,
  proposeMeaning,
  proposeMeaningCorrection,
  voteMeaningCorrection,
} = createAppActions({
  client,
  state,
  setState,
});

function render(): void {
  app.innerHTML = `
    ${renderHeader(visibleApiBaseUrl)}
    ${state.error ? `<p class="message error">${escapeHtml(state.error)}</p>` : ""}
    <main class="layout">
      <div class="status-column">
        ${renderNodeStatus(state)}
        ${renderNodeDiagnostics(state)}
        ${renderLocalSettings(state)}
        ${renderSyncStatus(state)}
        ${renderGovernance(state)}
      </div>
      <div class="work-column">
        ${renderSearch(state)}
        ${renderCommerceStatus(state)}
        ${renderObservePhrase(state)}
        ${renderPhraseDetail(state)}
        ${renderMeaningExplanation(state)}
        ${renderPacketTrace(state)}
        ${renderProposeMeaning(state)}
        ${renderProposeMeaningCorrection(state)}
        ${renderVoteMeaningCorrection(state)}
      </div>
    </main>
  `;

  bindEvents();
}

function bindEvents(): void {
  const form = document.querySelector<HTMLFormElement>("#search-form");
  const input = document.querySelector<HTMLInputElement>("#search-input");
  const observeForm = document.querySelector<HTMLFormElement>(
    "#observe-phrase-form"
  );
  const proposeForm = document.querySelector<HTMLFormElement>(
    "#propose-meaning-form"
  );
  const correctionProposalForm = document.querySelector<HTMLFormElement>(
    "#propose-correction-form"
  );
  const correctionVoteForm = document.querySelector<HTMLFormElement>(
    "#vote-correction-form"
  );
  const paymentStatusForm = document.querySelector<HTMLFormElement>(
    "#payment-status-form"
  );
  const orderFulfillmentStatusForm = document.querySelector<HTMLFormElement>(
    "#order-fulfillment-status-form"
  );
  const refreshDiagnosticsButton = document.querySelector<HTMLButtonElement>(
    "#refresh-diagnostics"
  );
  const refreshPacketTraceButton = document.querySelector<HTMLButtonElement>(
    "#refresh-packet-trace"
  );

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void searchPhrases(input?.value ?? "");
  });

  document.querySelectorAll<HTMLButtonElement>("[data-phrase-id]").forEach(
    (button) => {
      button.addEventListener("click", () => {
        const phraseId = button.dataset.phraseId;

        if (phraseId) {
          void selectPhrase(phraseId);
        }
      });
    }
  );

  document.querySelectorAll<HTMLElement>("[data-correction-id]").forEach(
    (row) => {
      const prefillFromRow = (): void => {
        const correctionId = row.dataset.correctionId;

        if (correctionId) {
          prefillCorrectionVote(correctionId);
        }
      };

      row.addEventListener("click", prefillFromRow);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          prefillFromRow();
        }
      });
    }
  );

  bindFormInput("observe-phrase-form", "surface_text", (value) => {
    state.observeForm.surfaceText = value;
  });
  bindFormInput("observe-phrase-form", "language_hint", (value) => {
    state.observeForm.languageHint = value;
  });
  bindFormInput("observe-phrase-form", "phonetic_hint", (value) => {
    state.observeForm.phoneticHint = value;
  });
  bindFormInput("propose-meaning-form", "phrase_id", (value) => {
    state.proposeForm.phraseId = value;
  });
  bindFormInput("propose-meaning-form", "reference_meaning", (value) => {
    state.proposeForm.referenceMeaning = value;
  });
  bindFormInput("propose-meaning-form", "context", (value) => {
    state.proposeForm.context = value;
  });
  bindFormInput("propose-meaning-form", "confidence", (value) => {
    state.proposeForm.confidence = value;
  });

  bindFormInput("propose-correction-form", "phrase_id", (value) => {
    state.correctionProposalForm.phraseId = value;
  });

  bindFormInput("propose-correction-form", "original_meaning_id", (value) => {
    state.correctionProposalForm.originalMeaningId = value;
  });

  bindFormInput("propose-correction-form", "correction_id", (value) => {
    state.correctionProposalForm.correctionId = value;
  });

  bindFormInput(
    "propose-correction-form",
    "corrected_reference_meaning",
    (value) => {
      state.correctionProposalForm.correctedReferenceMeaning = value;
    }
  );

  bindFormInput("propose-correction-form", "correction_context", (value) => {
    state.correctionProposalForm.correctionContext = value;
  });

  bindFormInput("propose-correction-form", "source", (value) => {
    state.correctionProposalForm.source = value;
  });

  bindFormInput("vote-correction-form", "phrase_id", (value) => {
    state.correctionVoteForm.phraseId = value;
  });

  bindFormInput("vote-correction-form", "correction_id", (value) => {
    state.correctionVoteForm.correctionId = value;
  });

  bindFormInput("vote-correction-form", "voter", (value) => {
    state.correctionVoteForm.voter = value;
  });

  bindFormInput("payment-status-form", "payment_intent_id", (value) => {
    state.commerceLookupForm.paymentIntentId = value;
  });

  bindFormInput("order-fulfillment-status-form", "order_reference_id", (value) => {
    state.commerceLookupForm.orderReferenceId = value;
  });

  const correctionVoteSelect = document.querySelector<HTMLSelectElement>(
    '#vote-correction-form [name="vote"]'
  );

  correctionVoteSelect?.addEventListener("change", () => {
    state.correctionVoteForm.vote =
      correctionVoteSelect.value === "reject" ? "reject" : "confirm";
  });

  observeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void observePhrase(new FormData(observeForm));
  });

  proposeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void proposeMeaning(new FormData(proposeForm));
  });

  correctionProposalForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void proposeMeaningCorrection(new FormData(correctionProposalForm));
  });

  correctionVoteForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void voteMeaningCorrection(new FormData(correctionVoteForm));
  });

  paymentStatusForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(paymentStatusForm);
    void loadPaymentStatus(String(formData.get("payment_intent_id") ?? ""));
  });

  orderFulfillmentStatusForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(orderFulfillmentStatusForm);
    void loadOrderFulfillmentStatus(
      String(formData.get("order_reference_id") ?? "")
    );
  });

  refreshDiagnosticsButton?.addEventListener("click", () => {
    void loadDiagnostics();
  });

  refreshPacketTraceButton?.addEventListener("click", () => {
    if (state.selectedPhrase) {
      void loadPacketTrace(state.selectedPhrase.phrase_id);
    }
  });
}

function bindFormInput(
  formId: string,
  fieldName: string,
  updateValue: (value: string) => void
): void {
  const field = document.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(`#${formId} [name="${fieldName}"]`);

  field?.addEventListener("input", () => {
    updateValue(field.value);
  });
}

render();
void loadStatus();
