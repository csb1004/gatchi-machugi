import { Copy, DoorOpen, Plus, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PublicRoomSummary } from "@gatchi/shared";
import { createRoom, fetchPublicRooms, type CreatedRoom } from "./api";
import { HostControls } from "./host/HostControls";
import { ExtensionSetup } from "./host/ExtensionSetup";
import { RoomView } from "./room/RoomView";
import { useRoomSocket } from "./socket/useRoomSocket";

export function App() {
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("마추기 방");
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);
  const [createStatus, setCreateStatus] = useState<"idle" | "creating" | "failed">("idle");
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [roomsStatus, setRoomsStatus] = useState<"idle" | "loading" | "failed">("idle");
  const roomSocket = useRoomSocket();
  const canJoin = useMemo(() => nickname.trim().length > 0 && roomCode.trim().length > 0, [nickname, roomCode]);
  const serverUrl = window.location.origin;
  const extensionReleaseUrl = import.meta.env.VITE_GITHUB_EXTENSION_RELEASE_URL ?? "https://github.com/OWNER/REPO/releases";

  useEffect(() => {
    void loadPublicRooms();
  }, []);

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
      setCreatedRoom(created);
      setRoomCode(created.roomCode);
      setCreateStatus("idle");
      await loadPublicRooms();
    } catch {
      setCreateStatus("failed");
    }
  }

  if (roomSocket.state && roomSocket.participantId) {
    const currentParticipant = roomSocket.state.participants.find((participant) => participant.id === roomSocket.participantId);

    return (
      <main className="app-shell room-app-shell">
        <div className="room-stack">
          {currentParticipant?.role === "host" ? (
            <>
              <HostControls extensionConnected={roomSocket.state.hostExtensionConnected} onCommand={roomSocket.sendHostCommand} />
              <ExtensionSetup releaseUrl={extensionReleaseUrl} />
            </>
          ) : null}
          <RoomView
            state={roomSocket.state}
            currentParticipantId={roomSocket.participantId}
            chatMessages={roomSocket.chatMessages}
            onSubmitAnswer={roomSocket.submitAnswer}
            onSendChat={roomSocket.sendChat}
          />
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
              <button className="primary-button" type="button" disabled={!canJoin} onClick={() => roomSocket.joinRoom({ roomCode, nickname })}>
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
                방 이름
                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={100} />
              </label>
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

            {createdRoom ? (
              <div className="host-token-panel" role="status">
                <span>서버 URL</span>
                <code>{serverUrl}</code>
                <span>방 코드</span>
                <strong>{createdRoom.roomCode}</strong>
                <span>방장 토큰</span>
                <code>{createdRoom.hostToken}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(createdRoom.hostToken);
                  }}
                >
                  <Copy size={16} />
                  토큰 복사
                </button>
              </div>
            ) : null}

            <div className="host-setup-card">
              <h3>방장 설정</h3>
              <a className="setup-link" href={extensionReleaseUrl} target="_blank" rel="noreferrer">
                GitHub Releases에서 확장 프로그램 받기
              </a>
              <ol>
                <li>방을 만들고 표시된 방장 토큰을 다른 사람에게 공유하지 마세요.</li>
                <li>퀴즈를 진행할 브라우저 탭에서 machugi.io를 엽니다.</li>
                <li>GitHub Releases에서 가치 마추기 확장 프로그램 zip을 내려받아 압축을 풉니다.</li>
                <li>chrome://extensions에서 개발자 모드를 켜고 압축해제된 확장 프로그램을 로드합니다.</li>
                <li>확장 popup에 서버 URL, 방 코드, 방장 토큰을 입력합니다.</li>
                <li>확장이 연결된 뒤 참가자는 방 코드로 입장합니다.</li>
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
