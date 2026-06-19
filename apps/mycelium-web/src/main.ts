import {
  MyceliumClient,
  type BestMeaningResponse,
  type LocalNodeIdentity,
  type NodeStatusResponse,
  type PhraseRecord,
  type PhraseSearchResponse,
  type SyncStatusResponse,
} from "@mycelium/client";
import "./styles.css";

const DEFAULT_API_BASE_URL = "http://localhost:3000";
const apiBaseUrl =
  import.meta.env.VITE_MYCELIUM_API_BASE_URL ?? DEFAULT_API_BASE_URL;
const client = new MyceliumClient({ baseUrl: apiBaseUrl });

type AppState = {
  loading: boolean;
  loadingPhrase: boolean;
  error?: string;
  searchError?: string;
  nodeStatus?: NodeStatusResponse;
  nodeIdentity?: LocalNodeIdentity;
  syncStatus?: SyncStatusResponse;
  searchQuery: string;
  searchResults?: PhraseSearchResponse["results"];
  selectedPhrase?: PhraseRecord;
  bestMeaning?: BestMeaningResponse;
};

const state: AppState = {
  loading: true,
  loadingPhrase: false,
  searchQuery: "",
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

function field(label: string, value: unknown): string {
  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderHeader(): string {
  return `
    <header class="app-header">
      <div>
        <h1>DAOVibe Mycelium</h1>
        <p>local-first language layer</p>
      </div>
      <div class="api-pill">${escapeHtml(apiBaseUrl)}</div>
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
        ${renderSyncStatus()}
        ${renderGovernance()}
      </div>
      <div class="work-column">
        ${renderSearch()}
        ${renderPhraseDetail()}
      </div>
    </main>
  `;

  bindEvents();
}

function bindEvents(): void {
  const form = document.querySelector<HTMLFormElement>("#search-form");
  const input = document.querySelector<HTMLInputElement>("#search-input");

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
}

async function loadStatus(): Promise<void> {
  setState({ loading: true, error: undefined });

  try {
    const [nodeStatus, nodeIdentity, syncStatus] = await Promise.all([
      client.getNodeStatus(),
      client.getNodeIdentity(),
      client.getSyncStatus(),
    ]);

    setState({
      loading: false,
      nodeStatus,
      nodeIdentity: nodeIdentity.identity,
      syncStatus,
    });
  } catch (error) {
    setState({
      loading: false,
      error:
        error instanceof Error
          ? `Mycelium server is not reachable. ${error.message}`
          : "Mycelium server is not reachable.",
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
    selectedPhrase: undefined,
    bestMeaning: undefined,
  });

  try {
    const [phrase, bestMeaning] = await Promise.all([
      client.getPhrase(phraseId),
      client.getBestMeaning(phraseId),
    ]);

    setState({
      loadingPhrase: false,
      selectedPhrase: phrase.phrase,
      bestMeaning,
    });
  } catch (error) {
    setState({
      loadingPhrase: false,
      searchError:
        error instanceof Error ? error.message : "Phrase detail failed.",
    });
  }
}

render();
void loadStatus();
