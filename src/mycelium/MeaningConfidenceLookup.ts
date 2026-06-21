import type {
  KnowledgeMeaningRecord,
  KnowledgePhraseRecord,
} from "../storage/sqliteStore";
import type { LmpPacket } from "../protocol/packet";
import type {
  MeaningProposalPayload,
  MeaningVotePayload,
  PacketType,
} from "../protocol/packetTypes";
import {
  calculateMeaningScore,
  countUniqueVoterVotes,
  type UniqueVoterVoteInput,
} from "./LanguageConfidence";

export interface MeaningConfidenceLookupSource {
  listKnowledge(): KnowledgePhraseRecord[];
  listPacketsByPhraseAndTypes?(
    phraseId: string,
    packetTypes: PacketType[]
  ): LmpPacket[];
  listPacketsForPhraseByTypes?(
    phraseId: string,
    packetTypes: PacketType[]
  ): LmpPacket[];
}

export interface MeaningVoteEvidence {
  confidence?: number;
  confirm_votes: number;
  reject_votes: number;
}

interface MeaningProposalConfidence {
  confidence: number;
  created_at: number;
  packet_id: string;
}

export interface ScoredMeaningDetails {
  meaning_id: string;
  reference_meaning: string;
  context?: string;
  confidence: number;
  confirms: number;
  rejects: number;
  score: number;
  total_votes: number;
}

const MEANING_CONFIDENCE_PACKET_TYPES: PacketType[] = [
  "meaning_proposal",
  "meaning_vote",
];

export function listMeaningConfidencePacketsForPhrase(
  source: MeaningConfidenceLookupSource,
  phraseId: string
): LmpPacket[] {
  return (
    source.listPacketsForPhraseByTypes?.(
      phraseId,
      MEANING_CONFIDENCE_PACKET_TYPES
    ) ??
    source.listPacketsByPhraseAndTypes?.(
      phraseId,
      MEANING_CONFIDENCE_PACKET_TYPES
    ) ??
    []
  );
}

export function listKnowledgeWithEffectiveMeaningVotes(
  source: MeaningConfidenceLookupSource
): KnowledgePhraseRecord[] {
  return source
    .listKnowledge()
    .map((phrase) => applyMeaningVoteEvidence(source, phrase));
}

export function applyMeaningVoteEvidence(
  source: MeaningConfidenceLookupSource,
  phrase: KnowledgePhraseRecord
): KnowledgePhraseRecord {
  const meaningVoteEvidence = summarizeMeaningVoteEvidenceForPhrase(
    phrase.phrase_id,
    listMeaningConfidencePacketsForPhrase(source, phrase.phrase_id)
  );

  if (meaningVoteEvidence.size === 0) {
    return phrase;
  }

  return {
    ...phrase,
    meanings: phrase.meanings.map((meaning) =>
      toMeaningRecordWithEvidence(
        meaning,
        meaningVoteEvidence.get(meaning.meaning_id)
      )
    ),
  };
}

export function toScoredMeaning(
  meaning: KnowledgeMeaningRecord,
  evidence?: MeaningVoteEvidence
): ScoredMeaningDetails {
  const score = calculateMeaningScore({
    confidence: evidence?.confidence ?? meaning.confidence,
    confirms: evidence ? evidence.confirm_votes : meaning.confirms,
    rejects: evidence ? evidence.reject_votes : meaning.rejects,
  });

  return {
    meaning_id: meaning.meaning_id,
    reference_meaning: meaning.reference_meaning,
    context: meaning.context,
    confidence: score.confidence,
    confirms: score.confirms,
    rejects: score.rejects,
    score: score.score,
    total_votes: score.total_votes,
  };
}

export function summarizeMeaningVoteEvidenceForPhrase(
  phraseId: string,
  packets: LmpPacket[]
): Map<string, MeaningVoteEvidence> {
  const proposalConfidenceByMeaning = new Map<
    string,
    MeaningProposalConfidence
  >();
  const votes: UniqueVoterVoteInput[] = [];

  for (const packet of packets) {
    if (packet.packet_type === "meaning_proposal") {
      const payload = packet.payload as MeaningProposalPayload;

      if (isMeaningProposalForPhrase(payload, phraseId)) {
        const candidate = {
          confidence: payload.confidence,
          created_at:
            typeof packet.created_at === "number" ? packet.created_at : 0,
          packet_id: packet.packet_id,
        };
        const existing = proposalConfidenceByMeaning.get(payload.meaning_id);

        if (
          !existing ||
          compareMeaningProposalConfidence(candidate, existing) < 0
        ) {
          proposalConfidenceByMeaning.set(payload.meaning_id, candidate);
        }
      }
    }

    if (packet.packet_type === "meaning_vote") {
      const payload = packet.payload as MeaningVotePayload;

      if (isMeaningVoteForPhrase(payload, phraseId)) {
        votes.push({
          target_key: payload.meaning_id,
          voter_id: meaningVoteVoterId(packet),
          vote: payload.vote,
          created_at: packet.created_at,
          packet_id: packet.packet_id,
        });
      }
    }
  }

  const voteCounts = countUniqueVoterVotes(votes);
  const meaningIds = new Set([
    ...proposalConfidenceByMeaning.keys(),
    ...voteCounts.keys(),
  ]);
  const evidenceByMeaning = new Map<string, MeaningVoteEvidence>();

  for (const meaningId of meaningIds) {
    const counts = voteCounts.get(meaningId) ?? {
      confirm_votes: 0,
      reject_votes: 0,
    };
    const proposalConfidence = proposalConfidenceByMeaning.get(meaningId);

    evidenceByMeaning.set(meaningId, {
      confidence: proposalConfidence?.confidence,
      confirm_votes: counts.confirm_votes,
      reject_votes: counts.reject_votes,
    });
  }

  return evidenceByMeaning;
}

function toMeaningRecordWithEvidence(
  meaning: KnowledgeMeaningRecord,
  evidence?: MeaningVoteEvidence
): KnowledgeMeaningRecord {
  if (!evidence) {
    return meaning;
  }

  return {
    ...meaning,
    confidence: evidence.confidence ?? meaning.confidence,
    confirms: evidence.confirm_votes,
    rejects: evidence.reject_votes,
  };
}

function isMeaningProposalForPhrase(
  payload: MeaningProposalPayload,
  phraseId: string
): boolean {
  return (
    payload.phrase_id === phraseId &&
    isNonEmptyString(payload.meaning_id) &&
    isNonEmptyString(payload.reference_meaning) &&
    typeof payload.confidence === "number" &&
    Number.isFinite(payload.confidence)
  );
}

function isMeaningVoteForPhrase(
  payload: MeaningVotePayload,
  phraseId: string
): payload is MeaningVotePayload & { vote: "confirm" | "reject" } {
  return (
    payload.phrase_id === phraseId &&
    isNonEmptyString(payload.meaning_id) &&
    (payload.vote === "confirm" || payload.vote === "reject")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function meaningVoteVoterId(packet: LmpPacket): string | undefined {
  return isNonEmptyString(packet.author) ? packet.author.trim() : undefined;
}

function compareMeaningProposalConfidence(
  left: MeaningProposalConfidence,
  right: MeaningProposalConfidence
): number {
  if (left.created_at !== right.created_at) {
    return left.created_at - right.created_at;
  }

  return left.packet_id.localeCompare(right.packet_id);
}