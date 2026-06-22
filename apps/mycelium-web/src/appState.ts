import type {
  BestMeaningExplanationResponse,
  BestMeaningResponse,
  CorrectionSummary,
  LocalNodeIdentity,
  LocalNodeSettings,
  NodeDiagnosticsResponse,
  NodeStatusResponse,
  PhrasePacketTraceResponse,
  PhraseRecord,
  PhraseSearchResponse,
  SyncStatusResponse,
  TombstoneSummary,
} from "@mycelium/client";
import type { FormResult } from "./formRendering";
import type {
  CorrectionProposalFormState,
  CorrectionVoteFormState,
  ObserveFormState,
  ProposeFormState,
} from "./contributionRendering";

export type AppState = {
  loading: boolean;
  loadingPhrase: boolean;
  loadingExplanation: boolean;
  loadingPacketTrace: boolean;
  loadingDiagnostics: boolean;
  loadingGovernance: boolean;
  observingPhrase: boolean;
  proposingMeaning: boolean;
  proposingCorrection: boolean;
  votingCorrection: boolean;
  error?: string;
  searchError?: string;
  explanationError?: string;
  packetTraceError?: string;
  diagnosticsError?: string;
  governanceError?: string;
  observeResult?: FormResult;
  proposeResult?: FormResult;
  correctionProposalResult?: FormResult;
  correctionVoteResult?: FormResult;
  nodeStatus?: NodeStatusResponse;
  nodeDiagnostics?: NodeDiagnosticsResponse["diagnostics"];
  nodeIdentity?: LocalNodeIdentity;
  nodeSettings?: LocalNodeSettings;
  syncStatus?: SyncStatusResponse;
  searchQuery: string;
  observeForm: ObserveFormState;
  proposeForm: ProposeFormState;
  correctionProposalForm: CorrectionProposalFormState;
  correctionVoteForm: CorrectionVoteFormState;
  searchResults?: PhraseSearchResponse["results"];
  selectedPhrase?: PhraseRecord;
  bestMeaning?: BestMeaningResponse;
  meaningExplanation?: BestMeaningExplanationResponse;
  packetTrace?: PhrasePacketTraceResponse;
  corrections?: CorrectionSummary[];
  tombstones?: TombstoneSummary[];
};

export const state: AppState = {
  loading: true,
  loadingPhrase: false,
  loadingExplanation: false,
  loadingPacketTrace: false,
  loadingDiagnostics: false,
  loadingGovernance: false,
  observingPhrase: false,
  proposingMeaning: false,
  proposingCorrection: false,
  votingCorrection: false,
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
  correctionProposalForm: {
    phraseId: "",
    originalMeaningId: "",
    correctionId: "",
    correctedReferenceMeaning: "",
    correctionContext: "",
    source: "",
  },
  correctionVoteForm: {
    phraseId: "",
    correctionId: "",
    vote: "confirm",
    voter: "",
  },
};
