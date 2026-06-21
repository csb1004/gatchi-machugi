import "dotenv/config";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { RoomService } from "./domain/roomService.js";
import { createSocketServer } from "./socket/createSocketServer.js";

const port = Number(process.env.PORT ?? 3000);
const roomService = new RoomService();
const currentDir = dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR ?? resolve(currentDir, "../../web/dist");
let socketServer: ReturnType<typeof createSocketServer> | null = null;
const app = createApp({
  roomService,
  staticDir,
  adminToken: process.env.ADMIN_TOKEN,
  broadcastRoomState: (roomCode, state) => {
    socketServer?.to(roomCode).emit("host:disconnected");
    socketServer?.to(roomCode).emit("room:state", state);
  }
});
const server = createServer(app);

socketServer = createSocketServer(server, { roomService });

server.listen(port, () => {
  console.log(`@gatchi/server listening on http://localhost:${port}`);
});
