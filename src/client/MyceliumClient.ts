import { buildClientUrl, type ClientQueryValue } from "./clientUrl";

export interface MyceliumClientOptions {
  baseUrl: string;
}

export interface LocalNodeIdentity {
  node_id: string;
  display_name: string;
  default_author: string;
  created_at: number;
  updated_at: number;
}

export interface LocalNodeIdentityResponse {
  ok: true;
  identity: LocalNodeIdentity;
}

export interface LocalNodeSettings {
  default_language_hint: string;
  default_safety_label: string;
  sync_mode: "manual";
  developer_mode: boolean;
  show_debug_panels: boolean;
  updated_at: number;
}

export interface NodeSettingsResponse {
  ok: true;
  settings: LocalNodeSettings;
}

export interface UpdateNodeIdentityInput {
  display_name?: string;
  default_author?: string;
}

export interface UpdateNodeSettingsInput {
  default_language_hint?: string;
  default_safety_label?: string;
  sync_mode?: "manual";
  developer_mode?: boolean;
  show_debug_panels?: boolean;
}

export interface NodeStatusResponse {
  ok: true;
  node: {
    node_id: string;
    display_name: string;
    default_author: string;
  };
  service: {
    name: "Mycelium";
    layer: "DAOVibe Mycelium";
    status: "ready";
    uptime_seconds: number;
    server_time: number;
  };
  ledger: {
    packet_count: number;
  };
  storage: {
    durable: true;
    engine: "sqlite";
  };
  settings: {
    sync_mode: "manual";
    developer_mode: boolean;
    show_debug_panels: boolean;
  };
  versions: {
    api_version: "mycelium-api.v1";
    protocol_version: "mycelium-lmp.v1";
    app_contract_version: "mycelium-app.v1";
  };
  capabilities: {
    phrase_lookup: true;
    meaning_proposals: true;
    meaning_votes: true;
    corrections: true;
    correction_maturity: true;
    tombstone_packets: true;
    tombstone_execution: false;
    sync: true;
  };
}

export interface NodeDiagnosticsResponse {
  ok: true;
  diagnostics: {
    server_reachable: true;
    server_time: number;
    uptime_seconds: number;
    versions: NodeStatusResponse["versions"];
    node: NodeStatusResponse["node"];
    settings: {
      sync_mode: "manual";
      developer_mode: boolean;
      show_debug_panels: boolean;
      default_language_hint: string;
      default_safety_label: string;
    };
    ledger: {
      packet_count: number;
      migration_count?: number;
    };
    sync: {
      enabled: true;
      mode: "manual";
      known_peer_count: number;
    };
    safety: {
      tombstone_execution: false;
      deletion_enabled: false;
      ledger_pruning_enabled: false;
    };
  };
}

export interface SyncStatusResponse {
  ok: true;
  sync: {
    enabled: true;
    mode: "manual";
    known_peer_count: number;
    peers: Array<{
      peer_author: string;
      cursor: string;
      updated_at: number;
    }>;
  };
}

export interface LedgerExportResponse {
  ok: true;
  export_type: "mycelium-ledger-export";
  api_version: string;
  protocol_version: string;
  exported_at: number;
  packet_count: number;
  packets: unknown[];
}

export interface LedgerImportInput {
  packets: unknown[];
}

export interface LedgerImportResponse {
  ok: true;
  import_result: {
    accepted_new_count: number;
    already_stored_count: number;
    rejected_invalid_count: number;
    rejected_expired_count: number;
    failed_count: number;
  };
}

export interface PhraseSearchResponse {
  ok: true;
  query: string;
  count: number;
  results: Array<{
    phrase_id: string;
    surface_text?: string;
    phonetic_hint?: string;
    language_hint?: string;
    safety_label: string;
    meaning_count: number;
  }>;
}

export interface MeaningRecord {
  meaning_id: string;
  reference_meaning: string;
  context?: string;
  confidence: number;
  confirms: number;
  rejects: number;
}

export interface PhraseRecord {
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  safety_label: string;
  meanings: MeaningRecord[];
}

export interface PhraseResponse {
  ok: true;
  phrase: PhraseRecord;
}

export interface BestMeaningResponse {
  ok: true;
  phrase_id: string;
  has_best_meaning: boolean;
  best_meaning: null | (MeaningRecord & {
    score: number;
    total_votes: number;
    source?: "correction";
    correction_id?: string;
    original_meaning_id?: string;
    confirm_votes?: number;
    reject_votes?: number;
    correction_score?: number;
  });
  reason?: string;
}

export interface BestMeaningExplanationResponse {
  ok: true;
  phrase_id: string;
  phrase?: {
    phrase_id: string;
    surface_text?: string;
    phonetic_hint?: string;
    language_hint?: string;
    safety_label?: string;
  };
  best_meaning?: {
    meaning_id?: string;
    reference_meaning?: string;
    confidence?: number;
    score?: number;
    confirms?: number;
    rejects?: number;
    total_votes?: number;
    source: "base_meaning" | "correction";
  };
  explanation: {
    summary: string;
    reasons: string[];
    tombstone_execution_enabled: false;
  };
  evidence: {
    meaning_count: number;
    correction_count: number;
    confirmed_correction_count: number;
    maturing_correction_count: number;
    tombstone_count: number;
    confirmed_tombstone_count: number;
  };
}

export type PhrasePacketTraceRole =
  | "phrase_observation"
  | "meaning_proposal"
  | "meaning_vote"
  | "safety_label"
  | "correction_proposal"
  | "correction_vote"
  | "tombstone_proposal"
  | "tombstone_vote"
  | "unknown";

export interface PhrasePacketTraceResponse {
  ok: true;
  phrase_id: string;
  trace: {
    packet_count: number;
    packet_types: Record<string, number>;
    packets: Array<{
      packet_id: string;
      packet_type: string;
      author?: string;
      parent?: string;
      phrase_id?: string;
      meaning_id?: string;
      correction_id?: string;
      tombstone_id?: string;
      created_at?: number | string;
      received_at?: number;
      role: PhrasePacketTraceRole;
      summary: string;
    }>;
  };
  safety: {
    tombstone_execution: false;
    deletion_enabled: false;
    ledger_pruning_enabled: false;
  };
}

export type InputType = "speech" | "text" | "symbol" | "drawing";
export type MeaningVoteValue = "confirm" | "reject" | "unsure";
export type GovernanceVoteValue = "confirm" | "reject";
export type CorrectionStatus =
  | "pending"
  | "maturing"
  | "confirmed"
  | "rejected"
  | "contested";
export type TombstoneStatus = CorrectionStatus;
export type CorrectionCleanupReason =
  | "rejected_status"
  | "negative_score"
  | "losing_conflict_candidate";
export type TombstoneReason =
  | CorrectionCleanupReason
  | "spam"
  | "malformed"
  | "other";

export interface ObservePhraseInput {
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  input_type?: InputType;
}

export interface ProposeMeaningInput {
  phrase_id: string;
  meaning_id: string;
  reference_meaning: string;
  context?: string;
  confidence: number;
  parent?: string;
}

export interface VoteMeaningInput {
  phrase_id: string;
  meaning_id: string;
  vote: MeaningVoteValue;
  confidence: number;
  parent?: string;
}

export interface AppWriteResult {
  packet_id: string;
  packet_type: string;
  created_at: number;
  local_apply_status: "applied_to_knowledge" | "stored_event_only";
  packet_size_class: string;
  route_decision: string;
}

export interface ObservePhraseResponse {
  ok: true;
  result: AppWriteResult & {
    phrase_id: string;
    packet_type: "phrase_observed";
    local_apply_status: "applied_to_knowledge";
  };
}

export interface ProposeMeaningResponse {
  ok: true;
  result: AppWriteResult & {
    phrase_id: string;
    meaning_id: string;
    packet_type: "meaning_proposal";
    local_apply_status: "applied_to_knowledge";
  };
}

export interface VoteMeaningResponse {
  ok: true;
  result: AppWriteResult & {
    phrase_id: string;
    meaning_id: string;
    vote: MeaningVoteValue;
    packet_type: "meaning_vote";
    local_apply_status: "applied_to_knowledge";
  };
}

export interface CorrectionSummary {
  phrase_id: string;
  original_meaning_id: string;
  correction_id: string;
  corrected_reference_meaning: string;
  correction_context?: string;
  source?: string;
  confirm_votes: number;
  reject_votes: number;
  correction_score: number;
  status: CorrectionStatus;
  conflict_group_id: string;
  conflict_rank: number;
  is_conflicting: boolean;
}

export interface CorrectionSummaryResponse {
  ok: true;
  phrase_id: string;
  corrections: CorrectionSummary[];
}

export type CorrectionHistoryEvent =
  | {
      event_type: "correction_proposed";
      phrase_id: string;
      original_meaning_id: string;
      correction_id: string;
      corrected_reference_meaning: string;
      correction_context?: string;
      source?: string;
      packet_id?: string;
      created_at?: string | number;
    }
  | {
      event_type: "correction_vote";
      phrase_id: string;
      correction_id: string;
      vote: GovernanceVoteValue;
      voter?: string;
      packet_id?: string;
      created_at?: string | number;
    };

export interface CorrectionHistoryResponse {
  ok: true;
  phrase_id: string;
  limit: number;
  history: CorrectionHistoryEvent[];
}

export interface CorrectionCleanupCandidatesResponse {
  ok: true;
  phrase_id: string;
  candidates: Array<
    CorrectionSummary & {
      cleanup_reasons: CorrectionCleanupReason[];
    }
  >;
}

export interface ProposeMeaningCorrectionInput {
  phrase_id: string;
  original_meaning_id: string;
  correction_id: string;
  corrected_reference_meaning: string;
  correction_context?: string;
  source?: string;
  parent?: string;
}

export interface VoteMeaningCorrectionInput {
  phrase_id: string;
  correction_id: string;
  vote: GovernanceVoteValue;
  voter?: string;
  parent?: string;
}

export interface GovernanceWriteResponse {
  ok: true;
  accepted: true;
  result: AppWriteResult & Record<string, unknown>;
}

export interface TombstoneSummary {
  phrase_id: string;
  correction_id: string;
  tombstone_id: string;
  reason: TombstoneReason;
  details?: string;
  proposer?: string;
  proposal_packet_id: string;
  proposed_at: number;
  confirm_votes: number;
  reject_votes: number;
  tombstone_score: number;
  status: TombstoneStatus;
}

export interface TombstoneSummaryResponse {
  ok: true;
  phrase_id: string;
  tombstones: TombstoneSummary[];
}

export interface TombstoneExecutionPreviewResponse {
  ok: true;
  phrase_id: string;
  execution_enabled: false;
  suppressed_count: number;
  active_count: number;
  suppressed_corrections: Array<{
    phrase_id: string;
    correction_id: string;
    correction_status: string;
    correction_score: number;
    tombstone_id: string;
    tombstone_reason: string;
    tombstone_score: number;
    tombstone_status: "confirmed";
  }>;
  active_corrections: Array<{
    phrase_id: string;
    correction_id: string;
    correction_status: string;
    correction_score: number;
  }>;
}

export interface ProposeMeaningCorrectionTombstoneInput {
  phrase_id: string;
  correction_id: string;
  tombstone_id: string;
  reason: TombstoneReason;
  details?: string;
  proposer?: string;
  parent?: string;
}

export interface VoteMeaningCorrectionTombstoneInput {
  phrase_id: string;
  correction_id: string;
  tombstone_id: string;
  vote: GovernanceVoteValue;
  voter?: string;
  parent?: string;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface KycKnownVerifierVoteCounts {
  same_person: number;
  not_same_person: number;
  unsure: number;
  suspicious: number;
  low_quality: number;
}

export interface KycClaimSummary {
  kyc_claim_id: string;
  subject_node_id: string;
  country_hint?: string;
  document_type_hint?: string;
  claim_packet_id: string;
  claimed_at: number;
  status: string;
  packet_count: number;
  evidence_count: number;
  evidence_bundle_hashes: string[];
  full_id_shared: boolean;
  evidence_expired: boolean;
  expired_evidence_ids: string[];
  latest_ai_result?: string;
  latest_ai_assessment_packet_id?: string;
  known_verifier_invite_count: number;
  known_verifier_vote_counts: KycKnownVerifierVoteCounts;
  latest_quorum_packet_id?: string;
  latest_quorum_reason?: string;
}

export interface KycClaimSummaryResponse {
  ok: true;
  summary: KycClaimSummary;
}


export type PaymentDerivedStatus =
  | "missing"
  | "intent_created"
  | "proof_submitted"
  | "vendor_received"
  | "vendor_not_received"
  | "vendor_needs_review";

export interface PaymentStatusSummary {
  payment_intent_id: string;
  status: PaymentDerivedStatus;
  intent_packet_id?: string;
  proof_packet_id?: string;
  acknowledgement_packet_id?: string;
  order_reference_id?: string;
  buyer_subject_node_id?: string;
  vendor_subject_node_id?: string;
  buyer_kyc_claim_id?: string;
  vendor_kyc_claim_id?: string;
  proof_id?: string;
  acknowledgement_id?: string;
  external_rail?: string;
  currency_code?: string;
  amount_minor_units?: number;
  acknowledgement_status?: "received" | "not_received" | "needs_review";
  reason?: string;
}

export interface PaymentStatusSummaryResponse {
  ok: true;
  summary: PaymentStatusSummary;
}

export type OrderFulfillmentDerivedStatus =
  | "missing"
  | "payment_intent_created"
  | "payment_proof_submitted"
  | "payment_acknowledged"
  | "fulfillment_started"
  | "fulfillment_completed";

export interface OrderFulfillmentStatusSummary {
  order_reference_id: string;
  status: OrderFulfillmentDerivedStatus;
  intent_packet_id?: string;
  proof_packet_id?: string;
  acknowledgement_packet_id?: string;
  fulfillment_packet_id?: string;
  completion_packet_id?: string;
  payment_intent_id?: string;
  proof_id?: string;
  acknowledgement_id?: string;
  fulfillment_id?: string;
  completion_id?: string;
  buyer_subject_node_id?: string;
  vendor_subject_node_id?: string;
  buyer_kyc_claim_id?: string;
  vendor_kyc_claim_id?: string;
  external_rail?: string;
  currency_code?: string;
  amount_minor_units?: number;
  acknowledgement_status?: "received" | "not_received" | "needs_review";
  fulfilled_started_at?: number;
  fulfilled_completed_at?: number;
  memo?: string;
}

export interface OrderFulfillmentStatusSummaryResponse {
  ok: true;
  summary: OrderFulfillmentStatusSummary;
}

export class MyceliumClientError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly code?: string;
  readonly details?: unknown;

  constructor(args: {
    status: number;
    statusText: string;
    url: string;
    code?: string;
    message?: string;
    details?: unknown;
    bodyText?: string;
  }) {
    const codePrefix = args.code ? `${args.code}: ` : "";
    const detail =
      args.message !== undefined && args.message.length > 0
        ? `: ${codePrefix}${args.message}`
        : args.bodyText
          ? `: ${args.bodyText}`
          : "";

    super(
      `Mycelium request failed (${args.status} ${args.statusText}) ${args.url}${detail}`
    );

    this.name = "MyceliumClientError";
    this.status = args.status;
    this.statusText = args.statusText;
    this.url = args.url;
    this.code = args.code;
    this.details = args.details;
  }
}

export class MyceliumClient {
  private readonly baseUrl: string;

  constructor(options: MyceliumClientOptions) {
    this.baseUrl = options.baseUrl;
  }

  getNodeIdentity(): Promise<LocalNodeIdentityResponse> {
    return this.getJson("/node/identity");
  }

  getNodeSettings(): Promise<NodeSettingsResponse> {
    return this.getJson("/node/settings");
  }

  updateNodeSettings(
    input: UpdateNodeSettingsInput
  ): Promise<NodeSettingsResponse> {
    return this.postJson("/node/settings", input);
  }

  updateNodeIdentity(
    input: UpdateNodeIdentityInput
  ): Promise<LocalNodeIdentityResponse> {
    return this.postJson("/node/identity", input);
  }

  getNodeStatus(): Promise<NodeStatusResponse> {
    return this.getJson("/node/status");
  }

  getNodeDiagnostics(): Promise<NodeDiagnosticsResponse> {
    return this.getJson("/node/diagnostics");
  }

  getSyncStatus(): Promise<SyncStatusResponse> {
    return this.getJson("/sync/status");
  }

  exportLedger(): Promise<LedgerExportResponse> {
    return this.getJson("/ledger/export");
  }

  importLedger(input: LedgerImportInput): Promise<LedgerImportResponse> {
    return this.postJson("/ledger/import", input);
  }

  searchPhrases(
    query: string,
    limit?: number
  ): Promise<PhraseSearchResponse> {
    return this.getJson("/phrases/search", { q: query, limit });
  }

  getPhrase(phraseId: string): Promise<PhraseResponse> {
    return this.getJson(`/phrases/${encodeURIComponent(phraseId)}`);
  }

  getBestMeaning(phraseId: string): Promise<BestMeaningResponse> {
    return this.getJson(
      `/phrases/${encodeURIComponent(phraseId)}/bestMeaning`
    );
  }

  getBestMeaningExplanation(
    phraseId: string
  ): Promise<BestMeaningExplanationResponse> {
    return this.getJson(
      `/phrases/${encodeURIComponent(phraseId)}/explainBestMeaning`
    );
  }

  getPhrasePacketTrace(phraseId: string): Promise<PhrasePacketTraceResponse> {
    return this.getJson(
      `/phrases/${encodeURIComponent(phraseId)}/packetTrace`
    );
  }

  getKycClaimSummary(
    kycClaimId: string
  ): Promise<KycClaimSummaryResponse> {
    return this.getJson(
      `/kyc/claims/${encodeURIComponent(kycClaimId)}/summary`
    );
  }

  getPaymentStatusSummary(
    paymentIntentId: string
  ): Promise<PaymentStatusSummaryResponse> {
    return this.getJson(
      `/payments/${encodeURIComponent(paymentIntentId)}/status`
    );
  }

  getOrderFulfillmentStatusSummary(
    orderReferenceId: string
  ): Promise<OrderFulfillmentStatusSummaryResponse> {
    return this.getJson(
      `/orders/${encodeURIComponent(orderReferenceId)}/fulfillment/status`
    );
  }

  observePhrase(input: ObservePhraseInput): Promise<ObservePhraseResponse> {
    return this.postJson("/app/observePhrase", input);
  }

  proposeMeaning(input: ProposeMeaningInput): Promise<ProposeMeaningResponse> {
    return this.postJson("/app/proposeMeaning", input);
  }

  voteMeaning(input: VoteMeaningInput): Promise<VoteMeaningResponse> {
    return this.postJson("/app/voteMeaning", input);
  }

  getCorrections(phraseId: string): Promise<CorrectionSummaryResponse> {
    return this.getJson(`/phrases/${encodeURIComponent(phraseId)}/corrections`);
  }

  getCorrectionHistory(
    phraseId: string,
    limit?: number
  ): Promise<CorrectionHistoryResponse> {
    return this.getJson(
      `/phrases/${encodeURIComponent(phraseId)}/correctionHistory`,
      { limit }
    );
  }

  getCorrectionCleanupCandidates(
    phraseId: string
  ): Promise<CorrectionCleanupCandidatesResponse> {
    return this.getJson(
      `/phrases/${encodeURIComponent(phraseId)}/correctionCleanupCandidates`
    );
  }

  proposeMeaningCorrection(
    input: ProposeMeaningCorrectionInput
  ): Promise<GovernanceWriteResponse> {
    return this.postJson("/proposeMeaningCorrection", input);
  }

  voteMeaningCorrection(
    input: VoteMeaningCorrectionInput
  ): Promise<GovernanceWriteResponse> {
    return this.postJson("/voteMeaningCorrection", input);
  }

  getTombstones(phraseId: string): Promise<TombstoneSummaryResponse> {
    return this.getJson(`/phrases/${encodeURIComponent(phraseId)}/tombstones`);
  }

  getTombstoneExecutionPreview(
    phraseId: string
  ): Promise<TombstoneExecutionPreviewResponse> {
    return this.getJson(
      `/phrases/${encodeURIComponent(phraseId)}/tombstoneExecutionPreview`
    );
  }

  proposeMeaningCorrectionTombstone(
    input: ProposeMeaningCorrectionTombstoneInput
  ): Promise<GovernanceWriteResponse> {
    return this.postJson("/proposeMeaningCorrectionTombstone", input);
  }

  voteMeaningCorrectionTombstone(
    input: VoteMeaningCorrectionTombstoneInput
  ): Promise<GovernanceWriteResponse> {
    return this.postJson("/voteMeaningCorrectionTombstone", input);
  }

  private buildUrl(
    path: string,
    query?: Record<string, ClientQueryValue>
  ): string {
    return buildClientUrl(this.baseUrl, path, query);
  }

  private getJson<T>(
    path: string,
    query?: Record<string, ClientQueryValue>
  ): Promise<T> {
    return this.requestJson(path, {
      method: "GET",
    }, query);
  }

  private postJson<T>(path: string, body: unknown): Promise<T> {
    return this.requestJson(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    query?: Record<string, ClientQueryValue>
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const response = await fetch(url, init);

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const parsedError = parseErrorBody(bodyText);

      throw new MyceliumClientError({
        status: response.status,
        statusText: response.statusText,
        url,
        code: parsedError.code,
        message: parsedError.message,
        details: parsedError.details,
        bodyText,
      });
    }

    return (await response.json()) as T;
  }
}

function parseErrorBody(bodyText: string): {
  code?: string;
  message?: string;
  details?: unknown;
} {
  if (!bodyText) {
    return {};
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;

    if (parsed !== null && typeof parsed === "object") {
      const error = (parsed as { error?: unknown }).error;

      if (error !== null && typeof error === "object") {
        const errorRecord = error as {
          code?: unknown;
          message?: unknown;
          details?: unknown;
        };

        return {
          code:
            typeof errorRecord.code === "string"
              ? errorRecord.code
              : undefined,
          message:
            typeof errorRecord.message === "string"
              ? errorRecord.message
              : undefined,
          details: errorRecord.details,
        };
      }

      if (typeof error === "string") {
        return {
          message: error,
        };
      }
    }
  } catch (_error) {
    return {
      message: bodyText,
    };
  }

  return {
    message: bodyText,
  };
}
