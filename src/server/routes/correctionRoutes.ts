import type { Express } from "express";
import { MyceliumController } from "../../mycelium/MyceliumController";
import {
  MeaningCorrectionProposedPayload,
  MeaningCorrectionVotePayload,
} from "../../protocol/packetTypes";
import { CORRECTION_PACKET_FIELD_LIMITS } from "../../protocol/validatePacket";
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

function parentFromBody(body: unknown): string | undefined {
  return optionalString(asRequestObject(body).parent);
}

export function registerCorrectionRoutes(
  app: Express,
  context: CorrectionRoutesContext
): void {
  const { myceliumController } = context;

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

  app.post("/proposeMeaningCorrection", (req, res) => {
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
}
