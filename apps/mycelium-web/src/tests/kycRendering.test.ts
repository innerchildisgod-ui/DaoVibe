import { describe, expect, it } from "vitest";
import type { AppState } from "../appState";
import { renderKycStatus } from "../kycRendering";

function createKycRenderState(overrides: Partial<AppState> = {}): AppState {
  return {
    loading: false,
    loadingPhrase: false,
    loadingExplanation: false,
    loadingPacketTrace: false,
    loadingDiagnostics: false,
    loadingGovernance: false,
    loadingCommerce: false,
    loadingKyc: false,
    observingPhrase: false,
    proposingMeaning: false,
    proposingCorrection: false,
    votingCorrection: false,
    searchQuery: "",
    commerceLookupForm: {
      paymentIntentId: "",
      orderReferenceId: "",
    },
    kycLookupForm: {
      kycClaimId: "",
    },
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
    ...overrides,
  };
}

describe("renderKycStatus", () => {
  it("renders a read-only KYC lookup form", () => {
    const html = renderKycStatus(createKycRenderState());

    expect(html).toContain("Read-only KYC claim lookup");
    expect(html).toContain('id="kyc-claim-summary-form"');
    expect(html).toContain('name="kyc_claim_id"');
    expect(html).toContain("No KYC claim summary loaded yet.");
  });

  it("renders a loaded KYC claim summary", () => {
    const html = renderKycStatus(
      createKycRenderState({
        kycLookupForm: {
          kycClaimId: "kyc_unit_claim_001",
        },
        kycClaimSummary: {
          ok: true,
          summary: {
            kyc_claim_id: "kyc_unit_claim_001",
            subject_node_id: "subject_unit_001",
            country_hint: "IN",
            document_type_hint: "government_id",
            claim_packet_id: "packet_kyc_claim_unit_001",
            claimed_at: 111,
            status: "verified",
            is_kyc_verified: true,
            packet_count: 3,
            evidence_count: 1,
            evidence_bundle_hashes: ["evidence_hash_unit_001"],
            full_id_shared: false,
            evidence_expired: false,
            expired_evidence_ids: [],
            latest_ai_result: "pass",
            known_verifier_invite_count: 2,
            known_verifier_vote_counts: {
              same_person: 2,
              not_same_person: 0,
              unsure: 0,
              suspicious: 0,
              low_quality: 0,
            },
            latest_quorum_packet_id: "packet_quorum_unit_001",
            latest_quorum_reason: "unit quorum passed",
          },
        },
      })
    );

    expect(html).toContain("KYC claim status");
    expect(html).toContain("kyc_unit_claim_001");
    expect(html).toContain("verified");
    expect(html).toContain("subject_unit_001");
    expect(html).toContain("1970-01-01T00:00:00.111Z (111)");
    expect(html).toContain("same_person=2");
    expect(html).toContain("unit quorum passed");
  });
});
