import type { Express } from "express";
import { MyceliumController } from "../../mycelium/MyceliumController";
import { registerCorrectionRoutes } from "./correctionRoutes";
import { registerNodeRoutes } from "./nodeRoutes";
import type { LmpPacket } from "../../protocol/packet";
import {
  MeaningProposalPayload,
  MeaningVotePayload,
  PhraseObservedPayload,
  SafetyLabelPayload,
} from "../../protocol/packetTypes";
import { SafetyLabel } from "../../safety/safetyLabels";
import {
  asRequestObject,
  optionalNumber,
  optionalString,
  payloadOrBody,
  requireAllowedString,
  requireOneString,
  requireString,
  validationError,
} from "../validation/requestValidation";
import { errorMessage, sendApiError } from "./apiResponses";

const VALID_SAFETY_LABELS: readonly SafetyLabel[] = [
  "normal",
  "mild_slang",
  "vulgar",
  "adult_18_plus",
  "abusive",
  "dangerous",
  "blocked",
];

interface LanguageRoutesContext {
  myceliumController: MyceliumController;
}

function isValidSafetyLabel(value: unknown): value is SafetyLabel {
  return (
    typeof value === "string" &&
    VALID_SAFETY_LABELS.includes(value as SafetyLabel)
  );
}

function legacyPhrasePayload(body: unknown): PhraseObservedPayload {
  const payload = payloadOrBody(body);

  return {
    phrase_id: requireString(payload, "phrase_id"),
    surface_text: requireOneString(payload, ["text", "surface_text"], "text"),
    phonetic_hint: optionalString(payload.phonetic_hint),
    language_hint: requireOneString(
      payload,
      ["language", "language_hint"],
      "language"
    ),
    input_type:
      typeof payload.input_type === "string"
        ? (payload.input_type as PhraseObservedPayload["input_type"])
        : "text",
  };
}

function legacyMeaningPayload(body: unknown): MeaningProposalPayload {
  const payload = payloadOrBody(body);

  return {
    phrase_id: requireString(payload, "phrase_id"),
    meaning_id: requireString(payload, "meaning_id"),
    reference_meaning: requireString(payload, "reference_meaning"),
    context: optionalString(payload.context),
    confidence: optionalNumber(payload.confidence) ?? 0.5,
  };
}

function legacyVotePayload(body: unknown): MeaningVotePayload {
  const payload = payloadOrBody(body);

  return {
    phrase_id: requireString(payload, "phrase_id"),
    meaning_id: requireString(payload, "meaning_id"),
    vote: requireAllowedString(payload, "vote", [
      "confirm",
      "reject",
      "unsure",
    ]),
    confidence: optionalNumber(payload.confidence) ?? 0.5,
  };
}

function legacySafetyLabelPayload(body: unknown): SafetyLabelPayload {
  const payload = payloadOrBody(body);
  const safetyLabel = requireOneString(
    payload,
    ["safety_label", "label"],
    "safety_label"
  );

  if (!isValidSafetyLabel(safetyLabel)) {
    validationError("safety_label is invalid");
  }

  return {
    phrase_id: requireString(payload, "phrase_id"),
    label: safetyLabel,
    reason: optionalString(payload.reason),
  };
}

function parentFromBody(body: unknown): string | undefined {
  return optionalString(asRequestObject(body).parent);
}

export function registerLanguageRoutes(
  app: Express,
  context: LanguageRoutesContext
): void {
  const { myceliumController } = context;

  registerNodeRoutes(app, { myceliumController });
  registerCorrectionRoutes(app, { myceliumController });

  app.get("/phrases/search", (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const result = myceliumController.searchPhrases(query, limit);

    res.json({
      ok: true,
      ...result,
    });
  });

  app.get("/phrases/:phraseId/bestMeaning", (req, res) => {
    const result = myceliumController.getBestMeaning(req.params.phraseId);

    if (result.reason === "Phrase not found.") {
      sendApiError(res, 404, "NOT_FOUND", "Phrase not found.", {
        phrase_id: result.phrase_id,
      });
      return;
    }

    res.json({
      ok: true,
      ...result,
    });
  });

  app.get("/phrases/:phraseId/explainBestMeaning", (req, res) => {
    const result = myceliumController.getBestMeaningExplanation(
      req.params.phraseId
    );

    if (!result.found) {
      sendApiError(res, 404, "NOT_FOUND", "Phrase not found.", {
        phrase_id: result.phrase_id,
      });
      return;
    }

    const { found: _found, ...explanation } = result;

    res.json({
      ok: true,
      ...explanation,
    });
  });

  app.get("/phrases/:phraseId/packetTrace", (req, res) => {
    try {
      res.json({
        ok: true,
        ...myceliumController.getPhrasePacketTrace(req.params.phraseId),
      });
    } catch (error) {
      sendApiError(res, 400, "INTERNAL_ERROR", errorMessage(error));
    }
  });

  app.get("/kyc/claims/:kycClaimId/summary", (req, res) => {
    const result = myceliumController.getKycClaimSummary(
      req.params.kycClaimId
    );

    if (!result.found) {
      sendApiError(res, 404, "NOT_FOUND", "KYC claim not found.", {
        kyc_claim_id: result.kyc_claim_id,
      });
      return;
    }

    const { found: _found, ...summary } = result;

    res.json({
      ok: true,
      summary,
    });
  });

  app.get("/payments/:paymentIntentId/status", (req, res) => {
    try {
      res.json({
        ok: true,
        summary: myceliumController.getPaymentStatusSummary(req.params.paymentIntentId),
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.get("/orders/:orderReferenceId/fulfillment/status", (req, res) => {
    try {
      res.json({
        ok: true,
        summary: myceliumController.getOrderFulfillmentStatusSummary(
          req.params.orderReferenceId
        ),
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.get("/phrases/:phraseId", (req, res) => {
    const result = myceliumController.getPhraseById(req.params.phraseId);

    if (!result.found) {
      sendApiError(res, 404, "NOT_FOUND", "Phrase not found.", {
        phrase_id: result.phrase_id,
      });
      return;
    }

    res.json({
      ok: true,
      phrase: result.phrase,
    });
  });

  app.post("/app/lookupPhrase", (req, res) => {
    const query =
      typeof req.body.query === "string" ? req.body.query.trim() : "";

    if (!query) {
      sendApiError(res, 400, "VALIDATION_ERROR", "query is required");
      return;
    }

    const matches = myceliumController.lookupPhrase(query);

    res.json({
      ok: true,
      query,
      match_count: matches.length,
      matches,
    });
  });

  app.post("/app/observePhrase", (req, res) => {
    try {
      const phraseId =
        typeof req.body.phrase_id === "string" ? req.body.phrase_id.trim() : "";
      const surfaceText =
        typeof req.body.surface_text === "string"
          ? req.body.surface_text.trim()
          : "";
      const phoneticHint =
        typeof req.body.phonetic_hint === "string"
          ? req.body.phonetic_hint.trim()
          : "";
      const languageHint =
        typeof req.body.language_hint === "string"
          ? req.body.language_hint.trim()
          : "";

      if (!phraseId) {
        sendApiError(res, 400, "VALIDATION_ERROR", "phrase_id is required");
        return;
      }
      if (!surfaceText) {
        sendApiError(res, 400, "VALIDATION_ERROR", "surface_text is required");
        return;
      }


      if (!surfaceText && !phoneticHint && !languageHint) {
        sendApiError(
          res,
          400,
          "VALIDATION_ERROR",
          "at least one phrase text field is required"
        );
        return;
      }

      const payload: PhraseObservedPayload = {
        phrase_id: phraseId,
        surface_text: surfaceText || undefined,
        phonetic_hint: phoneticHint || undefined,
        language_hint: languageHint || undefined,
        input_type:
          typeof req.body.input_type === "string"
            ? (req.body.input_type as PhraseObservedPayload["input_type"])
            : "text",
      };
      const result = myceliumController.observePhrase(payload);

      res.json({
        ok: true,
        result: {
          phrase_id: phraseId,
          packet_id: result.packet.packet_id,
          packet_type: result.packet.packet_type,
          created_at: result.packet.created_at,
          local_apply_status: "applied_to_knowledge",
          packet_size_class: result.packetSize.sizeClass,
          route_decision: result.packetRoute.decision,
        },
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.post("/app/proposeMeaning", (req, res) => {
    try {
      const phraseId =
        typeof req.body.phrase_id === "string" ? req.body.phrase_id.trim() : "";
      const meaningId =
        typeof req.body.meaning_id === "string"
          ? req.body.meaning_id.trim()
          : "";
      const referenceMeaning =
        typeof req.body.reference_meaning === "string"
          ? req.body.reference_meaning.trim()
          : "";
      const contextText =
        typeof req.body.context === "string" ? req.body.context.trim() : "";
      const confidence =
        typeof req.body.confidence === "number" &&
        Number.isFinite(req.body.confidence)
          ? req.body.confidence
          : undefined;
      const parent =
        typeof req.body.parent === "string" ? req.body.parent : undefined;

      if (!phraseId) {
        sendApiError(res, 400, "VALIDATION_ERROR", "phrase_id is required");
        return;
      }

      if (!meaningId) {
        sendApiError(res, 400, "VALIDATION_ERROR", "meaning_id is required");
        return;
      }

      if (!referenceMeaning) {
        sendApiError(
          res,
          400,
          "VALIDATION_ERROR",
          "reference_meaning is required"
        );
        return;
      }

      if (confidence === undefined) {
        sendApiError(res, 400, "VALIDATION_ERROR", "confidence is required");
        return;
      }

      const payload: MeaningProposalPayload = {
        phrase_id: phraseId,
        meaning_id: meaningId,
        reference_meaning: referenceMeaning,
        context: contextText || undefined,
        confidence,
      };
      const result = myceliumController.proposeMeaning(payload, parent);

      res.json({
        ok: true,
        result: {
          phrase_id: phraseId,
          meaning_id: meaningId,
          packet_id: result.packet.packet_id,
          packet_type: result.packet.packet_type,
          created_at: result.packet.created_at,
          local_apply_status: "applied_to_knowledge",
          packet_size_class: result.packetSize.sizeClass,
          route_decision: result.packetRoute.decision,
        },
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.post("/app/voteMeaning", (req, res) => {
    try {
      const phraseId =
        typeof req.body.phrase_id === "string" ? req.body.phrase_id.trim() : "";
      const meaningId =
        typeof req.body.meaning_id === "string"
          ? req.body.meaning_id.trim()
          : "";
      const vote = typeof req.body.vote === "string" ? req.body.vote.trim() : "";
      const confidence =
        typeof req.body.confidence === "number" &&
        Number.isFinite(req.body.confidence)
          ? req.body.confidence
          : undefined;
      const parent =
        typeof req.body.parent === "string" ? req.body.parent : undefined;

      if (!phraseId) {
        sendApiError(res, 400, "VALIDATION_ERROR", "phrase_id is required");
        return;
      }

      if (!meaningId) {
        sendApiError(res, 400, "VALIDATION_ERROR", "meaning_id is required");
        return;
      }

      if (!vote) {
        sendApiError(res, 400, "VALIDATION_ERROR", "vote is required");
        return;
      }

      if (vote !== "confirm" && vote !== "reject" && vote !== "unsure") {
        sendApiError(res, 400, "VALIDATION_ERROR", "vote is invalid");
        return;
      }

      if (confidence === undefined) {
        sendApiError(res, 400, "VALIDATION_ERROR", "confidence is required");
        return;
      }

      const payload: MeaningVotePayload = {
        phrase_id: phraseId,
        meaning_id: meaningId,
        vote,
        confidence,
      };
      const result = myceliumController.voteMeaning(payload, parent);

      res.json({
        ok: true,
        result: {
          phrase_id: phraseId,
          meaning_id: meaningId,
          vote,
          packet_id: result.packet.packet_id,
          packet_type: result.packet.packet_type,
          created_at: result.packet.created_at,
          local_apply_status: "applied_to_knowledge",
          packet_size_class: result.packetSize.sizeClass,
          route_decision: result.packetRoute.decision,
        },
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.post("/app/applySafetyLabel", (req, res) => {
    try {
      const phraseId =
        typeof req.body.phrase_id === "string" ? req.body.phrase_id.trim() : "";
      const label = req.body.label;
      const reason =
        typeof req.body.reason === "string" ? req.body.reason.trim() : "";
      const parent =
        typeof req.body.parent === "string" ? req.body.parent : undefined;

      if (!phraseId) {
        sendApiError(res, 400, "VALIDATION_ERROR", "phrase_id is required");
        return;
      }

      if (!isValidSafetyLabel(label)) {
        sendApiError(
          res,
          400,
          "VALIDATION_ERROR",
          "valid safety label is required"
        );
        return;
      }

      const payload: SafetyLabelPayload = {
        phrase_id: phraseId,
        label,
        reason: reason || undefined,
      };
      const result = myceliumController.applySafetyLabel(payload, parent);

      res.json({
        ok: true,
        result: {
          phrase_id: phraseId,
          label,
          packet_id: result.packet.packet_id,
          packet_type: result.packet.packet_type,
          created_at: result.packet.created_at,
          local_apply_status: "applied_to_knowledge",
          packet_size_class: result.packetSize.sizeClass,
          route_decision: result.packetRoute.decision,
        },
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.post("/observePhrase", (req, res) => {
    try {
      const payload = legacyPhrasePayload(req.body);
      const result = myceliumController.observePhrase(payload);

      res.json({
        ok: true,
        result,
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.post("/proposeMeaning", (req, res) => {
    try {
      const payload = legacyMeaningPayload(req.body);
      const parent = req.body.parent as string | undefined;

      const result = myceliumController.proposeMeaning(payload, parent);

      res.json({
        ok: true,
        result,
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.post("/voteMeaning", (req, res) => {
    try {
      const payload = legacyVotePayload(req.body);
      const parent = parentFromBody(req.body);

      const result = myceliumController.voteMeaning(payload, parent);

      res.json({
        ok: true,
        result,
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.post("/applySafetyLabel", (req, res) => {
    try {
      const payload = legacySafetyLabelPayload(req.body);
      const parent = parentFromBody(req.body);

      const result = myceliumController.applySafetyLabel(payload, parent);

      res.json({
        ok: true,
        result,
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.get("/listKnowledge", (_req, res) => {
    res.json({
      ok: true,
      knowledge: myceliumController.listKnowledge(),
    });
  });

  app.get("/nodes", (_req, res) => {
    res.json({
      ok: true,
      nodes: myceliumController.listNodes(),
    });
  });

  app.get("/packetCount", (_req, res) => {
    res.json({
      ok: true,
      count: myceliumController.packetCount(),
    });
  });

  app.get("/packetSummaries", (req, res) => {
    const limit = Number(req.query.limit ?? 100);

    res.json({
      ok: true,
      packets: myceliumController.listPacketSummaries(limit),
    });
  });

  app.get("/packetsAfter", (req, res) => {
    const receivedAfter = Number(req.query.receivedAfter ?? 0);
    const limit = Number(req.query.limit ?? 100);

    res.json({
      ok: true,
      packets: myceliumController.listPacketsAfter(receivedAfter, limit),
    });
  });

  app.post("/receivePacket", (req, res) => {
    try {
      const packet = asRequestObject(req.body);

      if (Object.keys(packet).length === 0) {
        validationError("packet is required");
      }

      const result = myceliumController.receivePacket(
        packet as unknown as LmpPacket
      );

      res.json({
        ok: true,
        result,
      });
    } catch (error) {
      sendApiError(res, 400, "PACKET_REJECTED", errorMessage(error));
    }
  });
}

