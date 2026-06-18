import type { ClientToServerEvents, HostPairAck, HostPairPayload, RoomState, ServerToClientEvents } from "@gatchi/shared";
import { io, type Socket } from "socket.io-client";

export const PAIRING_STORAGE_KEY = "pairingSettings";
export const PAIRING_REQUEST_TYPE = "pair-host";

export interface PairingSettings {
  serverUrl: string;
  roomCode: string;
  hostToken: string;
}

export interface StoredPairingSettings extends PairingSettings {}

export interface PairHostRequestMessage {
  type: typeof PAIRING_REQUEST_TYPE;
  payload: PairingSettings;
}

export type PairHostResponse = { ok: true; data: HostPairAck } | { ok: false; error: string };

type HostPairGatewayAck = HostPairAck & Partial<{ state: RoomState }>;
type HostPairGatewayResponse = { ok: true; data: HostPairGatewayAck } | { ok: false; error: string };

export function normalizeServerUrl(serverUrl: string) {
  const normalized = serverUrl.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("Server URL is required");
  }

  try {
    return new URL(normalized).toString().replace(/\/$/, "");
  } catch {
    throw new Error("Server URL must be a valid URL");
  }
}

export function buildPairPayload({ roomCode, hostToken }: Pick<PairingSettings, "roomCode" | "hostToken">): HostPairPayload {
  return {
    roomCode: roomCode.trim().toUpperCase(),
    hostToken
  };
}

export class MachugiSocketClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private serverUrl: string | null = null;

  async connect(serverUrl: string) {
    const normalizedServerUrl = normalizeServerUrl(serverUrl);

    if (this.socket && this.serverUrl === normalizedServerUrl && this.socket.connected) {
      return;
    }

    this.disconnect();

    const socket = io(normalizedServerUrl, {
      autoConnect: false,
      transports: ["websocket"]
    });

    this.socket = socket;
    this.serverUrl = normalizedServerUrl;

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.off("connect", handleConnect);
        socket.off("connect_error", handleConnectError);
      };

      const handleConnect = () => {
        cleanup();
        resolve();
      };

      const handleConnectError = (error: Error) => {
        cleanup();
        reject(error);
      };

      socket.on("connect", handleConnect);
      socket.on("connect_error", handleConnectError);
      socket.connect();
    });
  }

  async pair(payload: Pick<PairingSettings, "roomCode" | "hostToken">): Promise<HostPairGatewayAck> {
    if (!this.socket) {
      throw new Error("Socket client is not connected");
    }

    const pairPayload = buildPairPayload(payload);

    return await new Promise((resolve, reject) => {
      this.socket?.emit("host:pair", pairPayload, ((response: HostPairGatewayResponse) => {
        if (response.ok) {
          resolve(response.data);
          return;
        }

        reject(new Error(response.error));
      }) as never);
    });
  }

  async connectAndPair(settings: PairingSettings): Promise<HostPairGatewayAck> {
    await this.connect(settings.serverUrl);
    return await this.pair(settings);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.serverUrl = null;
  }
}
