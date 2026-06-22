import type {
  MyceliumClient,
  ObservePhraseResponse,
  ProposeMeaningResponse,
} from "@mycelium/client";
import type { AppState } from "./appState";
import {
  createMeaningId,
  createPhraseId,
  optionalTrimmed,
} from "./uiFormatting";

export type SetAppState = (nextState: Partial<AppState>) => void;

export type AppActions = {
  loadStatus: () => Promise<void>;
  loadDiagnostics: () => Promise<void>;
  searchPhrases: (query: string) => Promise<void>;
  selectPhrase: (phraseId: string) => Promise<void>;
  loadPacketTrace: (phraseId: string) => Promise<void>;
  refreshAfterWrite: (phraseId: string, searchQuery?: string) => Promise<void>;
  observePhrase: (formData: FormData) => Promise<void>;
  proposeMeaning: (formData: FormData) => Promise<void>;
  proposeMeaningCorrection: (formData: FormData) => Promise<void>;
  voteMeaningCorrection: (formData: FormData) => Promise<void>;
};

export function createAppActions({
  client,
  state,
  setState,
}: {
  client: MyceliumClient;
  state: AppState;
  setState: SetAppState;
}): AppActions {
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

  async function proposeMeaningCorrection(formData: FormData): Promise<void> {
    const phraseId = String(formData.get("phrase_id") ?? "").trim();
    const originalMeaningId = String(
      formData.get("original_meaning_id") ?? ""
    ).trim();
    const correctionId = String(formData.get("correction_id") ?? "").trim();
    const correctedReferenceMeaning = String(
      formData.get("corrected_reference_meaning") ?? ""
    ).trim();
    const correctionContext = String(
      formData.get("correction_context") ?? ""
    ).trim();
    const source = String(formData.get("source") ?? "").trim();

    state.correctionProposalForm = {
      phraseId,
      originalMeaningId,
      correctionId,
      correctedReferenceMeaning,
      correctionContext,
      source,
    };

    if (!phraseId) {
      setState({
        correctionProposalResult: {
          kind: "error",
          message: "phrase_id is required.",
        },
      });
      return;
    }

    if (!originalMeaningId) {
      setState({
        correctionProposalResult: {
          kind: "error",
          message: "original_meaning_id is required.",
        },
      });
      return;
    }

    if (!correctionId) {
      setState({
        correctionProposalResult: {
          kind: "error",
          message: "correction_id is required.",
        },
      });
      return;
    }

    if (!correctedReferenceMeaning) {
      setState({
        correctionProposalResult: {
          kind: "error",
          message: "corrected_reference_meaning is required.",
        },
      });
      return;
    }

    setState({
      proposingCorrection: true,
      correctionProposalResult: undefined,
    });

    try {
      const result = await client.proposeMeaningCorrection({
        phrase_id: phraseId,
        original_meaning_id: originalMeaningId,
        correction_id: correctionId,
        corrected_reference_meaning: correctedReferenceMeaning,
        correction_context: optionalTrimmed(correctionContext),
        source: optionalTrimmed(source),
      });

      state.correctionProposalForm.correctedReferenceMeaning = "";
      state.correctionProposalForm.correctionContext = "";

      setState({
        proposingCorrection: false,
        correctionProposalResult: {
          kind: "success",
          message: `Proposed correction ${correctionId} with packet ${result.result.packet_id}.`,
        },
      });

      await refreshAfterWrite(phraseId, state.searchQuery || undefined);
    } catch (error) {
      setState({
        proposingCorrection: false,
        correctionProposalResult: {
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Meaning correction proposal failed.",
        },
      });
    }
  }

  async function voteMeaningCorrection(formData: FormData): Promise<void> {
    const phraseId = String(formData.get("phrase_id") ?? "").trim();
    const correctionId = String(formData.get("correction_id") ?? "").trim();
    const voteText = String(formData.get("vote") ?? "").trim();
    const voter = String(formData.get("voter") ?? "").trim();
    const vote =
      voteText === "confirm" || voteText === "reject" ? voteText : undefined;

    state.correctionVoteForm = {
      phraseId,
      correctionId,
      vote: vote ?? "confirm",
      voter,
    };

    if (!phraseId) {
      setState({
        correctionVoteResult: {
          kind: "error",
          message: "phrase_id is required.",
        },
      });
      return;
    }

    if (!correctionId) {
      setState({
        correctionVoteResult: {
          kind: "error",
          message: "correction_id is required.",
        },
      });
      return;
    }

    if (!vote) {
      setState({
        correctionVoteResult: {
          kind: "error",
          message: "vote must be confirm or reject.",
        },
      });
      return;
    }

    setState({
      votingCorrection: true,
      correctionVoteResult: undefined,
    });

    try {
      const result = await client.voteMeaningCorrection({
        phrase_id: phraseId,
        correction_id: correctionId,
        vote,
        voter: optionalTrimmed(voter),
      });

      state.correctionVoteForm.voter = "";

      setState({
        votingCorrection: false,
        correctionVoteResult: {
          kind: "success",
          message: `Voted ${vote} on ${correctionId} with packet ${result.result.packet_id}.`,
        },
      });

      await refreshAfterWrite(phraseId, state.searchQuery || undefined);
    } catch (error) {
      setState({
        votingCorrection: false,
        correctionVoteResult: {
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Meaning correction vote failed.",
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

  return {
    loadStatus,
    loadDiagnostics,
    searchPhrases,
    selectPhrase,
    loadPacketTrace,
    refreshAfterWrite,
    observePhrase,
    proposeMeaning,
    proposeMeaningCorrection,
    voteMeaningCorrection,
  };
}
