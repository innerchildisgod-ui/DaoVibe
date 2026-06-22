import type {
  BestMeaningExplanationResponse,
  CorrectionSummary,
  NodeDiagnosticsResponse,
  NodeStatusResponse,
  PhrasePacketTraceResponse,
  PhraseRecord,
  TombstoneSummary,
} from "@mycelium/client";
import { field } from "./formRendering";
import { escapeHtml, statusText } from "./uiFormatting";

export type GovernanceRenderingState = {
  loading: boolean;
  loadingPhrase: boolean;
  loadingGovernance: boolean;
  governanceError?: string;
  selectedPhrase?: PhraseRecord;
  corrections?: CorrectionSummary[];
  tombstones?: TombstoneSummary[];
  nodeStatus?: NodeStatusResponse;
  nodeDiagnostics?: NodeDiagnosticsResponse["diagnostics"];
  meaningExplanation?: BestMeaningExplanationResponse;
  packetTrace?: PhrasePacketTraceResponse;
};

export function renderCorrectionRows(corrections: CorrectionSummary[]): string {
  if (corrections.length === 0) {
    return `<p class="muted">No corrections found for this phrase.</p>`;
  }

  return `
    <div class="packet-trace-list">
      ${corrections
        .map(
          (correction) => `
            <article
              class="packet-trace-row governance-correction-row"
              role="button"
              tabindex="0"
              data-correction-id="${escapeHtml(correction.correction_id)}"
            >
              <div class="packet-trace-heading">
                <strong>${escapeHtml(correction.correction_id)}</strong>
                <span>${escapeHtml(correction.status)}</span>
              </div>
              <p>${escapeHtml(correction.corrected_reference_meaning)}</p>
              <div class="packet-trace-meta">
                <span>score ${escapeHtml(correction.correction_score)}</span>
                <span>confirms ${escapeHtml(correction.confirm_votes)}</span>
                <span>rejects ${escapeHtml(correction.reject_votes)}</span>
                <span>rank ${escapeHtml(correction.conflict_rank)}</span>
                <span>conflict ${statusText(correction.is_conflicting)}</span>
                <span>original ${escapeHtml(correction.original_meaning_id)}</span>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderTombstoneRows(tombstones: TombstoneSummary[]): string {
  if (tombstones.length === 0) {
    return `<p class="muted">No correction tombstones found for this phrase.</p>`;
  }

  return `
    <div class="packet-trace-list">
      ${tombstones
        .map(
          (tombstone) => `
            <article class="packet-trace-row">
              <div class="packet-trace-heading">
                <strong>${escapeHtml(tombstone.tombstone_id)}</strong>
                <span>${escapeHtml(tombstone.status)}</span>
              </div>
              <p>${escapeHtml(tombstone.details ?? tombstone.reason)}</p>
              <div class="packet-trace-meta">
                <span>correction ${escapeHtml(tombstone.correction_id)}</span>
                <span>reason ${escapeHtml(tombstone.reason)}</span>
                <span>score ${escapeHtml(tombstone.tombstone_score)}</span>
                <span>confirms ${escapeHtml(tombstone.confirm_votes)}</span>
                <span>rejects ${escapeHtml(tombstone.reject_votes)}</span>
                <span>packet ${escapeHtml(tombstone.proposal_packet_id)}</span>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderGovernanceEvidence(state: GovernanceRenderingState): string {
  const corrections = state.corrections ?? [];
  const tombstones = state.tombstones ?? [];

  if (state.loadingPhrase || state.loadingGovernance) {
    return `
      <section class="panel governance-evidence-panel">
        <div class="panel-heading">
          <h2>Correction & Tombstone Evidence</h2>
          <span class="status warn">loading</span>
        </div>
        <p class="muted">Loading governance evidence.</p>
      </section>
    `;
  }

  if (!state.selectedPhrase) {
    return `
      <section class="panel governance-evidence-panel">
        <div class="panel-heading">
          <h2>Correction & Tombstone Evidence</h2>
        </div>
        <p class="muted">Select a phrase to inspect correction and tombstone evidence.</p>
      </section>
    `;
  }

  if (state.governanceError) {
    return `
      <section class="panel governance-evidence-panel">
        <div class="panel-heading">
          <h2>Correction & Tombstone Evidence</h2>
          <span class="status warn">unavailable</span>
        </div>
        <p class="form-message error">${escapeHtml(state.governanceError)}</p>
      </section>
    `;
  }

  return `
    <section class="panel governance-evidence-panel">
      <div class="panel-heading">
        <h2>Correction & Tombstone Evidence</h2>
        <span class="status ${corrections.length || tombstones.length ? "ok" : "warn"}">
          ${corrections.length || tombstones.length ? "loaded" : "empty"}
        </span>
      </div>
      <div class="field-grid evidence-grid">
        ${field("correction_count", corrections.length)}
        ${field("tombstone_count", tombstones.length)}
      </div>
      <h3>Corrections</h3>
      ${renderCorrectionRows(corrections)}
      <h3>Tombstones</h3>
      ${renderTombstoneRows(tombstones)}
    </section>
  `;
}

export function renderGovernance(state: GovernanceRenderingState): string {
  const statusSafety = state.nodeStatus?.capabilities;
  const diagnosticsSafety = state.nodeDiagnostics?.safety;
  const explanationSafety = state.meaningExplanation?.explanation;
  const packetTraceSafety = state.packetTrace?.safety;

  const tombstoneExecution =
    diagnosticsSafety?.tombstone_execution ??
    statusSafety?.tombstone_execution ??
    explanationSafety?.tombstone_execution_enabled ??
    packetTraceSafety?.tombstone_execution;

  const deletionEnabled =
    diagnosticsSafety?.deletion_enabled ?? packetTraceSafety?.deletion_enabled;

  const ledgerPruningEnabled =
    diagnosticsSafety?.ledger_pruning_enabled ??
    packetTraceSafety?.ledger_pruning_enabled;

  const hasRuntimeSafetyState =
    tombstoneExecution !== undefined ||
    deletionEnabled !== undefined ||
    ledgerPruningEnabled !== undefined;

  return `
    <section class="panel governance-panel">
      <div class="panel-heading">
        <h2>Governance Safety</h2>
        <span class="status ${tombstoneExecution ? "ok" : "warn"}">
          ${
            tombstoneExecution === true
              ? "execution enabled"
              : tombstoneExecution === false
                ? "execution disabled"
                : state.loading
                  ? "loading"
                  : "unknown"
          }
        </span>
      </div>
      <div class="field-grid">
        ${field("corrections", "available through backend")}
        ${field("tombstone_preview", "available through backend")}
        ${field("tombstone_execution", statusText(tombstoneExecution))}
        ${field("deletion_enabled", statusText(deletionEnabled))}
        ${field("ledger_pruning_enabled", statusText(ledgerPruningEnabled))}
        ${field(
          "runtime_source",
          hasRuntimeSafetyState ? "local node API" : "not loaded"
        )}
      </div>
    </section>
  `;
}
