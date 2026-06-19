# Origin Window Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the host iframe flow with an extension-tracked `machugi.io` source window and render the active quiz in Gatchi Machugi UI for both host and participants.

**Architecture:** The extension tracks the current original `machugi.io` tab/window, streams extracted quiz/source state to the server, and keeps fair-play locking on that original window. The server stores source-window status on `RoomState`; the web app removes the iframe and shows source status plus the shared quiz UI.

**Tech Stack:** TypeScript, React, Socket.io, Chrome Extension Manifest V3, Vitest, Vite.

---

## File Structure

- `packages/shared/src/models.ts`: add `SourceWindowState` and `RoomState.sourceWindow`.
- `packages/shared/src/events.ts`: add `ExtensionSourcePayload` and `extension:source`.
- `apps/server/src/domain/roomService.ts`: store source-window status and expose `updateSourceWindow`.
- `apps/server/src/socket/createSocketServer.ts`: accept source-window updates from the current host extension socket only.
- `apps/server/src/domain/roomService.test.ts`: cover source-window state updates.
- `apps/server/src/socket/socketServer.test.ts` or `answerEvents.test.ts`: cover stale extension source-event rejection.
- `apps/extension/src/messages.ts`: add source binding/status message constants when needed.
- `apps/extension/src/background.ts`: bind `machugi.io` source tabs outside the app tab, forward source status, handle source tab close.
- `apps/extension/src/contentScript.ts`: include source-ready metadata and keep existing state/result/failure messages.
- `apps/extension/src/popup.ts` and `popup.html`: show source-window status and expose a manual "use current tab" fallback if automatic binding is ambiguous.
- `apps/web/src/host/HostWorkspace.tsx`: remove iframe, show source-window status and open-original action.
- `apps/web/src/room/QuizPanel.tsx`: improve extracted quiz rendering and Korean fallback/result copy.
- `apps/web/src/room/RoomView.tsx`: expose source-window status in the room titlebar.
- Related `*.test.ts(x)` files: lock behavior with source windows.

---

### Task 1: Shared Source-Window Protocol

**Files:**
- Modify: `packages/shared/src/models.ts`
- Modify: `packages/shared/src/events.ts`

- [ ] **Step 1: Add source-window model**

Add this type near `QuizState` in `packages/shared/src/models.ts`:

```ts
export type SourceWindowStatus = "disconnected" | "connected" | "unsupported";

export interface SourceWindowState {
  status: SourceWindowStatus;
  url: string | null;
  title: string | null;
  lastSeenAt: string | null;
  message: string | null;
}
```

Then add this field to `RoomState`:

```ts
sourceWindow: SourceWindowState;
```

- [ ] **Step 2: Add source-window event payload**

Add this event to `ClientToServerEvents` in `packages/shared/src/events.ts`:

```ts
"extension:source": (payload: ExtensionSourcePayload, ack: Ack<void>) => void;
```

Add this payload interface near `ExtensionStatePayload`:

```ts
export interface ExtensionSourcePayload {
  roomCode: string;
  sourceWindow: SourceWindowState;
}
```

- [ ] **Step 3: Run shared typecheck**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared typecheck
```

Expected: Type errors until server/web initial room state is updated in Task 2/4.

---

### Task 2: Server Source-Window State

**Files:**
- Modify: `apps/server/src/domain/roomService.ts`
- Modify: `apps/server/src/domain/roomService.test.ts`
- Modify: `apps/server/src/socket/createSocketServer.ts`
- Modify: `apps/server/src/socket/answerEvents.test.ts`

- [ ] **Step 1: Add failing domain test**

Add a test in `roomService.test.ts`:

```ts
it("stores source-window connection state without resetting the current round", async () => {
  const service = new RoomService();
  const { roomCode } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });

  service.updateQuizState({
    roomCode,
    quiz: {
      ...service.getState(roomCode).quiz,
      questionIndex: 1,
      questionText: "Name the game",
      questionType: "free-text"
    }
  });
  const questionKey = service.getState(roomCode).fairPlay.questionKey;

  const state = service.updateSourceWindow({
    roomCode,
    sourceWindow: {
      status: "connected",
      url: "https://machugi.io/quiz/123",
      title: "Quiz",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      message: null
    }
  });

  expect(state.sourceWindow.status).toBe("connected");
  expect(state.sourceWindow.url).toBe("https://machugi.io/quiz/123");
  expect(state.fairPlay.questionKey).toBe(questionKey);
});
```

- [ ] **Step 2: Implement `updateSourceWindow` and initial state**

Add `SourceWindowState` import and this method in `RoomService`:

```ts
updateSourceWindow(input: { roomCode: string; sourceWindow: SourceWindowState }): RoomState {
  const room = this.requireRoom(input.roomCode);
  room.state.sourceWindow = input.sourceWindow;
  return room.state;
}
```

Add initial state in `emptyState`:

```ts
sourceWindow: {
  status: "disconnected",
  url: null,
  title: null,
  lastSeenAt: null,
  message: null
},
```

- [ ] **Step 3: Add socket event and stale-extension test**

In `answerEvents.test.ts`, add helper:

```ts
function emitExtensionSource(socket, payload) {
  return new Promise((resolve) => {
    socket.emit("extension:source", payload, resolve);
  });
}
```

Add a test where extension A pairs, extension B pairs, and extension A sends `extension:source`. Expected ack:

```ts
expect(staleAck).toEqual({ ok: false, error: "Current host extension authorization required" });
```

Then extension B sends source status and succeeds:

```ts
expect(currentAck).toEqual({ ok: true, data: undefined });
expect(roomService.getState(roomCode).sourceWindow.status).toBe("connected");
```

- [ ] **Step 4: Implement socket event**

In `createSocketServer.ts`, add zod schema:

```ts
const extensionSourceSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  sourceWindow: z.object({
    status: z.enum(["disconnected", "connected", "unsupported"]),
    url: z.string().nullable(),
    title: z.string().nullable(),
    lastSeenAt: z.string().nullable(),
    message: z.string().nullable()
  })
});
```

Add handler:

```ts
socket.on("extension:source", (payload, ack) => {
  const parsed = extensionSourceSchema.safeParse(payload);
  if (!parsed.success) {
    ackError(ack, "Invalid extension source payload");
    return;
  }

  try {
    requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
    const state = roomService.updateSourceWindow(parsed.data);
    io.to(parsed.data.roomCode).emit("room:state", state);
    ack({ ok: true, data: undefined });
  } catch (error) {
    ackError(ack, error instanceof Error ? error.message : "Source update failed");
  }
});
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- roomService.test.ts answerEvents.test.ts
npm exec --yes pnpm@9.15.0 -- typecheck
```

Commit:

```bash
git add packages/shared/src apps/server/src
git commit -m "feat: track machugi source window state"
```

---

### Task 3: Extension Source-Window Binding

**Files:**
- Modify: `apps/extension/src/background.ts`
- Modify: `apps/extension/src/contentScript.ts`
- Modify: `apps/extension/src/socketClient.ts`
- Modify: `apps/extension/src/socketClient.test.ts`
- Modify: `apps/extension/src/popup.ts`
- Modify: `apps/extension/src/popup.html`

- [ ] **Step 1: Extend socket client**

Add `ExtensionSourcePayload` import and method:

```ts
sendSourceWindow(payload: ExtensionSourcePayload): Promise<void> {
  if (!this.socket) {
    throw new Error(NOT_CONNECTED_MESSAGE);
  }

  return new Promise((resolve, reject) => {
    this.socket?.emit("extension:source", payload, (response) => {
      if (response.ok) {
        resolve();
        return;
      }

      reject(new Error(response.error));
    });
  });
}
```

Test disconnected behavior:

```ts
expect(() =>
  client.sendSourceWindow({
    roomCode: "ABC123",
    sourceWindow: {
      status: "connected",
      url: "https://machugi.io/",
      title: "Machugi",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      message: null
    }
  })
).toThrow(NOT_CONNECTED_MESSAGE);
```

- [ ] **Step 2: Let background bind source tabs outside the app tab**

Replace the app-tab check in `bindMachugiFrame` with source-target logic:

```ts
function isSameSourceTarget(sender: chrome.runtime.MessageSender): boolean {
  return Boolean(
    pairedMachugiFrame &&
      sender.tab?.id === pairedMachugiFrame.tabId &&
      sender.frameId === pairedMachugiFrame.frameId
  );
}

function bindMachugiFrame(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.tab?.id || sender.frameId === undefined) return false;

  pairedMachugiFrame = {
    tabId: sender.tab.id,
    frameId: sender.frameId
  };
  return true;
}
```

Only accept `CONTENT_STATE_MESSAGE`, original request/result/failure from the current target or a newly active source candidate. Use the incoming `QuizState` to prefer active question/result pages:

```ts
function hasActiveQuizEvidence(quiz: QuizState): boolean {
  return Boolean(
    quiz.questionIndex ||
      quiz.questionText ||
      quiz.imageUrl ||
      quiz.audioUrl ||
      quiz.videoUrl ||
      quiz.choices.length > 0 ||
      quiz.resultMessage ||
      quiz.answerCandidates.length > 0
  );
}
```

- [ ] **Step 3: Forward source status**

Add helper in background:

```ts
async function forwardSourceWindow(sourceWindow: SourceWindowState): Promise<void> {
  if (!pairedRoomCode) return;
  await socketClient.sendSourceWindow({ roomCode: pairedRoomCode, sourceWindow });
}
```

When source ready/state arrives, send:

```ts
{
  status: "connected",
  url: href,
  title,
  lastSeenAt: new Date().toISOString(),
  message: null
}
```

When `chrome.tabs.onRemoved` removes the current source tab, send:

```ts
{
  status: "disconnected",
  url: null,
  title: null,
  lastSeenAt: new Date().toISOString(),
  message: "마추기아이오 원본 창이 닫혔습니다."
}
```

- [ ] **Step 4: Include source metadata from content script**

Change frame ready to:

```ts
chrome.runtime.sendMessage({
  type: CONTENT_FRAME_READY_MESSAGE,
  href: window.location.href,
  title: document.title
});
```

- [ ] **Step 5: Popup source fallback**

Add a second button in `popup.html`:

```html
<button id="source-button" type="button">현재 마추기아이오 탭을 원본 창으로 사용</button>
```

In `popup.ts`, if current tab URL host is `machugi.io`, send:

```ts
chrome.runtime.sendMessage({ type: "machugi-use-current-tab-as-source" }, callback);
```

Background handles it by binding the active tab as source and sending a source connected status.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared build
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension typecheck
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension build
```

Commit:

```bash
git add apps/extension/src
git commit -m "feat: bind extension to machugi source windows"
```

---

### Task 4: Web Host Workspace Without Iframe

**Files:**
- Modify: `apps/web/src/host/HostWorkspace.tsx`
- Modify: `apps/web/src/host/HostWorkspace.test.tsx`
- Modify: `apps/web/src/room/RoomView.tsx`
- Modify: `apps/web/src/room/QuizPanel.tsx`
- Modify: `apps/web/src/room/QuizPanel.test.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add failing host workspace test**

In `HostWorkspace.test.tsx`, assert:

```ts
expect(screen.queryByTitle(/마추기아이오 원본 화면/)).not.toBeInTheDocument();
expect(screen.getByRole("link", { name: /마추기아이오 열기/ })).toHaveAttribute("href", "https://machugi.io/");
expect(screen.getByText(/원본 창 연결됨/)).toBeInTheDocument();
```

- [ ] **Step 2: Replace iframe with source status**

Render a source panel:

```tsx
const sourceConnected = state.sourceWindow.status === "connected";

<div className="host-source-panel">
  <span className={sourceConnected ? "host-badge online" : "host-badge"}>
    {sourceConnected ? "원본 창 연결됨" : "원본 창 필요"}
  </span>
  <strong>{state.sourceWindow.title ?? "마추기아이오 원본 창을 열어주세요"}</strong>
  <span>{state.sourceWindow.message ?? state.sourceWindow.url ?? "문제를 선택하면 우리 화면에 표시됩니다."}</span>
  <a className="setup-link" href="https://machugi.io/" target="_blank" rel="noreferrer">
    마추기아이오 열기
  </a>
</div>
```

Remove `.host-frame-shell` usage from JSX.

- [ ] **Step 3: Improve QuizPanel rendering**

Use Korean fallback copy:

```tsx
const fallback = quiz.quizTitle
  ? "문제를 불러오는 중입니다."
  : "아직 원본 창에서 문제를 읽어오지 않았습니다.";
```

Render answer candidates after result:

```tsx
{quiz.answerCandidates.length > 0 ? (
  <div className="answer-candidates">
    <strong>정답</strong>
    {quiz.answerCandidates.map((answer) => <span key={answer}>{answer}</span>)}
  </div>
) : null}
```

- [ ] **Step 4: Add source badge to RoomView**

Add near host extension badge:

```tsx
<span className={props.state.sourceWindow.status === "connected" ? "host-badge online" : "host-badge"}>
  원본 창 {props.state.sourceWindow.status === "connected" ? "연결됨" : "대기"}
</span>
```

- [ ] **Step 5: CSS cleanup**

Remove iframe-specific `.host-frame-shell iframe` styling and add:

```css
.host-source-panel {
  display: grid;
  gap: 8px;
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  padding: 14px;
  background: #f8fafc;
}

.answer-candidates {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared build
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- HostWorkspace.test.tsx QuizPanel.test.tsx RoomView.test.tsx
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web typecheck
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web build
```

Commit:

```bash
git add apps/web/src
git commit -m "feat: render host source window status"
```

---

### Task 5: Final Verification, Push, Then Whole Review

**Files:**
- No expected source edits unless verification or final review finds issues.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- typecheck
npm exec --yes pnpm@9.15.0 -- test
npm exec --yes pnpm@9.15.0 -- build
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension zip
```

Expected: all commands pass.

- [ ] **Step 2: Start local server**

Run with a free port:

```powershell
$env:PORT='3103'; npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server start
```

Open:

```text
http://127.0.0.1:3103
```

Expected: lobby loads, host can create room, host workspace has no iframe and shows source-window status.

- [ ] **Step 3: Push branch**

Run:

```bash
git push
```

- [ ] **Step 4: Final whole review**

Run one final whole-code review focused on:

- stale source windows,
- stale extension sockets,
- source-close behavior,
- original submission retry behavior,
- and host/participant UI consistency.

Fix only high-confidence findings, then re-run full verification.

---

## Self-Review

- Spec coverage: source-window state, extension source binding, no iframe host workspace, source disconnect, retry failure, stale extension socket, and shared quiz rendering each have a task.
- Placeholder scan: no unfinished placeholder markers remain.
- Type consistency: `SourceWindowState`, `ExtensionSourcePayload`, and `RoomState.sourceWindow` names are used consistently across tasks.
