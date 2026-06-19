import type { Express } from "express";
import { LmpPacket } from "../../protocol/packet";
import { SyncController } from "../../sync/SyncController";

interface SyncRoutesContext {
  syncController: SyncController;
  zone: string;
  author: string;
}

export function registerSyncRoutes(
  app: Express,
  context: SyncRoutesContext
): void {
  const { syncController, zone, author } = context;

  app.get("/sync/pull", (req, res) => {
    try {
      const cursor =
        typeof req.query.cursor === "string" ? req.query.cursor : "0:";
      const limit = Number(req.query.limit ?? 100);
      const batch = syncController.pullBatch(cursor, limit);

      res.json({
        ok: true,
        zone,
        from_author: author,
        ...batch,
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/packetsByIds", (req, res) => {
    const packetIds = Array.isArray(req.body.packet_ids)
      ? req.body.packet_ids
      : [];

    res.json({
      ok: true,
      packets: syncController.getPacketsByIds(packetIds),
    });
  });

  app.get("/sync/cursor/:peerAuthor", (req, res) => {
    try {
      res.json({
        ok: true,
        cursor: syncController.getPeerSyncCursor(req.params.peerAuthor),
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/sync/cursor/:peerAuthor", (req, res) => {
    try {
      const cursor =
        typeof req.body.cursor === "string" ? req.body.cursor : "0:";

      res.json({
        ok: true,
        cursor: syncController.setPeerSyncCursor(req.params.peerAuthor, cursor),
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/sync/missingPacketIds", (req, res) => {
    try {
      const packetIds = Array.isArray(req.body.packet_ids)
        ? req.body.packet_ids.filter(
            (packetId: unknown): packetId is string =>
              typeof packetId === "string"
          )
        : [];
      const missingPacketIds = syncController.findMissingPacketIds(packetIds);

      res.json({
        ok: true,
        input_count: packetIds.length,
        known_count: packetIds.length - missingPacketIds.length,
        missing_count: missingPacketIds.length,
        missing_packet_ids: missingPacketIds,
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/sync/importBatch", (req, res) => {
    try {
      const peerAuthor =
        typeof req.body.peer_author === "string" ? req.body.peer_author : "";
      const cursorBefore =
        typeof req.body.cursor_before === "string"
          ? req.body.cursor_before
          : "";
      const cursorAfter =
        typeof req.body.cursor_after === "string" ? req.body.cursor_after : "";
      const packets = Array.isArray(req.body.packets)
        ? (req.body.packets as LmpPacket[])
        : [];

      if (!peerAuthor) {
        throw new Error("peer_author is required");
      }

      if (!cursorBefore) {
        throw new Error("cursor_before is required");
      }

      if (!cursorAfter) {
        throw new Error("cursor_after is required");
      }

      const result = syncController.importBatch({
        peerAuthor,
        cursorBefore,
        cursorAfter,
        packets,
      });

      res.json({
        ok: true,
        result,
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/sync/run", async (req, res) => {
    try {
      const remoteBaseUrl =
        typeof req.body.remote_base_url === "string"
          ? req.body.remote_base_url
          : "";
      const peerAuthor =
        typeof req.body.peer_author === "string" ? req.body.peer_author : "";
      const limit = Number(req.body.limit ?? 100);

      if (!remoteBaseUrl) {
        throw new Error("remote_base_url is required");
      }

      if (!peerAuthor) {
        throw new Error("peer_author is required");
      }

      const result = await syncController.runFromRemote({
        remoteBaseUrl,
        peerAuthor,
        limit,
      });

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
