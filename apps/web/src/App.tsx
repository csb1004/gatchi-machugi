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
  const [roomName, setRoomName] = useState("Machugi room");
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);
  const [createStatus, setCreateStatus] = useState<"idle" | "creating" | "failed">("idle");
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [roomsStatus, setRoomsStatus] = useState<"idle" | "loading" | "failed">("idle");
  const roomSocket = useRoomSocket();
  const canJoin = useMemo(() => nickname.trim().length > 0 && roomCode.trim().length > 0, [nickname, roomCode]);
  const serverUrl = window.location.origin;

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
              <ExtensionSetup releaseUrl="https://github.com/OWNER/REPO/releases" />
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
            <p className="eyebrow">Room lobby</p>
            <h1 id="lobby-title">Gatchi Machugi</h1>
          </div>
          <button className="icon-button" type="button" onClick={() => void loadPublicRooms()} aria-label="Refresh public rooms">
            <RefreshCw size={18} />
          </button>
        </header>

        {roomSocket.error ? <p className="status-text">{roomSocket.error}</p> : null}

        <div className="lobby-columns">
          <div className="join-column">
            <form className="join-form">
              <label>
                Nickname
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={40} />
              </label>
              <label>
                Room code
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  autoCapitalize="characters"
                />
              </label>
              <button className="primary-button" type="button" disabled={!canJoin} onClick={() => roomSocket.joinRoom({ roomCode, nickname })}>
                <DoorOpen size={18} />
                Join room
              </button>
            </form>

            <section aria-label="Public rooms" className="public-rooms">
              <div className="section-heading">
                <h2>Public rooms</h2>
                <span>{roomsStatus === "loading" ? "Loading" : `${publicRooms.length} open`}</span>
              </div>

              {roomsStatus === "failed" ? <p className="status-text">Could not load rooms.</p> : null}

              <div className="room-list">
                {publicRooms.map((room) => (
                  <button
                    className="room-row"
                    type="button"
                    key={room.roomCode}
                    onClick={() => setRoomCode(room.roomCode)}
                    aria-label={`Select room ${room.title}`}
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

          <aside className="create-room" aria-label="Create room">
            <div className="section-heading">
              <h2>Create room</h2>
              <span>{createStatus === "creating" ? "Creating" : "Host setup"}</span>
            </div>

            <div className="create-form">
              <label>
                Room name
                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={100} />
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={isPublicRoom} onChange={(event) => setIsPublicRoom(event.target.checked)} />
                Public room
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={!nickname.trim() || !roomName.trim() || createStatus === "creating"}
                onClick={() => void handleCreateRoom()}
              >
                <Plus size={18} />
                Create room
              </button>
            </div>

            {createStatus === "failed" ? <p className="status-text">Could not create room.</p> : null}

            {createdRoom ? (
              <div className="host-token-panel" role="status">
                <span>Server URL</span>
                <code>{serverUrl}</code>
                <span>Room code</span>
                <strong>{createdRoom.roomCode}</strong>
                <span>Host token</span>
                <code>{createdRoom.hostToken}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(createdRoom.hostToken);
                  }}
                >
                  <Copy size={16} />
                  Copy token
                </button>
              </div>
            ) : null}

            <div className="host-setup-card">
              <h3>Host setup</h3>
              <ol>
                <li>Create a room and keep the host token private.</li>
                <li>Open machugi.io in the browser tab that will run the quiz.</li>
                <li>Load the Gatchi Machugi extension from GitHub Releases.</li>
                <li>Open the extension popup and enter the server URL, room code, and host token.</li>
                <li>Participants join with the room code after the extension shows connected.</li>
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
