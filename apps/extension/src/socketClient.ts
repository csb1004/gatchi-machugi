import type {
  ClientToServerEvents,
  ExtensionStatePayload,
  HostPairAck,
  HostPairPayload,
  QuizCommandPayload,
  RoomState,
  ServerToClientEvents
} from "@gatchi/shared";
import { io, type Socket } from "socket.io-client";

export const PAIRING_STORAGE_KEY = "pairingSettings";
export const PAIRING_REQUEST_TYPE = "pair-host";

export interface PairingSettings {
  serverUrl: string;
  roomCode: string;
  hostCode: string;
}

export type StoredPairingSettings = PairingSettings;

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
    throw new Error("서버 URL을 입력해주세요.");
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("올바른 서버 URL을 입력해주세요.");
  }

  if (url.hostname === "machugi.io" || url.hostname.endsWith(".machugi.io")) {
    throw new Error("원본 퀴즈 사이트가 아니라 가치 마추기 서버 URL을 입력해주세요.");
  }

  return url.toString().replace(/\/$/, "");
}

function normalizeHostCode(hostCode: string): string {
  const normalized = hostCode.trim().toUpperCase();
  return normalized.startsWith("#") ? normalized : `#${normalized}`;
}

export function buildPairPayload({ roomCode, hostCode }: Pick<PairingSettings, "roomCode" | "hostCode">): HostPairPayload {
  return {
    roomCode: roomCode.trim().toUpperCase(),
    hostCode: normalizeHostCode(hostCode)
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

  async pair(payload: Pick<PairingSettings, "roomCode" | "hostCode">): Promise<HostPairGatewayAck> {
    if (!this.socket) {
      throw new Error("소켓 클라이언트가 연결되지 않았습니다.");
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

  sendExtensionState(payload: ExtensionStatePayload): Promise<void> {
    if (!this.socket) {
      throw new Error("소켓 클라이언트가 연결되지 않았습니다.");
    }

    return new Promise((resolve, reject) => {
      this.socket?.emit("extension:state", payload, (response) => {
        if (response.ok) {
          resolve();
          return;
        }

        reject(new Error(response.error));
      });
    });
  }

  onQuizCommand(handler: (payload: QuizCommandPayload) => void) {
    if (!this.socket) {
      throw new Error("소켓 클라이언트가 연결되지 않았습니다.");
    }

    this.socket.on("quiz:command" as never, handler as never);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.serverUrl = null;
  }
}
