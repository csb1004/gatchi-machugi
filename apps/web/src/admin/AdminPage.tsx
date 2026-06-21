import { RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { closeAdminRoom, fetchAdminRooms, type AdminRoomSummary } from "../api";

const adminTokenStorageKey = "gatchi-admin-token";

function connectionLabel(room: AdminRoomSummary) {
  const extension = room.hostExtensionConnected ? "확장 연결" : "확장 끊김";
  const source = room.sourceWindowStatus === "connected" ? "원본 창 연결" : "원본 창 끊김";
  return `${extension} · ${source}`;
}

export function AdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem(adminTokenStorageKey) ?? "");
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "closing" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function loadRooms(nextToken = token) {
    const trimmedToken = nextToken.trim();
    if (!trimmedToken) {
      setRooms([]);
      setStatus("idle");
      setMessage("관리자 토큰을 입력하세요.");
      return;
    }

    setStatus("loading");
    setMessage(null);

    try {
      setRooms(await fetchAdminRooms(trimmedToken));
      setStatus("idle");
    } catch {
      setStatus("failed");
      setMessage("관리자 방 목록을 불러오지 못했습니다.");
    }
  }

  async function handleCloseRoom(roomCode: string) {
    setStatus("closing");
    setMessage(null);

    try {
      await closeAdminRoom(roomCode, token);
      await loadRooms(token);
      setMessage(`${roomCode} 방을 닫았습니다.`);
    } catch {
      setStatus("failed");
      setMessage(`${roomCode} 방을 닫지 못했습니다.`);
    }
  }

  useEffect(() => {
    if (token.trim()) {
      void loadRooms(token);
    }
  }, []);

  useEffect(() => {
    if (token.trim()) {
      localStorage.setItem(adminTokenStorageKey, token.trim());
      return;
    }

    localStorage.removeItem(adminTokenStorageKey);
  }, [token]);

  return (
    <main className="app-shell admin-shell">
      <section className="admin-panel" aria-labelledby="admin-title">
        <header className="lobby-header">
          <div>
            <p className="eyebrow">관리</p>
            <h1 id="admin-title">관리자</h1>
          </div>
          <button className="icon-button" type="button" onClick={() => void loadRooms()} aria-label="방 목록 새로고침">
            <RefreshCw size={18} />
          </button>
        </header>

        <div className="admin-toolbar">
          <label>
            관리자 토큰
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="서버 ADMIN_TOKEN을 입력하세요"
              type="password"
            />
          </label>
          <button className="primary-button" type="button" disabled={!token.trim()} onClick={() => void loadRooms()}>
            <ShieldCheck size={18} />
            조회
          </button>
        </div>

        {message ? <p className="status-text">{message}</p> : null}
        {status === "loading" ? <p className="status-text">방 목록을 불러오는 중입니다.</p> : null}

        <div className="admin-room-list">
          {rooms.length === 0 && status !== "loading" ? <p className="admin-empty">열려 있는 방이 없습니다.</p> : null}

          {rooms.map((room) => (
            <article className="admin-room-row" key={room.roomCode}>
              <div>
                <strong>{room.roomCode}</strong>
                <span>{room.title}</span>
                <small>{room.quizTitle ?? "퀴즈 대기 중"}</small>
              </div>
              <dl>
                <div>
                  <dt>참가자</dt>
                  <dd>{room.participantCount}명</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{room.phase}</dd>
                </div>
                <div>
                  <dt>공개</dt>
                  <dd>{room.visibility}</dd>
                </div>
                <div>
                  <dt>연결</dt>
                  <dd>{connectionLabel(room)}</dd>
                </div>
              </dl>
              <button
                className="danger-button"
                type="button"
                disabled={status === "closing"}
                onClick={() => void handleCloseRoom(room.roomCode)}
              >
                <XCircle size={18} />
                {room.roomCode} 닫기
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
