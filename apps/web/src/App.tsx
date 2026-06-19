import { DoorOpen, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PublicRoomSummary } from "@gatchi/shared";
import { fetchPublicRooms } from "./api";
import { HostControls } from "./host/HostControls";
import { ExtensionSetup } from "./host/ExtensionSetup";
import { RoomView } from "./room/RoomView";
import { useRoomSocket } from "./socket/useRoomSocket";

export function App() {
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [roomsStatus, setRoomsStatus] = useState<"idle" | "loading" | "failed">("idle");
  const roomSocket = useRoomSocket();
  const canJoin = useMemo(() => nickname.trim().length > 0 && roomCode.trim().length > 0, [nickname, roomCode]);

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
      </section>
    </main>
  );
}
