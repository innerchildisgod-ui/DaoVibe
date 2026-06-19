import { buildClientUrl, ClientQueryValue } from "./clientUrl";

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

export interface UpdateNodeIdentityInput {
  display_name?: string;
  default_author?: string;
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

export class MyceliumClient {
  private readonly baseUrl: string;

  constructor(options: MyceliumClientOptions) {
    this.baseUrl = options.baseUrl;
  }

  getNodeIdentity(): Promise<LocalNodeIdentityResponse> {
    return this.getJson("/node/identity");
  }

  updateNodeIdentity(
    input: UpdateNodeIdentityInput
  ): Promise<LocalNodeIdentityResponse> {
    return this.postJson("/node/identity", input);
  }

  getNodeStatus(): Promise<NodeStatusResponse> {
    return this.getJson("/node/status");
  }

  getSyncStatus(): Promise<SyncStatusResponse> {
    return this.getJson("/sync/status");
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
      const detail = bodyText ? `: ${bodyText}` : "";

      throw new Error(
        `Mycelium request failed (${response.status} ${response.statusText}) ${url}${detail}`
      );
    }

    return (await response.json()) as T;
  }
}
