import { DoorOpen, Plus, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  APP_PAIRING_SETTINGS_ACK_MESSAGE,
  APP_PAIRING_SETTINGS_MESSAGE,
  type PublicRoomSummary
} from "@gatchi/shared";
import { createRoom, fetchPublicRooms, type CreatedRoom } from "./api";
import { AdminPage } from "./admin/AdminPage";
import { ExtensionSetup } from "./host/ExtensionSetup";
import { HostWorkspace } from "./host/HostWorkspace";
import { RoomView } from "./room/RoomView";
import { readStoredRoomSession, roomCodeFromPath, roomPath, useRoomSocket } from "./socket/useRoomSocket";

type PairingRoom = Pick<CreatedRoom, "roomCode" | "hostParticipantId" | "hostCode">;

export function App() {
  const initialPathRoomCode = roomCodeFromPath(window.location.pathname);
  const [nickname, setNickname] = useState(
    () => readStoredRoomSession(initialPathRoomCode ?? undefined)?.nickname ?? readStoredRoomSession()?.nickname ?? ""
  );
  const [roomCode, setRoomCode] = useState(() => initialPathRoomCode ?? "");
  const [roomName, setRoomName] = useState("마추기 방");
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);
  const [createStatus, setCreateStatus] = useState<"idle" | "creating" | "failed">("idle");
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [roomsStatus, setRoomsStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [extensionSyncStatus, setExtensionSyncStatus] = useState<"idle" | "waiting" | "saved" | "failed">("idle");
  const wasInRoomRef = useRef(false);
  const restoredRoomRef = useRef<string | null>(null);
  const roomSocket = useRoomSocket();
  const canJoin = useMemo(() => nickname.trim().length > 0 && roomCode.trim().length > 0, [nickname, roomCode]);
  const serverUrl = window.location.origin;
  const extensionReleaseUrl = import.meta.env.VITE_GITHUB_EXTENSION_RELEASE_URL ?? "https://github.com/csb1004/gatchi-machugi/releases";

  function sendPairingSettingsToExtension(room: PairingRoom) {
    setExtensionSyncStatus("waiting");
    window.postMessage(
      {
        type: APP_PAIRING_SETTINGS_MESSAGE,
        payload: {
          serverUrl,
          roomCode: room.roomCode,
          hostCode: room.hostCode
        }
      },
      window.location.origin
    );
    window.setTimeout(() => {
      setExtensionSyncStatus((status) => (status === "waiting" ? "failed" : status));
    }, 1000);
  }

  function extensionSyncLabel(hasPairingRoom: boolean) {
    if (extensionSyncStatus === "saved") return "확장 프로그램에 연결 정보를 저장했습니다.";
    if (extensionSyncStatus === "failed") return "확장 설치/업데이트 직후라면 방장 화면을 새로고침한 뒤 다시 저장하세요.";
    if (extensionSyncStatus === "waiting") return "확장 프로그램에 저장 중입니다.";
    if (hasPairingRoom) return "확장 프로그램에 연결 정보를 다시 저장할 수 있습니다.";
    return "방을 만든 뒤 확장 프로그램에 연결 정보를 저장합니다.";
  }

  useEffect(() => {
    void loadPublicRooms();
  }, []);

  useEffect(() => {
    const pathRoomCode = roomCodeFromPath(window.location.pathname);
    if (!pathRoomCode) return;
    setRoomCode(pathRoomCode);
  }, []);

  useEffect(() => {
    const pathRoomCode = roomCodeFromPath(window.location.pathname);
    if (!pathRoomCode || roomSocket.state || restoredRoomRef.current === pathRoomCode) return;

    const stored = readStoredRoomSession(pathRoomCode);
    if (!stored || stored.roomCode !== pathRoomCode) return;

    restoredRoomRef.current = pathRoomCode;
    setNickname(stored.nickname);
    setRoomCode(stored.roomCode);
    roomSocket.joinRoom({
      roomCode: stored.roomCode,
      nickname: stored.nickname,
      participantId: stored.participantId,
      participantCode: stored.participantCode
    });
  }, []);

  useEffect(() => {
    if (!roomSocket.state) return;

    const nextPath = roomPath(roomSocket.state.roomCode);
    if (window.location.pathname !== nextPath) {
      window.history.replaceState(null, "", nextPath);
    }
  }, [roomSocket.state?.roomCode]);

  useEffect(() => {
    if (roomSocket.state) {
      wasInRoomRef.current = true;
      return;
    }

    if (wasInRoomRef.current) {
      wasInRoomRef.current = false;
      setCreatedRoom(null);
      setRoomCode("");
      setExtensionSyncStatus("idle");
      if (window.location.pathname !== "/") {
        window.history.replaceState(null, "", "/");
      }
      void loadPublicRooms();
    }
  }, [roomSocket.state]);

  useEffect(() => {
    if (roomSocket.state || !roomSocket.error || !roomCodeFromPath(window.location.pathname)) return;

    setRoomCode("");
    if (window.location.pathname !== "/") {
      window.history.replaceState(null, "", "/");
    }
  }, [roomSocket.error, roomSocket.state]);

  useEffect(() => {
    function handlePairingAck(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (
        typeof event.data !== "object" ||
        event.data === null ||
        (event.data as { type?: unknown }).type !== APP_PAIRING_SETTINGS_ACK_MESSAGE
      ) {
        return;
      }

      setExtensionSyncStatus((event.data as { ok?: boolean }).ok ? "saved" : "failed");
    }

    window.addEventListener("message", handlePairingAck);
    return () => window.removeEventListener("message", handlePairingAck);
  }, []);

  useEffect(() => {
    if (createdRoom) {
      sendPairingSettingsToExtension(createdRoom);
    }
  }, [createdRoom]);

  async function loadPublicRooms() {
    setRoomsStatus("loading");
    try {
      setPublicRooms(await fetchPublicRooms());
      setRoomsStatus("idle");
    } catch {
      setRoomsStatus("failed");
    }
  }

  async function handleCreateRoom() {
    if (!nickname.trim() || !roomName.trim()) return;

    setCreateStatus("creating");
    setCreatedRoom(null);

    try {
      const created = await createRoom({
        roomName: roomName.trim(),
        public: isPublicRoom,
        nickname: nickname.trim()
      });
      window.history.replaceState(null, "", roomPath(created.roomCode));
      setCreatedRoom(created);
      setRoomCode(created.roomCode);
      setCreateStatus("idle");
      roomSocket.joinRoom({
        roomCode: created.roomCode,
        nickname: nickname.trim(),
        participantId: created.hostParticipantId,
        participantCode: created.hostCode
      });
      await loadPublicRooms();
    } catch {
      setCreateStatus("failed");
    }
  }

  if (window.location.pathname === "/admin") {
    return <AdminPage />;
  }

  if (roomSocket.state && roomSocket.participantId) {
    const currentParticipant = roomSocket.state.participants.find((participant) => participant.id === roomSocket.participantId);
    const storedRoomSession = readStoredRoomSession(roomSocket.state.roomCode);
    const restoredPairingRoom =
      currentParticipant?.role === "host" &&
      storedRoomSession?.roomCode === roomSocket.state.roomCode &&
      storedRoomSession.participantId === roomSocket.participantId
        ? {
            roomCode: storedRoomSession.roomCode,
            hostParticipantId: storedRoomSession.participantId,
            hostCode: storedRoomSession.participantCode
          }
        : null;
    const pairingRoom = createdRoom ?? restoredPairingRoom;

    return (
      <main className="app-shell room-app-shell">
        <div className="room-stack">
          <RoomView
            state={roomSocket.state}
            currentParticipantId={roomSocket.participantId}
            chatMessages={roomSocket.chatMessages}
            onSubmitAnswer={roomSocket.submitAnswer}
            onAddAlias={roomSocket.addAlias}
            onSendChat={roomSocket.sendChat}
            onSourceAction={roomSocket.sendSourceAction}
            onImageScaleChange={(imageScale) => roomSocket.updateSettings({ imageScale })}
            onLeaveRoom={() => {
              roomSocket.leaveRoom();
            }}
          />
          {roomSocket.error ? <p className="status-text">{roomSocket.error}</p> : null}
          {currentParticipant?.role === "host" ? (
            <>
              <HostWorkspace
                state={roomSocket.state}
                extensionReleaseUrl={extensionReleaseUrl}
                extensionSyncLabel={extensionSyncLabel(Boolean(pairingRoom))}
                onResendPairing={() => {
                  if (pairingRoom) sendPairingSettingsToExtension(pairingRoom);
                }}
              />
              <ExtensionSetup releaseUrl={extensionReleaseUrl} />
            </>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="lobby-panel" aria-labelledby="lobby-title">
        <header className="lobby-header">
          <div>
            <p className="eyebrow">방 로비</p>
            <h1 id="lobby-title">가치 마추기</h1>
          </div>
          <button className="icon-button" type="button" onClick={() => void loadPublicRooms()} aria-label="공개방 새로고침">
            <RefreshCw size={18} />
          </button>
        </header>

        {roomSocket.error ? <p className="status-text">{roomSocket.error}</p> : null}

        <div className="lobby-columns">
          <div className="join-column">
            <form className="join-form">
              <label>
                닉네임
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={40} />
              </label>
              <label>
                방 코드
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  autoCapitalize="characters"
                />
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={!canJoin}
                onClick={() => {
                  window.history.replaceState(null, "", roomPath(roomCode));
                  roomSocket.joinRoom({ roomCode, nickname });
                }}
              >
                <DoorOpen size={18} />
                방 입장
              </button>
            </form>

            <section aria-label="공개방" className="public-rooms">
              <div className="section-heading">
                <h2>공개방</h2>
                <span>{roomsStatus === "loading" ? "불러오는 중" : `${publicRooms.length}개 열림`}</span>
              </div>

              {roomsStatus === "failed" ? <p className="status-text">공개방을 불러오지 못했습니다.</p> : null}

              <div className="room-list">
                {publicRooms.map((room) => (
                  <button
                    className="room-row"
                    type="button"
                    key={room.roomCode}
                    onClick={() => setRoomCode(room.roomCode)}
                    aria-label={`${room.title} 방 선택`}
                  >
                    <span>
                      <strong>{room.title}</strong>
                      <small>{room.quizTitle ?? room.phase}</small>
                    </span>
                    <span className="room-meta">
                      <Users size={16} />
                      {room.participantCount}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <aside className="create-room" aria-label="방 만들기">
            <div className="section-heading">
              <h2>방 만들기</h2>
              <span>{createStatus === "creating" ? "만드는 중" : "방장 설정"}</span>
            </div>

            <div className="create-form">
              <label>
                방장 닉네임
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={40} />
              </label>
              <label>
                방 이름
                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={100} />
              </label>
              <p className="form-note">방 코드는 방을 만들면 자동으로 생성됩니다.</p>
              <label className="toggle-row">
                <input type="checkbox" checked={isPublicRoom} onChange={(event) => setIsPublicRoom(event.target.checked)} />
                공개방
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={!nickname.trim() || !roomName.trim() || createStatus === "creating"}
                onClick={() => void handleCreateRoom()}
              >
                <Plus size={18} />
                방 만들기
              </button>
            </div>

            {createStatus === "failed" ? <p className="status-text">방을 만들지 못했습니다.</p> : null}

            <div className="host-setup-card">
              <h3>방장 설정</h3>
              <a className="setup-link" href={extensionReleaseUrl} target="_blank" rel="noreferrer">
                GitHub Releases에서 확장 프로그램 받기
              </a>
              <ol>
                <li>방을 만들면 서버 URL, 방 코드, 방장 코드가 확장 프로그램에 자동 저장됩니다.</li>
                <li>방장 화면에서 마추기아이오 원본 화면을 열고 퀴즈를 고릅니다.</li>
                <li>GitHub Releases에서 가치 마추기 확장 프로그램 zip을 내려받아 압축을 풉니다.</li>
                <li>chrome://extensions에서 개발자 모드를 켜고 압축 해제된 확장 프로그램을 로드합니다.</li>
                <li>확장을 새로 설치하거나 업데이트했다면 방장 화면을 새로고침한 뒤 다시 저장합니다.</li>
                <li>확장이 연결되면 참가자는 방 코드로 입장합니다.</li>
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
