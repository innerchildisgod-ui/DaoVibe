import type { Express } from "express";
import { MyceliumController } from "../../mycelium/MyceliumController";
import {
  asRequestObject,
  validationError,
} from "../validation/requestValidation";

interface NodeRoutesContext {
  myceliumController: MyceliumController;
}

interface LocalNodeIdentityUpdatePayload {
  display_name?: string;
  default_author?: string;
}

const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_DEFAULT_AUTHOR_LENGTH = 160;

export function registerNodeRoutes(
  app: Express,
  context: NodeRoutesContext
): void {
  const { myceliumController } = context;

  app.get("/node/status", (_req, res) => {
    try {
      res.json(myceliumController.getNodeStatus());
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/node/identity", (_req, res) => {
    try {
      res.json({
        ok: true,
        identity: myceliumController.getLocalNodeIdentity(),
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
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
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/sync/status", (_req, res) => {
    try {
      res.json(myceliumController.getSyncStatus());
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
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
