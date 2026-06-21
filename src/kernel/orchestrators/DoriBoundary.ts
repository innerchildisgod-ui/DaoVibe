export type DoriDecisionAction =
  | "store"
  | "sync"
  | "show"
  | "review"
  | "ignore";

export type DoriEventType =
  | "phrase_observation"
  | "meaning_proposal"
  | "meaning_vote"
  | "correction_proposal"
  | "correction_vote"
  | "tombstone_proposal"
  | "tombstone_vote"
  | "packet_trace"
  | "ledger_export"
  | "ledger_import"
  | "unknown";

export type DoriEventSource = "local" | "sync" | "import" | "app" | "unknown";

export interface DoriMemoryEventInput {
  event_type: DoriEventType;
  source: DoriEventSource;
  packet_type?: string;
  phrase_id?: string;
  meaning_id?: string;
  correction_id?: string;
  tombstone_id?: string;
}

export interface DoriDecision {
  action: DoriDecisionAction;
  allowed: boolean;
  reason: string;
  confidence: number;
  native_required: boolean;
}

export interface DoriNativeOrchestrator {
  describeRole(): string;
  reviewMemoryEvent(input: DoriMemoryEventInput): DoriDecision;
}

function advisoryStoreDecision(): DoriDecision {
  return {
    action: "store",
    allowed: true,
    reason:
      "Advisory TypeScript boundary only; future native Dori review is required before enforcement.",
    confidence: 0.6,
    native_required: true,
  };
}

export class TypeScriptDoriBoundaryStub implements DoriNativeOrchestrator {
  describeRole(): string {
    return "Dori is the future native-core orchestrator for Mycelium memory, store, seed, visibility, and lifecycle review decisions.";
  }

  reviewMemoryEvent(input: DoriMemoryEventInput): DoriDecision {
    // Advisory only. No side effects. No storage writes. No deletion.
    switch (input.event_type) {
      case "phrase_observation":
      case "meaning_proposal":
      case "meaning_vote":
      case "correction_proposal":
      case "correction_vote":
      case "tombstone_proposal":
      case "tombstone_vote":
        return advisoryStoreDecision();

      case "packet_trace":
        return {
          action: "show",
          allowed: true,
          reason:
            "Advisory TypeScript boundary only; packet traces may be shown without native enforcement.",
          confidence: 0.7,
          native_required: false,
        };

      case "ledger_export":
        return {
          action: "show",
          allowed: true,
          reason:
            "Advisory TypeScript boundary only; ledger exports may be shown without native enforcement.",
          confidence: 0.6,
          native_required: false,
        };

      case "ledger_import":
        return {
          action: "review",
          allowed: true,
          reason:
            "Advisory TypeScript boundary only; future native Dori review is required before ledger import enforcement.",
          confidence: 0.5,
          native_required: true,
        };

      case "unknown":
        return {
          action: "review",
          allowed: false,
          reason:
            "Advisory TypeScript boundary only; unknown memory events require future native Dori review before enforcement.",
          confidence: 0.2,
          native_required: true,
        };
    }
  }
}
