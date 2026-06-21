import {
  MyceliumClient,
  type BestMeaningExplanationResponse,
  type BestMeaningResponse,
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
} from "@mycelium/client";
import "./styles.css";

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
  observingPhrase: boolean;
  proposingMeaning: boolean;
  error?: string;
  searchError?: string;
  explanationError?: string;
  packetTraceError?: string;
  diagnosticsError?: string;
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
};

type FormResult = {
  kind: "success" | "error";
  message: string;
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

function text(value: unknown, fallback = "Not available"): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}

function escapeHtml(value: unknown): string {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function statusText(value: boolean | undefined): string {
  return value === true ? "true" : value === false ? "false" : "unknown";
}

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

function optionalTrimmed(value: string): string | undefined {
  const trimmedValue = value.trim();

  return trimmedValue ? trimmedValue : undefined;
}

function slugFromText(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return slug || fallback;
}

function createPhraseId(surfaceText: string): string {
  return `phrase_${slugFromText(surfaceText, "observed")}_${Date.now().toString(36)}`;
}

function createMeaningId(phraseId: string, referenceMeaning: string): string {
  const baseText = `${phraseId}_${referenceMeaning}`;

  return `meaning_${slugFromText(baseText, "proposal")}_${Date.now().toString(36)}`;
}

function currentProposePhraseId(): string {
  return state.proposeForm.phraseId || state.selectedPhrase?.phrase_id || "";
}

function field(label: string, value: unknown): string {
  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderFormResult(result: FormResult | undefined): string {
  if (!result) {
    return "";
  }

  return `<p class="form-message ${result.kind}">${escapeHtml(result.message)}</p>`;
}

function renderHeader(): string {
  return `
    <header class="app-header">
      <div>
        <h1>DAOVibe Mycelium</h1>
        <p>local-first language layer</p>
      </div>
      <div class="api-pill">${escapeHtml(visibleApiBaseUrl)}</div>
    </header>
  `;
}

function renderNodeStatus(): string {
  const status = state.nodeStatus;
  const identity = state.nodeIdentity;

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Node Status</h2>
        <span class="status ${status?.service.status === "ready" ? "ok" : "warn"}">
          ${escapeHtml(text(status?.service.status, state.loading ? "loading" : "offline"))}
        </span>
      </div>
      <div class="field-grid">
        ${field("service", status?.service.name)}
        ${field("node_id", status?.node.node_id ?? identity?.node_id)}
        ${field("display_name", status?.node.display_name ?? identity?.display_name)}
        ${field("default_author", status?.node.default_author ?? identity?.default_author)}
        ${field("packet_count", status?.ledger.packet_count)}
        ${field("tombstone_execution", statusText(status?.capabilities.tombstone_execution))}
      </div>
    </section>
  `;
}

function renderNodeDiagnostics(): string {
  const diagnostics = state.nodeDiagnostics;
  const isReachable =
    state.diagnosticsError === undefined && diagnostics?.server_reachable === true;

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Node Diagnostics</h2>
        <div class="panel-actions">
          <span class="status ${isReachable ? "ok" : "warn"}">
            ${isReachable ? "reachable" : state.loadingDiagnostics ? "loading" : "unavailable"}
          </span>
          <button id="refresh-diagnostics" type="button" ${state.loadingDiagnostics ? "disabled" : ""}>
            ${state.loadingDiagnostics ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      ${
        state.diagnosticsError
          ? `<p class="form-message error">${escapeHtml(state.diagnosticsError)}</p>`
          : ""
      }
      <div class="field-grid">
        ${field("server_reachable", statusText(state.diagnosticsError ? false : diagnostics?.server_reachable))}
        ${field("server_time", diagnostics?.server_time)}
        ${field("uptime_seconds", diagnostics?.uptime_seconds)}
        ${field("api_version", diagnostics?.versions.api_version)}
        ${field("protocol_version", diagnostics?.versions.protocol_version)}
        ${field("app_contract_version", diagnostics?.versions.app_contract_version)}
        ${field("node_id", diagnostics?.node.node_id)}
        ${field("display_name", diagnostics?.node.display_name)}
        ${field("packet_count", diagnostics?.ledger.packet_count)}
        ${field("known_peer_count", diagnostics?.sync.known_peer_count)}
        ${field("sync_mode", diagnostics?.settings.sync_mode)}
        ${field("developer_mode", statusText(diagnostics?.settings.developer_mode))}
        ${field("show_debug_panels", statusText(diagnostics?.settings.show_debug_panels))}
        ${field("tombstone_execution", statusText(diagnostics?.safety.tombstone_execution))}
        ${field("deletion_enabled", statusText(diagnostics?.safety.deletion_enabled))}
        ${field("ledger_pruning_enabled", statusText(diagnostics?.safety.ledger_pruning_enabled))}
      </div>
    </section>
  `;
}

function renderSyncStatus(): string {
  const sync = state.syncStatus?.sync;

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Sync Status</h2>
        <span class="status ${sync?.enabled ? "ok" : "warn"}">
          ${sync?.enabled ? "enabled" : state.loading ? "loading" : "unavailable"}
        </span>
      </div>
      <div class="field-grid">
        ${field("mode", sync?.mode)}
        ${field("known_peer_count", sync?.known_peer_count)}
      </div>
      <div class="peer-list">
        ${
          sync && sync.peers.length > 0
            ? sync.peers
                .map(
                  (peer) => `
                    <div class="peer-row">
                      <span>${escapeHtml(peer.peer_author)}</span>
                      <strong>${escapeHtml(peer.cursor)}</strong>
                    </div>
                  `
                )
                .join("")
            : `<p class="muted">No peer cursors stored.</p>`
        }
      </div>
    </section>
  `;
}

function renderLocalSettings(): string {
  const settings = state.nodeSettings;
  const statusSettings = state.nodeStatus?.settings;

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Local Settings</h2>
        <span class="status ${settings ? "ok" : "warn"}">
          ${settings ? "loaded" : state.loading ? "loading" : "unavailable"}
        </span>
      </div>
      <div class="field-grid">
        ${field("default_language_hint", settings?.default_language_hint)}
        ${field("default_safety_label", settings?.default_safety_label)}
        ${field("sync_mode", settings?.sync_mode ?? statusSettings?.sync_mode)}
        ${field("developer_mode", statusText(settings?.developer_mode ?? statusSettings?.developer_mode))}
        ${field("show_debug_panels", statusText(settings?.show_debug_panels ?? statusSettings?.show_debug_panels))}
      </div>
    </section>
  `;
}

function renderSearchResults(): string {
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

function renderSearch(): string {
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
      ${renderSearchResults()}
    </section>
  `;
}

function renderBestMeaning(): string {
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

function renderMeaningExplanation(): string {
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

function renderPacketTypeCounts(trace: PhrasePacketTraceResponse): string {
  const entries = Object.entries(trace.trace.packet_types);

  if (entries.length === 0) {
    return `<p class="muted">No packet types recorded.</p>`;
  }

  return `
    <div class="packet-type-counts">
      ${entries
        .map(
          ([packetType, count]) => `
            <span>${escapeHtml(packetType)} ${escapeHtml(count)}</span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPacketTraceRows(trace: PhrasePacketTraceResponse): string {
  if (trace.trace.packets.length === 0) {
    return `<p class="muted">No packets found for this phrase.</p>`;
  }

  return `
    <div class="packet-trace-list">
      ${trace.trace.packets
        .map(
          (packet) => `
            <article class="packet-trace-row">
              <div class="packet-trace-heading">
                <strong>${escapeHtml(packet.packet_type)}</strong>
                <span>${escapeHtml(packet.role)}</span>
              </div>
              <p>${escapeHtml(packet.summary)}</p>
              <div class="packet-trace-meta">
                <span>packet_id ${escapeHtml(packet.packet_id)}</span>
                ${
                  packet.author
                    ? `<span>author ${escapeHtml(packet.author)}</span>`
                    : ""
                }
                ${
                  packet.created_at !== undefined
                    ? `<span>created_at ${escapeHtml(packet.created_at)}</span>`
                    : ""
                }
                ${
                  packet.received_at !== undefined
                    ? `<span>received_at ${escapeHtml(packet.received_at)}</span>`
                    : ""
                }
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
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
      ${renderBestMeaning()}
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

function renderGovernance(): string {
  return `
    <section class="panel governance-panel">
      <div class="panel-heading">
        <h2>Governance Safety</h2>
        <span class="status warn">execution disabled</span>
      </div>
      <div class="field-grid">
        ${field("corrections", "available through backend")}
        ${field("tombstone_preview", "available through backend")}
        ${field("tombstone_execution", "false")}
      </div>
    </section>
  `;
}

function render(): void {
  app.innerHTML = `
    ${renderHeader()}
    ${state.error ? `<p class="message error">${escapeHtml(state.error)}</p>` : ""}
    <main class="layout">
      <div class="status-column">
        ${renderNodeStatus()}
        ${renderNodeDiagnostics()}
        ${renderLocalSettings()}
        ${renderSyncStatus()}
        ${renderGovernance()}
      </div>
      <div class="work-column">
        ${renderSearch()}
        ${renderObservePhrase()}
        ${renderPhraseDetail()}
        ${renderMeaningExplanation()}
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
      nodeDiagnostics: diagnostics.diagnostics,
    });
  } catch (error) {
    setState({
      loadingDiagnostics: false,
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
    proposeForm: {
      ...state.proposeForm,
      phraseId,
    },
    selectedPhrase: undefined,
    bestMeaning: undefined,
    meaningExplanation: undefined,
    packetTrace: undefined,
    explanationError: undefined,
    packetTraceError: undefined,
  });

  try {
    const [phrase, bestMeaning, explanation, packetTrace] =
      await Promise.allSettled([
      client.getPhrase(phraseId),
      client.getBestMeaning(phraseId),
      client.getBestMeaningExplanation(phraseId),
      client.getPhrasePacketTrace(phraseId),
    ]);

    if (phrase.status === "rejected") {
      throw phrase.reason;
    }

    if (bestMeaning.status === "rejected") {
      throw bestMeaning.reason;
    }

    setState({
      loadingPhrase: false,
      loadingExplanation: false,
      loadingPacketTrace: false,
      selectedPhrase: phrase.value.phrase,
      bestMeaning: bestMeaning.value,
      meaningExplanation:
        explanation.status === "fulfilled" ? explanation.value : undefined,
      packetTrace:
        packetTrace.status === "fulfilled" ? packetTrace.value : undefined,
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
    });
  } catch (error) {
    setState({
      loadingPhrase: false,
      loadingExplanation: false,
      loadingPacketTrace: false,
      meaningExplanation: undefined,
      packetTrace: undefined,
      explanationError: undefined,
      packetTraceError: undefined,
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
