import type { Express } from "express";
import { MyceliumController } from "../../mycelium/MyceliumController";
import type { SafetyLabel } from "../../safety/safetyLabels";
import {
  asRequestObject,
  validationError,
} from "../validation/requestValidation";
import { errorMessage, sendApiError } from "./apiResponses";

interface NodeRoutesContext {
  myceliumController: MyceliumController;
}

interface LocalNodeIdentityUpdatePayload {
  display_name?: string;
  default_author?: string;
}

interface LocalNodeSettingsUpdatePayload {
  default_language_hint?: string;
  default_safety_label?: SafetyLabel;
  sync_mode?: "manual";
  developer_mode?: boolean;
  show_debug_panels?: boolean;
}

const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_DEFAULT_AUTHOR_LENGTH = 160;
const MAX_DEFAULT_LANGUAGE_HINT_LENGTH = 40;
const VALID_SAFETY_LABELS: readonly SafetyLabel[] = [
  "normal",
  "mild_slang",
  "vulgar",
  "adult_18_plus",
  "abusive",
  "dangerous",
  "blocked",
];

export function registerNodeRoutes(
  app: Express,
  context: NodeRoutesContext
): void {
  const { myceliumController } = context;

  app.get("/node/status", (_req, res) => {
    try {
      res.json(myceliumController.getNodeStatus());
    } catch (error) {
      sendApiError(res, 400, "INTERNAL_ERROR", errorMessage(error));
    }
  });

  app.get("/node/identity", (_req, res) => {
    try {
      res.json({
        ok: true,
        identity: myceliumController.getLocalNodeIdentity(),
      });
    } catch (error) {
      sendApiError(res, 400, "INTERNAL_ERROR", errorMessage(error));
    }
  });

  app.post("/node/identity", (req, res) => {
    try {
      const payload = localNodeIdentityUpdatePayload(req.body);

      res.json({
        ok: true,
        identity: myceliumController.updateLocalNodeIdentity(payload),
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.get("/node/settings", (_req, res) => {
    try {
      res.json({
        ok: true,
        settings: myceliumController.getLocalNodeSettings(),
      });
    } catch (error) {
      sendApiError(res, 400, "INTERNAL_ERROR", errorMessage(error));
    }
  });

  app.post("/node/settings", (req, res) => {
    try {
      const payload = localNodeSettingsUpdatePayload(req.body);

      res.json({
        ok: true,
        settings: myceliumController.updateLocalNodeSettings(payload),
      });
    } catch (error) {
      sendApiError(res, 400, "VALIDATION_ERROR", errorMessage(error));
    }
  });

  app.get("/sync/status", (_req, res) => {
    try {
      res.json(myceliumController.getSyncStatus());
    } catch (error) {
      sendApiError(res, 400, "INTERNAL_ERROR", errorMessage(error));
    }
  });
}

function localNodeIdentityUpdatePayload(
  body: unknown
): LocalNodeIdentityUpdatePayload {
  const payload = asRequestObject(body);

  if (payload.node_id !== undefined) {
    validationError("node_id cannot be changed");
  }

  const displayName = optionalLimitedIdentityString(
    payload,
    "display_name",
    MAX_DISPLAY_NAME_LENGTH
  );
  const defaultAuthor = optionalLimitedIdentityString(
    payload,
    "default_author",
    MAX_DEFAULT_AUTHOR_LENGTH
  );

  if (displayName === undefined && defaultAuthor === undefined) {
    validationError("display_name or default_author is required");
  }

  return {
    display_name: displayName,
    default_author: defaultAuthor,
  };
}

function optionalLimitedIdentityString(
  body: Record<string, unknown>,
  fieldName: string,
  maxLength: number
): string | undefined {
  const value = body[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    validationError(`${fieldName} is invalid`);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    validationError(`${fieldName} must be a non-empty string`);
  }

  if (trimmedValue.length > maxLength) {
    validationError(`${fieldName} must be ${maxLength} characters or less`);
  }

  return trimmedValue;
}

function localNodeSettingsUpdatePayload(
  body: unknown
): LocalNodeSettingsUpdatePayload {
  const payload = asRequestObject(body);
  const defaultLanguageHint = optionalLimitedIdentityString(
    payload,
    "default_language_hint",
    MAX_DEFAULT_LANGUAGE_HINT_LENGTH
  );
  const defaultSafetyLabel = optionalSafetyLabel(payload, "default_safety_label");
  const syncMode = optionalManualSyncMode(payload);
  const developerMode = optionalBoolean(payload, "developer_mode");
  const showDebugPanels = optionalBoolean(payload, "show_debug_panels");

  if (
    defaultLanguageHint === undefined &&
    defaultSafetyLabel === undefined &&
    syncMode === undefined &&
    developerMode === undefined &&
    showDebugPanels === undefined
  ) {
    validationError("at least one settings field is required");
  }

  return {
    default_language_hint: defaultLanguageHint,
    default_safety_label: defaultSafetyLabel,
    sync_mode: syncMode,
    developer_mode: developerMode,
    show_debug_panels: showDebugPanels,
  };
}

function optionalSafetyLabel(
  body: Record<string, unknown>,
  fieldName: string
): SafetyLabel | undefined {
  const value = body[fieldName];

  if (value === undefined) {
    return undefined;
  }

  const trimmedValue = typeof value === "string" ? value.trim() : "";

  if (
    !trimmedValue ||
    !VALID_SAFETY_LABELS.includes(trimmedValue as SafetyLabel)
  ) {
    validationError(`${fieldName} is invalid`);
  }

  return trimmedValue as SafetyLabel;
}

function optionalManualSyncMode(
  body: Record<string, unknown>
): "manual" | undefined {
  const value = body.sync_mode;

  if (value === undefined) {
    return undefined;
  }

  if (value !== "manual") {
    validationError("sync_mode must be manual");
  }

  return "manual";
}

function optionalBoolean(
  body: Record<string, unknown>,
  fieldName: string
): boolean | undefined {
  const value = body[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    validationError(`${fieldName} must be a boolean`);
  }

  return value;
}
