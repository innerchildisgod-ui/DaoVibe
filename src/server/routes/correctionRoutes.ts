import type { Express, Request, Response } from "express";
import { MyceliumController } from "../../mycelium/MyceliumController";
import {
  MeaningCorrectionProposedPayload,
  MeaningCorrectionTombstoneProposedPayload,
  MeaningCorrectionTombstoneVotePayload,
  MeaningCorrectionVotePayload,
} from "../../protocol/packetTypes";
import { CORRECTION_PACKET_FIELD_LIMITS } from "../../protocol/validatePacket";
import {
  CORRECTION_GOVERNANCE_RATE_LIMIT_ERROR,
  createCorrectionGovernanceRateLimiter,
} from "./correctionRateLimiter";
import {
  asRequestObject,
  optionalString,
  payloadOrBody,
  requireAllowedString,
  requireString,
  validationError,
} from "../validation/requestValidation";

interface CorrectionRoutesContext {
  myceliumController: MyceliumController;
}

const CORRECTION_TOMBSTONE_REASONS = [
  "rejected_status",
  "negative_score",
  "losing_conflict_candidate",
  "spam",
  "malformed",
  "other",
] as const;

function requireLimitedString(
  body: Record<string, unknown>,
  fieldName: string,
  maxLength: number
): string {
  const value = requireString(body, fieldName);

  if (value.length > maxLength) {
    validationError(`${fieldName} is too long`);
  }

  return value;
}

function optionalLimitedStringField(
  body: Record<string, unknown>,
  fieldName: string,
  maxLength: number
): string | undefined {
  const value = body[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    validationError(`${fieldName} is invalid`);
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length > maxLength) {
    validationError(`${fieldName} is too long`);
  }

  return trimmedValue;
}

function meaningCorrectionProposedPayload(
  body: unknown
): MeaningCorrectionProposedPayload {
  const payload = payloadOrBody(body);

  return {
    phrase_id: requireLimitedString(
      payload,
      "phrase_id",
      CORRECTION_PACKET_FIELD_LIMITS.phrase_id
    ),
    original_meaning_id: requireLimitedString(
      payload,
      "original_meaning_id",
      CORRECTION_PACKET_FIELD_LIMITS.original_meaning_id
    ),
    correction_id: requireLimitedString(
      payload,
      "correction_id",
      CORRECTION_PACKET_FIELD_LIMITS.correction_id
    ),
    corrected_reference_meaning: requireLimitedString(
      payload,
      "corrected_reference_meaning",
      CORRECTION_PACKET_FIELD_LIMITS.corrected_reference_meaning
    ),
    correction_context: optionalLimitedStringField(
      payload,
      "correction_context",
      CORRECTION_PACKET_FIELD_LIMITS.correction_context
    ),
    source: optionalLimitedStringField(
      payload,
      "source",
      CORRECTION_PACKET_FIELD_LIMITS.source
    ),
  };
}

function meaningCorrectionVotePayload(body: unknown): MeaningCorrectionVotePayload {
  const payload = payloadOrBody(body);

  return {
    phrase_id: requireLimitedString(
      payload,
      "phrase_id",
      CORRECTION_PACKET_FIELD_LIMITS.phrase_id
    ),
    correction_id: requireLimitedString(
      payload,
      "correction_id",
      CORRECTION_PACKET_FIELD_LIMITS.correction_id
    ),
    vote: requireAllowedString(payload, "vote", ["confirm", "reject"]),
    voter: optionalLimitedStringField(
      payload,
      "voter",
      CORRECTION_PACKET_FIELD_LIMITS.voter
    ),
  };
}

function meaningCorrectionTombstoneProposedPayload(
  body: unknown
): MeaningCorrectionTombstoneProposedPayload {
  const payload = payloadOrBody(body);

  return {
    phrase_id: requireLimitedString(
      payload,
      "phrase_id",
      CORRECTION_PACKET_FIELD_LIMITS.phrase_id
    ),
    correction_id: requireLimitedString(
      payload,
      "correction_id",
      CORRECTION_PACKET_FIELD_LIMITS.correction_id
    ),
    tombstone_id: requireLimitedString(
      payload,
      "tombstone_id",
      CORRECTION_PACKET_FIELD_LIMITS.tombstone_id
    ),
    reason: requireAllowedString(
      payload,
      "reason",
      CORRECTION_TOMBSTONE_REASONS
    ),
    details: optionalLimitedStringField(
      payload,
      "details",
      CORRECTION_PACKET_FIELD_LIMITS.details
    ),
    proposer: optionalLimitedStringField(
      payload,
      "proposer",
      CORRECTION_PACKET_FIELD_LIMITS.proposer
    ),
  };
}

function meaningCorrectionTombstoneVotePayload(
  body: unknown
): MeaningCorrectionTombstoneVotePayload {
  const payload = payloadOrBody(body);

  return {
    phrase_id: requireLimitedString(
      payload,
      "phrase_id",
      CORRECTION_PACKET_FIELD_LIMITS.phrase_id
    ),
    correction_id: requireLimitedString(
      payload,
      "correction_id",
      CORRECTION_PACKET_FIELD_LIMITS.correction_id
    ),
    tombstone_id: requireLimitedString(
      payload,
      "tombstone_id",
      CORRECTION_PACKET_FIELD_LIMITS.tombstone_id
    ),
    vote: requireAllowedString(payload, "vote", ["confirm", "reject"]),
    voter: optionalLimitedStringField(
      payload,
      "voter",
      CORRECTION_PACKET_FIELD_LIMITS.voter
    ),
  };
}

function parentFromBody(body: unknown): string | undefined {
  return optionalString(asRequestObject(body).parent);
}

export function registerCorrectionRoutes(
  app: Express,
  context: CorrectionRoutesContext
): void {
  const { myceliumController } = context;
  const correctionGovernanceRateLimiter =
    createCorrectionGovernanceRateLimiter();

  function isCorrectionGovernanceRateLimited(
    req: Request,
    res: Response
  ): boolean {
    if (correctionGovernanceRateLimiter.allow(req.ip)) {
      return false;
    }

    res.status(429).json({
      ok: false,
      accepted: false,
      rejected: true,
      error: CORRECTION_GOVERNANCE_RATE_LIMIT_ERROR,
    });
    return true;
  }

  app.get("/phrases/:phraseId/corrections", (req, res) => {
    const result = myceliumController.getPhraseCorrections(req.params.phraseId);

    res.json({
      ok: true,
      ...result,
    });
  });

  app.get("/phrases/:phraseId/correctionHistory", (req, res) => {
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const result = myceliumController.getPhraseCorrectionHistory(
      req.params.phraseId,
      limit
    );

    res.json({
      ok: true,
      ...result,
    });
  });

  app.get("/phrases/:phraseId/correctionCleanupCandidates", (req, res) => {
    const result = myceliumController.getPhraseCorrectionCleanupCandidates(
      req.params.phraseId
    );

    res.json({
      ok: true,
      ...result,
    });
  });

  app.get("/phrases/:phraseId/tombstones", (req, res) => {
    const result = myceliumController.getCorrectionTombstonesForPhrase(
      req.params.phraseId
    );

    res.json({
      ok: true,
      ...result,
    });
  });

  app.get("/phrases/:phraseId/tombstoneExecutionPreview", (req, res) => {
    const result = myceliumController.getTombstoneExecutionPreviewForPhrase(
      req.params.phraseId
    );

    res.json({
      ok: true,
      ...result,
    });
  });

  app.post("/proposeMeaningCorrection", (req, res) => {
    if (isCorrectionGovernanceRateLimited(req, res)) {
      return;
    }

    try {
      const payload = meaningCorrectionProposedPayload(req.body);
      const parent = parentFromBody(req.body);
      const result = myceliumController.proposeMeaningCorrection(
        payload,
        parent
      );

      res.json({
        ok: true,
        accepted: true,
        result: {
          phrase_id: payload.phrase_id,
          original_meaning_id: payload.original_meaning_id,
          correction_id: payload.correction_id,
          packet_id: result.packet.packet_id,
          packet_type: result.packet.packet_type,
          created_at: result.packet.created_at,
          local_apply_status: "stored_event_only",
          packet_size_class: result.packetSize.sizeClass,
          route_decision: result.packetRoute.decision,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        accepted: false,
        rejected: true,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/voteMeaningCorrection", (req, res) => {
    if (isCorrectionGovernanceRateLimited(req, res)) {
      return;
    }

    try {
      const payload = meaningCorrectionVotePayload(req.body);
      const parent = parentFromBody(req.body);
      const result = myceliumController.voteMeaningCorrection(payload, parent);

      res.json({
        ok: true,
        accepted: true,
        result: {
          phrase_id: payload.phrase_id,
          correction_id: payload.correction_id,
          vote: payload.vote,
          packet_id: result.packet.packet_id,
          packet_type: result.packet.packet_type,
          created_at: result.packet.created_at,
          local_apply_status: "stored_event_only",
          packet_size_class: result.packetSize.sizeClass,
          route_decision: result.packetRoute.decision,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        accepted: false,
        rejected: true,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/proposeMeaningCorrectionTombstone", (req, res) => {
    if (isCorrectionGovernanceRateLimited(req, res)) {
      return;
    }

    try {
      const payload = meaningCorrectionTombstoneProposedPayload(req.body);
      const parent = parentFromBody(req.body);
      const result = myceliumController.proposeMeaningCorrectionTombstone(
        payload,
        parent
      );

      res.json({
        ok: true,
        accepted: true,
        result: {
          phrase_id: payload.phrase_id,
          correction_id: payload.correction_id,
          tombstone_id: payload.tombstone_id,
          reason: payload.reason,
          packet_id: result.packet.packet_id,
          packet_type: result.packet.packet_type,
          created_at: result.packet.created_at,
          local_apply_status: "stored_event_only",
          packet_size_class: result.packetSize.sizeClass,
          route_decision: result.packetRoute.decision,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        accepted: false,
        rejected: true,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/voteMeaningCorrectionTombstone", (req, res) => {
    if (isCorrectionGovernanceRateLimited(req, res)) {
      return;
    }

    try {
      const payload = meaningCorrectionTombstoneVotePayload(req.body);
      const parent = parentFromBody(req.body);
      const result = myceliumController.voteMeaningCorrectionTombstone(
        payload,
        parent
      );

      res.json({
        ok: true,
        accepted: true,
        result: {
          phrase_id: payload.phrase_id,
          correction_id: payload.correction_id,
          tombstone_id: payload.tombstone_id,
          vote: payload.vote,
          packet_id: result.packet.packet_id,
          packet_type: result.packet.packet_type,
          created_at: result.packet.created_at,
          local_apply_status: "stored_event_only",
          packet_size_class: result.packetSize.sizeClass,
          route_decision: result.packetRoute.decision,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        accepted: false,
        rejected: true,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
