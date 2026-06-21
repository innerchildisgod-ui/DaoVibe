import type { Express } from "express";
import type { LanguageEngine } from "../../engine";
import {
  MYCELIUM_API_VERSION,
  MYCELIUM_PROTOCOL_VERSION,
} from "../../mycelium/MyceliumVersions";
import {
  asRequestObject,
  validationError,
} from "../validation/requestValidation";
import { errorMessage, sendApiError } from "./apiResponses";

type LedgerRoutesEngine = Pick<
  LanguageEngine,
  "exportLedgerPackets" | "importLedgerPackets"
>;

interface LedgerRoutesContext {
  engine: LedgerRoutesEngine;
}

export function registerLedgerRoutes(
  app: Express,
  context: LedgerRoutesContext
): void {
  const { engine } = context;

  app.get("/ledger/export", (_req, res) => {
    try {
      const packets = engine.exportLedgerPackets();

      res.json({
        ok: true,
        export_type: "mycelium-ledger-export",
        api_version: MYCELIUM_API_VERSION,
        protocol_version: MYCELIUM_PROTOCOL_VERSION,
        exported_at: Math.floor(Date.now() / 1000),
        packet_count: packets.length,
        packets,
      });
    } catch (error) {
      sendApiError(res, 400, "INTERNAL_ERROR", errorMessage(error));
    }
  });

  app.post("/ledger/import", (req, res) => {
    try {
      const body = asRequestObject(req.body);

      if (!Array.isArray(body.packets)) {
        validationError("packets must be an array");
      }

      res.json({
        ok: true,
        import_result: engine.importLedgerPackets(body.packets),
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });
}
