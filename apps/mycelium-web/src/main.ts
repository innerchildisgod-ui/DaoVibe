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
import {
  renderGovernance,
  renderGovernanceEvidence,
} from "./governanceRendering";

import {
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

type AppState = {
  loading: boolean;
  loadingPhrase: boolean;
  loadingExplanation: boolean;
  loadingPacketTrace: boolean;
  loadingDiagnostics: boolean;
  loadingGovernance: boolean;
  observingPhrase: boolean;
  proposingMeaning: boolean;
  error?: string;
  searchError?: string;
  explanationError?: string;
  packetTraceError?: string;
  diagnosticsError?: string;
  governanceError?: string;
  observeResult?: FormResult;
  proposeResult?: FormResult;
  nodeStatus?: NodeStatusResponse;
  nodeDiagnostics?: NodeDiagnosticsResponse["diagnostics"];
  nodeIdentity?: LocalNodeIdentity;
  nodeSettings?: LocalNodeSettings;
  syncStatus?: SyncStatusResponse;
  searchQuery: string;
  observeForm: ObserveFormState;
  proposeForm: ProposeFormState;
  searchResults?: PhraseSearchResponse["results"];
  selectedPhrase?: PhraseRecord;
  bestMeaning?: BestMeaningResponse;
  meaningExplanation?: BestMeaningExplanationResponse;
  packetTrace?: PhrasePacketTraceResponse;
  corrections?: CorrectionSummary[];
  tombstones?: TombstoneSummary[];
};

type ObserveFormState = {
  surfaceText: string;
  languageHint: string;
  phoneticHint: string;
};

type ProposeFormState = {
  phraseId: string;
  referenceMeaning: string;
  context: string;
  confidence: string;
};

const state: AppState = {
  loading: true,
  loadingPhrase: false,
  loadingExplanation: false,
  loadingPacketTrace: false,
  loadingDiagnostics: false,
  loadingGovernance: false,
  observingPhrase: false,
  proposingMeaning: false,
  searchQuery: "",
  observeForm: {
    surfaceText: "",
    languageHint: "",
    phoneticHint: "",
  },
  proposeForm: {
    phraseId: "",
    referenceMeaning: "",
    context: "",
    confidence: "0.5",
  },
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

function setState(nextState: Partial<AppState>): void {
  Object.assign(state, nextState);
  render();
}

function currentProposePhraseId(): string {
  return state.proposeForm.phraseId || state.selectedPhrase?.phrase_id || "";
}

function renderPacketTrace(): string {
  const trace = state.packetTrace;

  return `
    <section class="panel packet-trace-panel">
      <div class="panel-heading">
        <h2>Packet Trace</h2>
        <div class="panel-actions">
          <span class="status ${trace ? "ok" : "warn"}">
            ${state.loadingPacketTrace ? "loading" : trace ? "loaded" : "unavailable"}
          </span>
          <button
            id="refresh-packet-trace"
            type="button"
            ${state.loadingPacketTrace || !state.selectedPhrase ? "disabled" : ""}
          >
            ${state.loadingPacketTrace ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      ${
        state.packetTraceError
          ? `<p class="form-message error">${escapeHtml(state.packetTraceError)}</p>`
          : ""
      }
      ${
        !state.selectedPhrase
          ? `<p class="muted">Select a phrase to inspect packet evidence.</p>`
          : trace
            ? `
              <div class="field-grid">
                ${field("packet_count", trace.trace.packet_count)}
                ${field("tombstone_execution", statusText(trace.safety.tombstone_execution))}
                ${field("deletion_enabled", statusText(trace.safety.deletion_enabled))}
                ${field("ledger_pruning_enabled", statusText(trace.safety.ledger_pruning_enabled))}
              </div>
              ${renderPacketTypeCounts(trace)}
              ${renderPacketTraceRows(trace)}
            `
            : `<p class="muted">No packet trace loaded.</p>`
      }
    </section>
  `;
}


function renderPhraseDetail(): string {
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

function renderObservePhrase(): string {
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

function renderProposeMeaning(): string {
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
            value="${escapeAttribute(currentProposePhraseId())}"
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
        ${renderObservePhrase()}
        ${renderPhraseDetail()}
        ${renderMeaningExplanation(state)}
        ${renderPacketTrace()}
        ${renderProposeMeaning()}
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

  observeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void observePhrase(new FormData(observeForm));
  });

  proposeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void proposeMeaning(new FormData(proposeForm));
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

async function loadStatus(): Promise<void> {
  setState({
    loading: true,
    loadingDiagnostics: true,
    error: undefined,
    diagnosticsError: undefined,
  });

  try {
    const [
      nodeStatus,
      nodeIdentity,
      nodeSettings,
      syncStatus,
      nodeDiagnostics,
    ] = await Promise.all([
        client.getNodeStatus(),
        client.getNodeIdentity(),
        client.getNodeSettings(),
        client.getSyncStatus(),
        client.getNodeDiagnostics(),
      ]);

    setState({
      loading: false,
      loadingDiagnostics: false,
  loadingGovernance: false,
      nodeStatus,
      nodeIdentity: nodeIdentity.identity,
      nodeSettings: nodeSettings.settings,
      syncStatus,
      nodeDiagnostics: nodeDiagnostics.diagnostics,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Mycelium server is not reachable. ${error.message}`
        : "Mycelium server is not reachable.";

    setState({
      loading: false,
      loadingDiagnostics: false,
  loadingGovernance: false,
      error: message,
      diagnosticsError: message,
    });
  }
}

async function loadDiagnostics(): Promise<void> {
  setState({
    loadingDiagnostics: true,
    diagnosticsError: undefined,
  });

  try {
    const diagnostics = await client.getNodeDiagnostics();

    setState({
      loadingDiagnostics: false,
  loadingGovernance: false,
      nodeDiagnostics: diagnostics.diagnostics,
    });
  } catch (error) {
    setState({
      loadingDiagnostics: false,
  loadingGovernance: false,
      diagnosticsError:
        error instanceof Error
          ? `Diagnostics unavailable. ${error.message}`
          : "Diagnostics unavailable.",
    });
  }
}

async function searchPhrases(query: string): Promise<void> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    setState({
      searchQuery: "",
      searchResults: [],
      searchError: undefined,
    });
    return;
  }

  setState({
    searchQuery: trimmedQuery,
    searchError: undefined,
  });

  try {
    const result = await client.searchPhrases(trimmedQuery);

    setState({
      searchResults: result.results,
    });
  } catch (error) {
    setState({
      searchResults: undefined,
      searchError:
        error instanceof Error ? error.message : "Phrase search failed.",
    });
  }
}

async function selectPhrase(phraseId: string): Promise<void> {
  setState({
    loadingPhrase: true,
    loadingExplanation: true,
    loadingPacketTrace: true,
    loadingGovernance: true,
    selectedPhrase: undefined,
    bestMeaning: undefined,
    meaningExplanation: undefined,
    packetTrace: undefined,
    corrections: undefined,
    tombstones: undefined,
    explanationError: undefined,
    packetTraceError: undefined,
    governanceError: undefined,
  });

  try {
    const [phrase, bestMeaning, explanation, packetTrace, corrections, tombstones] =
      await Promise.allSettled([
        client.getPhrase(phraseId),
        client.getBestMeaning(phraseId),
        client.getBestMeaningExplanation(phraseId),
        client.getPhrasePacketTrace(phraseId),
        client.getCorrections(phraseId),
        client.getTombstones(phraseId),
      ]);

    if (phrase.status === "rejected") {
      throw phrase.reason;
    }

    setState({
      loadingPhrase: false,
      loadingExplanation: false,
      loadingPacketTrace: false,
      loadingGovernance: false,
      selectedPhrase: phrase.value.phrase,
      bestMeaning:
        bestMeaning.status === "fulfilled" ? bestMeaning.value : undefined,
      meaningExplanation:
        explanation.status === "fulfilled" ? explanation.value : undefined,
      packetTrace:
        packetTrace.status === "fulfilled" ? packetTrace.value : undefined,
      corrections:
        corrections.status === "fulfilled" ? corrections.value.corrections : undefined,
      tombstones:
        tombstones.status === "fulfilled" ? tombstones.value.tombstones : undefined,
      explanationError:
        explanation.status === "rejected"
          ? explanation.reason instanceof Error
            ? explanation.reason.message
            : "Meaning explanation failed."
          : undefined,
      packetTraceError:
        packetTrace.status === "rejected"
          ? packetTrace.reason instanceof Error
            ? packetTrace.reason.message
            : "Packet trace failed."
          : undefined,
      governanceError:
        corrections.status === "rejected"
          ? corrections.reason instanceof Error
            ? corrections.reason.message
            : "Correction lookup failed."
          : tombstones.status === "rejected"
            ? tombstones.reason instanceof Error
              ? tombstones.reason.message
              : "Tombstone lookup failed."
            : undefined,
    });
  } catch (error) {
    setState({
      loadingPhrase: false,
      loadingExplanation: false,
      loadingPacketTrace: false,
      loadingGovernance: false,
      selectedPhrase: undefined,
      bestMeaning: undefined,
      meaningExplanation: undefined,
      packetTrace: undefined,
      corrections: undefined,
      tombstones: undefined,
      explanationError: undefined,
      packetTraceError: undefined,
      governanceError: undefined,
      searchError:
        error instanceof Error ? error.message : "Phrase detail failed.",
    });
  }
}

async function loadPacketTrace(phraseId: string): Promise<void> {
  setState({
    loadingPacketTrace: true,
    packetTraceError: undefined,
  });

  try {
    const trace = await client.getPhrasePacketTrace(phraseId);

    setState({
      loadingPacketTrace: false,
      packetTrace: trace,
    });
  } catch (error) {
    setState({
      loadingPacketTrace: false,
      packetTraceError:
        error instanceof Error ? error.message : "Packet trace failed.",
    });
  }
}

async function refreshAfterWrite(phraseId: string, searchQuery?: string): Promise<void> {
  await Promise.all([
    loadStatus(),
    searchQuery ? searchPhrases(searchQuery) : Promise.resolve(),
    selectPhrase(phraseId),
  ]);
}

async function observePhrase(formData: FormData): Promise<void> {
  const surfaceText = String(formData.get("surface_text") ?? "").trim();
  const languageHint = String(formData.get("language_hint") ?? "").trim();
  const phoneticHint = String(formData.get("phonetic_hint") ?? "").trim();

  state.observeForm = {
    surfaceText,
    languageHint,
    phoneticHint,
  };

  if (!surfaceText) {
    setState({
      observeResult: {
        kind: "error",
        message: "surface_text is required.",
      },
    });
    return;
  }

  const phraseId = createPhraseId(surfaceText);

  setState({
    observingPhrase: true,
    observeResult: undefined,
  });

  try {
    const result: ObservePhraseResponse = await client.observePhrase({
      phrase_id: phraseId,
      surface_text: surfaceText,
      language_hint: optionalTrimmed(languageHint),
      phonetic_hint: optionalTrimmed(phoneticHint),
      input_type: "text",
    });

    state.observeForm = {
      surfaceText: "",
      languageHint: "",
      phoneticHint: "",
    };
    state.proposeForm.phraseId = result.result.phrase_id;

    setState({
      observingPhrase: false,
      observeResult: {
        kind: "success",
        message: `Observed ${result.result.phrase_id} with packet ${result.result.packet_id}.`,
      },
    });

    await refreshAfterWrite(result.result.phrase_id, surfaceText);
  } catch (error) {
    setState({
      observingPhrase: false,
      observeResult: {
        kind: "error",
        message:
          error instanceof Error ? error.message : "Phrase observation failed.",
      },
    });
  }
}

async function proposeMeaning(formData: FormData): Promise<void> {
  const phraseId = String(formData.get("phrase_id") ?? "").trim();
  const referenceMeaning = String(
    formData.get("reference_meaning") ?? ""
  ).trim();
  const context = String(formData.get("context") ?? "").trim();
  const confidenceText = String(formData.get("confidence") ?? "").trim();
  const confidence = confidenceText ? Number(confidenceText) : 0.5;

  state.proposeForm = {
    phraseId,
    referenceMeaning,
    context,
    confidence: confidenceText || "0.5",
  };

  if (!phraseId) {
    setState({
      proposeResult: {
        kind: "error",
        message: "phrase_id is required.",
      },
    });
    return;
  }

  if (!referenceMeaning) {
    setState({
      proposeResult: {
        kind: "error",
        message: "reference_meaning is required.",
      },
    });
    return;
  }

  if (!Number.isFinite(confidence)) {
    setState({
      proposeResult: {
        kind: "error",
        message: "confidence must be a number.",
      },
    });
    return;
  }

  setState({
    proposingMeaning: true,
    proposeResult: undefined,
  });

  try {
    const result: ProposeMeaningResponse = await client.proposeMeaning({
      phrase_id: phraseId,
      meaning_id: createMeaningId(phraseId, referenceMeaning),
      reference_meaning: referenceMeaning,
      context: optionalTrimmed(context),
      confidence,
    });

    state.proposeForm.referenceMeaning = "";
    state.proposeForm.context = "";

    setState({
      proposingMeaning: false,
      proposeResult: {
        kind: "success",
        message: `Proposed ${result.result.meaning_id} with packet ${result.result.packet_id}.`,
      },
    });

    await refreshAfterWrite(phraseId, state.searchQuery || undefined);
  } catch (error) {
    setState({
      proposingMeaning: false,
      proposeResult: {
        kind: "error",
        message:
          error instanceof Error ? error.message : "Meaning proposal failed.",
      },
    });
  }
}

render();
void loadStatus();
