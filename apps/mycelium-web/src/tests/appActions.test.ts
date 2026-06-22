import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppActions } from "../appActions";
import type { AppState } from "../appState";

function createUnitAppState(): AppState {
  return {
    loading: false,
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
}

function applyStateUpdate(state: AppState, nextState: Partial<AppState>): void {
  Object.assign(state, nextState);
}

function formData(values: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

function createClient(overrides: Record<string, unknown> = {}): never {
  return {
    getNodeStatus: vi.fn(async () => ({
      service: { status: "ready" },
      node: {
        node_id: "unit_web_node",
        default_author: "unit_web_author",
      },
      ledger: { packet_count: 1 },
    })),
    getNodeIdentity: vi.fn(async () => ({
      identity: {
        node_id: "unit_web_node",
        default_author: "unit_web_author",
      },
    })),
    getNodeSettings: vi.fn(async () => ({
      settings: { sync_mode: "manual" },
    })),
    getSyncStatus: vi.fn(async () => ({
      sync: { enabled: true },
    })),
    getNodeDiagnostics: vi.fn(async () => ({
      diagnostics: { server_reachable: true },
    })),
    searchPhrases: vi.fn(async () => ({
      results: [],
    })),
    getPhrase: vi.fn(async (phraseId: string) => ({
      phrase: {
        phrase_id: phraseId,
        surface_text: "unit web phrase",
      },
    })),
    getBestMeaning: vi.fn(async () => ({
      has_best_meaning: false,
    })),
    getBestMeaningExplanation: vi.fn(async () => ({
      best_meaning: undefined,
      evidence: { meaning_count: 0 },
    })),
    getPhrasePacketTrace: vi.fn(async () => ({
      trace: {
        packet_count: 0,
        packet_types: {},
      },
    })),
    getCorrections: vi.fn(async () => ({
      corrections: [],
    })),
    getTombstones: vi.fn(async () => ({
      tombstones: [],
    })),
    observePhrase: vi.fn(),
    proposeMeaning: vi.fn(),
    proposeMeaningCorrection: vi.fn(),
    voteMeaningCorrection: vi.fn(),
    ...overrides,
  } as never;
}

describe("createAppActions validation", () => {
  let state: AppState;

  beforeEach(() => {
    state = createUnitAppState();
  });

  it("rejects blank surface_text before calling observePhrase", async () => {
    const observePhrase = vi.fn();

    const actions = createAppActions({
      client: createClient({ observePhrase }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.observePhrase(
      formData({
        surface_text: "   ",
        language_hint: "English",
        phonetic_hint: "",
      })
    );

    expect(observePhrase).not.toHaveBeenCalled();
    expect(state.observeResult).toEqual({
      kind: "error",
      message: "surface_text is required.",
    });
    expect(state.observingPhrase).toBe(false);
  });

  it("rejects blank reference_meaning before calling proposeMeaning", async () => {
    const proposeMeaning = vi.fn();

    const actions = createAppActions({
      client: createClient({ proposeMeaning }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.proposeMeaning(
      formData({
        phrase_id: "unit_phrase",
        reference_meaning: "   ",
        context: "unit-test",
        confidence: "0.5",
      })
    );

    expect(proposeMeaning).not.toHaveBeenCalled();
    expect(state.proposeResult).toEqual({
      kind: "error",
      message: "reference_meaning is required.",
    });
    expect(state.proposingMeaning).toBe(false);
  });

  it("rejects invalid confidence before calling proposeMeaning", async () => {
    const proposeMeaning = vi.fn();

    const actions = createAppActions({
      client: createClient({ proposeMeaning }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.proposeMeaning(
      formData({
        phrase_id: "unit_phrase",
        reference_meaning: "A valid meaning.",
        context: "unit-test",
        confidence: "not-a-number",
      })
    );

    expect(proposeMeaning).not.toHaveBeenCalled();
    expect(state.proposeResult).toEqual({
      kind: "error",
      message: "confidence must be a number.",
    });
    expect(state.proposingMeaning).toBe(false);
  });

  it("rejects blank correction_id before calling voteMeaningCorrection", async () => {
    const voteMeaningCorrection = vi.fn();

    const actions = createAppActions({
      client: createClient({ voteMeaningCorrection }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.voteMeaningCorrection(
      formData({
        phrase_id: "unit_phrase",
        correction_id: "   ",
        vote: "confirm",
        voter: "unit_voter",
      })
    );

    expect(voteMeaningCorrection).not.toHaveBeenCalled();
    expect(state.correctionVoteResult).toEqual({
      kind: "error",
      message: "correction_id is required.",
    });
    expect(state.votingCorrection).toBe(false);
  });
});

describe("createAppActions successful writes", () => {
  let state: AppState;

  beforeEach(() => {
    state = createUnitAppState();
  });

  it("calls observePhrase once with trimmed payload and records success", async () => {
    const observePhrase = vi.fn(async () => ({
      result: {
        phrase_id: "phrase_unit_web_observe",
        packet_id: "packet_unit_web_observe",
        packet_type: "phrase_observed",
      },
    }));

    const actions = createAppActions({
      client: createClient({ observePhrase }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.observePhrase(
      formData({
        surface_text: "  unit web phrase  ",
        language_hint: " English ",
        phonetic_hint: " ",
      })
    );

    expect(observePhrase).toHaveBeenCalledTimes(1);
    expect(observePhrase).toHaveBeenCalledWith({
      phrase_id: expect.any(String),
      surface_text: "unit web phrase",
      language_hint: "English",
      phonetic_hint: undefined,
      input_type: "text",
    });
    expect(state.observingPhrase).toBe(false);
    expect(state.observeResult?.kind).toBe("success");
    expect(state.observeForm.surfaceText).toBe("");
    expect(state.proposeForm.phraseId).toBe("phrase_unit_web_observe");
  });

  it("calls proposeMeaning once with trimmed payload and records success", async () => {
    const proposeMeaning = vi.fn(async () => ({
      result: {
        phrase_id: "phrase_unit_web_propose",
        meaning_id: "meaning_unit_web_propose",
        packet_id: "packet_unit_web_propose",
        packet_type: "meaning_proposal",
      },
    }));

    const actions = createAppActions({
      client: createClient({ proposeMeaning }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.proposeMeaning(
      formData({
        phrase_id: " phrase_unit_web_propose ",
        reference_meaning: "  A valid unit web meaning.  ",
        context: " unit-test context ",
        confidence: "0.75",
      })
    );

    expect(proposeMeaning).toHaveBeenCalledTimes(1);
    expect(proposeMeaning).toHaveBeenCalledWith({
      phrase_id: "phrase_unit_web_propose",
      meaning_id: expect.any(String),
      reference_meaning: "A valid unit web meaning.",
      context: "unit-test context",
      confidence: 0.75,
    });
    expect(state.proposingMeaning).toBe(false);
    expect(state.proposeResult?.kind).toBe("success");
    expect(state.proposeForm.referenceMeaning).toBe("");
    expect(state.proposeForm.context).toBe("");
  });

  it("calls voteMeaningCorrection once with trimmed payload and records success", async () => {
    const voteMeaningCorrection = vi.fn(async () => ({
      result: {
        phrase_id: "phrase_unit_web_vote",
        correction_id: "correction_unit_web_vote",
        vote: "reject",
        packet_id: "packet_unit_web_vote",
        packet_type: "meaning_correction_vote",
      },
    }));

    const actions = createAppActions({
      client: createClient({ voteMeaningCorrection }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.voteMeaningCorrection(
      formData({
        phrase_id: " phrase_unit_web_vote ",
        correction_id: " correction_unit_web_vote ",
        vote: "reject",
        voter: " unit_voter ",
      })
    );

    expect(voteMeaningCorrection).toHaveBeenCalledTimes(1);
    expect(voteMeaningCorrection).toHaveBeenCalledWith({
      phrase_id: "phrase_unit_web_vote",
      correction_id: "correction_unit_web_vote",
      vote: "reject",
      voter: "unit_voter",
    });
    expect(state.votingCorrection).toBe(false);
    expect(state.correctionVoteResult?.kind).toBe("success");
    expect(state.correctionVoteForm.voter).toBe("");
  });
});

describe("createAppActions correction proposal writes", () => {
  let state: AppState;

  beforeEach(() => {
    state = createUnitAppState();
  });

  it("rejects blank corrected_reference_meaning before calling proposeMeaningCorrection", async () => {
    const proposeMeaningCorrection = vi.fn();

    const actions = createAppActions({
      client: createClient({ proposeMeaningCorrection }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.proposeMeaningCorrection(
      formData({
        phrase_id: "unit_phrase",
        original_meaning_id: "unit_meaning",
        correction_id: "unit_correction",
        corrected_reference_meaning: "   ",
        correction_context: "unit-test",
        source: "unit-test",
      })
    );

    expect(proposeMeaningCorrection).not.toHaveBeenCalled();
    expect(state.correctionProposalResult).toEqual({
      kind: "error",
      message: "corrected_reference_meaning is required.",
    });
    expect(state.proposingCorrection).toBe(false);
  });

  it("calls proposeMeaningCorrection once with trimmed payload and records success", async () => {
    const proposeMeaningCorrection = vi.fn(async () => ({
      result: {
        phrase_id: "phrase_unit_web_correction",
        correction_id: "correction_unit_web_proposal",
        packet_id: "packet_unit_web_correction_proposal",
        packet_type: "meaning_correction_proposed",
      },
    }));

    const actions = createAppActions({
      client: createClient({ proposeMeaningCorrection }),
      state,
      setState: (nextState) => applyStateUpdate(state, nextState),
    });

    await actions.proposeMeaningCorrection(
      formData({
        phrase_id: " phrase_unit_web_correction ",
        original_meaning_id: " meaning_unit_web_original ",
        correction_id: " correction_unit_web_proposal ",
        corrected_reference_meaning: "  A corrected unit web meaning.  ",
        correction_context: " unit correction context ",
        source: " unit-source ",
      })
    );

    expect(proposeMeaningCorrection).toHaveBeenCalledTimes(1);
    expect(proposeMeaningCorrection).toHaveBeenCalledWith({
      phrase_id: "phrase_unit_web_correction",
      original_meaning_id: "meaning_unit_web_original",
      correction_id: "correction_unit_web_proposal",
      corrected_reference_meaning: "A corrected unit web meaning.",
      correction_context: "unit correction context",
      source: "unit-source",
    });
    expect(state.proposingCorrection).toBe(false);
    expect(state.correctionProposalResult?.kind).toBe("success");
    expect(state.correctionProposalForm.correctedReferenceMeaning).toBe("");
    expect(state.correctionProposalForm.correctionContext).toBe("");
  });
});
