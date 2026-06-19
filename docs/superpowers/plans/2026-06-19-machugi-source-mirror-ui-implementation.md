# Machugi Source Mirror UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an app-native source mirror UI so the host can search, select, configure, and play `machugi.io` quizzes from Gatchi Machugi while the extension keeps the real source tab synchronized.

**Architecture:** Add a shared `SourceMirrorState` and `SourceMirrorAction` contract. The host extension extracts mirror state from the bound `machugi.io` tab and executes host actions against that tab; the server validates and relays mirror events through the Socket.io room; the web app renders the mirror state as the main room surface with host controls only for the host.

**Tech Stack:** TypeScript, React 19, Vite, Socket.io, Chrome Manifest V3 extension, Vitest, Testing Library, jsdom, pnpm 9.15.0.

---

## Scope Notes

This plan implements the approved A-slice:

- search/home mirror,
- search result mirror,
- quiz detail/basic setup mirror,
- playing/result mirror via existing `QuizState`,
- host-only mirror actions,
- participant read-only view,
- Korean status/fallback UI,
- focused tests and final whole-change verification.

The server still does not crawl `machugi.io`; only the extension reads the original tab.

## File Structure

### Shared Package

- Create `packages/shared/src/sourceMirror.ts`
  - Owns mirror state/action types and small helpers.
- Create `packages/shared/src/sourceMirror.test.ts`
  - Tests helper behavior.
- Modify `packages/shared/src/models.ts`
  - Adds `sourceMirror` to `RoomState`.
- Modify `packages/shared/src/events.ts`
  - Adds Socket.io mirror action/state/failure event payloads.
- Modify `packages/shared/src/index.ts`
  - Exports `sourceMirror.ts`.

### Server

- Modify `apps/server/src/domain/roomService.ts`
  - Initializes and updates mirror state.
  - Keeps `quiz` in sync when mirror state is `playing` or `result`.
- Modify `apps/server/src/domain/roomService.test.ts`
  - Tests mirror initialization and playing state sync.
- Modify `apps/server/src/socket/createSocketServer.ts`
  - Adds schemas and handlers for `source:mirror`, `source:action`, and `source:action-failure`.
  - Uses the existing current host extension socket validation pattern.
- Modify `apps/server/src/socket/socketServer.test.ts`
  - Tests host-only mirror action forwarding and stale extension rejection.

### Extension

- Modify `apps/extension/src/messages.ts`
  - Adds content/background message constants for mirror state/action/failure.
- Create `apps/extension/src/machugi/sourceMirror.ts`
  - Extracts source page mirror state from `document`.
- Create `apps/extension/src/machugi/sourceMirror.test.ts`
  - Fixture tests for home, search results, setup, playing, unsupported.
- Create `apps/extension/src/machugi/sourceActions.ts`
  - Runs mirror actions on `document`.
- Create `apps/extension/src/machugi/sourceActions.test.ts`
  - Tests search, select, timer, question count, start, refresh.
- Modify `apps/extension/src/contentScript.ts`
  - Sends mirror state, receives mirror actions, reports failures.
- Modify `apps/extension/src/background.ts`
  - Forwards mirror state/failures to server and mirror actions to bound source tab.
- Modify `apps/extension/src/socketClient.ts`
  - Adds send/listen methods for mirror events.
- Modify `apps/extension/src/socketClient.test.ts`
  - Tests socket event names and acknowledgements.

### Web

- Modify `apps/web/src/socket/useRoomSocket.ts`
  - Adds `sendSourceAction`.
- Create `apps/web/src/sourceMirror/SourceMirrorView.tsx`
  - State router for all mirror states.
- Create `apps/web/src/sourceMirror/MirrorSearchView.tsx`
  - Host search input and read-only participant search state.
- Create `apps/web/src/sourceMirror/MirrorResultsView.tsx`
  - Result card list.
- Create `apps/web/src/sourceMirror/MirrorSetupView.tsx`
  - Basic timer/question count/start controls.
- Create `apps/web/src/sourceMirror/MirrorUnsupportedView.tsx`
  - Korean fallback status and retry/open-source actions.
- Create `apps/web/src/sourceMirror/SourceMirrorView.test.tsx`
  - Rendering and host/participant permissions.
- Modify `apps/web/src/room/RoomView.tsx`
  - Renders `SourceMirrorView` instead of rendering `QuizPanel` directly.
- Modify `apps/web/src/App.tsx`
  - Removes `HostControls` from the primary host layout.
- Modify `apps/web/src/App.host.test.tsx`
  - Expects mirror UI rather than command panel.
- Modify `apps/web/src/styles.css`
  - Adds mirror layout styles.

---

### Task 1: Shared Mirror Contracts

**Files:**
- Create: `packages/shared/src/sourceMirror.ts`
- Create: `packages/shared/src/sourceMirror.test.ts`
- Modify: `packages/shared/src/models.ts`
- Modify: `packages/shared/src/events.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write shared mirror helper tests**

Create `packages/shared/src/sourceMirror.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDisconnectedSourceMirror, isPlayableSourceMirror, quizFromSourceMirror } from "./sourceMirror.js";
import type { SourceMirrorState } from "./sourceMirror.js";

const quiz = {
  quizTitle: "Pokemon",
  questionIndex: 1,
  totalQuestions: 10,
  questionType: "free-text" as const,
  questionText: "Who is this?",
  imageUrl: null,
  audioUrl: null,
  videoUrl: null,
  choices: [],
  timerSecondsRemaining: null,
  canGoNext: true,
  canGoPrevious: false,
  resultMessage: null,
  answerCandidates: []
};

describe("source mirror helpers", () => {
  it("creates a disconnected mirror state with a readable message", () => {
    expect(createDisconnectedSourceMirror("원본 탭을 연결해 주세요.")).toEqual({
      kind: "disconnected",
      url: null,
      title: null,
      lastSeenAt: null,
      message: "원본 탭을 연결해 주세요."
    });
  });

  it("returns quiz state only for playing and result mirror states", () => {
    const playing: SourceMirrorState = {
      kind: "playing",
      url: "https://machugi.io/quiz/1",
      title: "Pokemon",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      quiz
    };
    const home: SourceMirrorState = {
      kind: "home",
      url: "https://machugi.io/",
      title: "마추기 아이오",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      query: ""
    };

    expect(isPlayableSourceMirror(playing)).toBe(true);
    expect(quizFromSourceMirror(playing)).toEqual(quiz);
    expect(isPlayableSourceMirror(home)).toBe(false);
    expect(quizFromSourceMirror(home)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the shared test and verify it fails**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared test -- sourceMirror.test.ts
```

Expected: FAIL because `packages/shared/src/sourceMirror.ts` does not exist.

- [ ] **Step 3: Add mirror contract types and helpers**

Create `packages/shared/src/sourceMirror.ts`:

```ts
import type { QuizState } from "./models.js";

export type SourceMirrorKind =
  | "disconnected"
  | "loading"
  | "home"
  | "searchResults"
  | "quizDetail"
  | "playing"
  | "result"
  | "unsupported"
  | "error";

export interface MirrorQuizResult {
  id: string;
  title: string;
  href: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  meta: string[];
}

export interface MirrorQuizSummary {
  title: string;
  href: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  meta: string[];
}

export interface MirrorQuizSettings {
  timerSeconds: number | null;
  questionCount: number | null;
  availableTimers: number[];
  availableQuestionCounts: number[];
}

export type SourceMirrorState =
  | {
      kind: "disconnected";
      url: string | null;
      title: string | null;
      lastSeenAt: string | null;
      message: string | null;
    }
  | {
      kind: "loading";
      url: string | null;
      title: string | null;
      lastSeenAt: string | null;
      action: SourceMirrorActionName | null;
      message: string | null;
    }
  | {
      kind: "home";
      url: string;
      title: string | null;
      lastSeenAt: string;
      query: string;
    }
  | {
      kind: "searchResults";
      url: string;
      title: string | null;
      lastSeenAt: string;
      query: string;
      results: MirrorQuizResult[];
    }
  | {
      kind: "quizDetail";
      url: string;
      title: string | null;
      lastSeenAt: string;
      quiz: MirrorQuizSummary;
      settings: MirrorQuizSettings;
    }
  | {
      kind: "playing";
      url: string;
      title: string | null;
      lastSeenAt: string;
      quiz: QuizState;
    }
  | {
      kind: "result";
      url: string;
      title: string | null;
      lastSeenAt: string;
      quiz: QuizState;
    }
  | {
      kind: "unsupported";
      url: string;
      title: string | null;
      lastSeenAt: string;
      reason: string;
    }
  | {
      kind: "error";
      url: string | null;
      title: string | null;
      lastSeenAt: string | null;
      message: string;
    };

export type SourceMirrorActionName =
  | "focusHome"
  | "search"
  | "selectResult"
  | "setTimer"
  | "setQuestionCount"
  | "startQuiz"
  | "next"
  | "previous"
  | "skip"
  | "refreshSource"
  | "focusOriginalTab";

export type SourceMirrorAction =
  | { name: "focusHome" }
  | { name: "search"; query: string }
  | { name: "selectResult"; resultId: string; href?: string | null }
  | { name: "setTimer"; timerSeconds: number | null }
  | { name: "setQuestionCount"; questionCount: number | null }
  | { name: "startQuiz" }
  | { name: "next" }
  | { name: "previous" }
  | { name: "skip" }
  | { name: "refreshSource" }
  | { name: "focusOriginalTab" };

export interface SourceMirrorActionPayload {
  roomCode: string;
  actionId: string;
  action: SourceMirrorAction;
}

export interface SourceMirrorActionFailurePayload {
  roomCode: string;
  actionId: string;
  action: SourceMirrorAction;
  reason: string;
}

export function createDisconnectedSourceMirror(message: string | null): SourceMirrorState {
  return {
    kind: "disconnected",
    url: null,
    title: null,
    lastSeenAt: null,
    message
  };
}

export function isPlayableSourceMirror(state: SourceMirrorState): state is Extract<SourceMirrorState, { kind: "playing" | "result" }> {
  return state.kind === "playing" || state.kind === "result";
}

export function quizFromSourceMirror(state: SourceMirrorState): QuizState | null {
  return isPlayableSourceMirror(state) ? state.quiz : null;
}
```

- [ ] **Step 4: Add `sourceMirror` to `RoomState`**

Modify `packages/shared/src/models.ts`:

```ts
import type { SourceMirrorState } from "./sourceMirror.js";
```

Add this property to `RoomState` directly after `sourceWindow`:

```ts
  sourceMirror: SourceMirrorState;
```

- [ ] **Step 5: Add Socket.io event contracts**

Modify `packages/shared/src/events.ts` imports:

```ts
  SourceWindowState
} from "./models.js";
import type {
  SourceMirrorActionFailurePayload,
  SourceMirrorActionPayload,
  SourceMirrorState
} from "./sourceMirror.js";
```

Add server-to-client events:

```ts
  "source:action": (payload: SourceMirrorActionPayload) => void;
  "source:action-failure": (payload: SourceMirrorActionFailurePayload) => void;
```

Add client-to-server events:

```ts
  "source:action": (payload: SourceMirrorActionPayload, ack: Ack<void>) => void;
  "source:mirror": (payload: SourceMirrorPayload, ack: Ack<void>) => void;
  "source:action-failure": (payload: SourceMirrorActionFailurePayload, ack: Ack<void>) => void;
```

Add payload interface:

```ts
export interface SourceMirrorPayload {
  roomCode: string;
  sourceMirror: SourceMirrorState;
}
```

- [ ] **Step 6: Export the mirror contract**

Modify `packages/shared/src/index.ts`:

```ts
export * from "./sourceMirror.js";
```

- [ ] **Step 7: Run shared tests and typecheck**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared test -- sourceMirror.test.ts
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared typecheck
```

Expected: both commands PASS.

- [ ] **Step 8: Commit shared contracts**

Run:

```powershell
git add packages/shared/src/sourceMirror.ts packages/shared/src/sourceMirror.test.ts packages/shared/src/models.ts packages/shared/src/events.ts packages/shared/src/index.ts
git commit -m "feat: add source mirror contracts"
```

---

### Task 2: Server Mirror State And Action Plumbing

**Files:**
- Modify: `apps/server/src/domain/roomService.ts`
- Modify: `apps/server/src/domain/roomService.test.ts`
- Modify: `apps/server/src/socket/createSocketServer.ts`
- Modify: `apps/server/src/socket/socketServer.test.ts`

- [ ] **Step 1: Write RoomService mirror tests**

Add these tests to `apps/server/src/domain/roomService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomService } from "./roomService.js";

describe("RoomService source mirror", () => {
  it("starts rooms with a disconnected source mirror", async () => {
    const service = new RoomService();
    const created = await service.createRoom({
      title: "마추기 방",
      hostNickname: "Host",
      visibility: "public"
    });

    expect(created.state.sourceMirror).toEqual({
      kind: "disconnected",
      url: null,
      title: null,
      lastSeenAt: null,
      message: "원본 탭을 연결해 주세요."
    });
  });

  it("updates quiz and phase when mirror state becomes playable", async () => {
    const service = new RoomService();
    const created = await service.createRoom({
      title: "마추기 방",
      hostNickname: "Host",
      visibility: "public"
    });

    const quiz = {
      ...created.state.quiz,
      quizTitle: "Pokemon",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "free-text" as const,
      questionText: "Who is this?"
    };

    const state = service.updateSourceMirror({
      roomCode: created.roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/1",
        title: "Pokemon",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        quiz
      }
    });

    expect(state.sourceMirror.kind).toBe("playing");
    expect(state.quiz.questionText).toBe("Who is this?");
    expect(state.phase).toBe("playing");
    expect(state.fairPlay.originalSubmitStatus).toBe("locked");
  });
});
```

- [ ] **Step 2: Run RoomService tests and verify failure**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- roomService.test.ts
```

Expected: FAIL because `updateSourceMirror` and `sourceMirror` initialization are missing.

- [ ] **Step 3: Implement RoomService mirror state**

Modify `apps/server/src/domain/roomService.ts` imports:

```ts
  type SourceMirrorState,
  createDisconnectedSourceMirror,
  quizFromSourceMirror
} from "@gatchi/shared";
```

Add method after `updateSourceWindow`:

```ts
  updateSourceMirror(input: { roomCode: string; sourceMirror: SourceMirrorState }): RoomState {
    const room = this.requireRoom(input.roomCode);
    room.state.sourceMirror = input.sourceMirror;

    const quiz = quizFromSourceMirror(input.sourceMirror);
    if (quiz) {
      return this.updateQuizState({
        roomCode: input.roomCode,
        quiz
      });
    }

    if (input.sourceMirror.kind === "home" || input.sourceMirror.kind === "searchResults" || input.sourceMirror.kind === "quizDetail") {
      room.state.phase = "searching";
    }

    return room.state;
  }
```

In `emptyState`, add directly after `sourceWindow`:

```ts
      sourceMirror: createDisconnectedSourceMirror("원본 탭을 연결해 주세요."),
```

- [ ] **Step 4: Run RoomService tests**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- roomService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write socket mirror tests**

Add imports to `apps/server/src/socket/socketServer.test.ts`:

```ts
import type { SourceMirrorActionPayload } from "@gatchi/shared";
```

Add helper:

```ts
function emitSourceMirrorAction(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: SourceMirrorActionPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("source:action", payload, resolve);
  });
}
```

Add test:

```ts
it("forwards source mirror actions only from the host web session to the current extension", async () => {
  const roomService = new RoomService();
  const app = createApp({ roomService });
  const server = createServer(app);
  createSocketServer(server, { roomService });
  servers.push(server);

  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const created = await createRoom(baseUrl, { roomName: "Mirror room", public: false });

  const participantSocket = await connectClient(baseUrl);
  sockets.push(participantSocket);
  const joinAck = await emitJoin(participantSocket, {
    roomCode: created.data.roomCode,
    nickname: "Mina"
  });
  expect(joinAck.ok).toBe(true);

  const extensionSocket = await connectClient(baseUrl);
  sockets.push(extensionSocket);
  const hostAck = await emitHostPair(extensionSocket, {
    roomCode: created.data.roomCode,
    hostCode: created.data.hostCode
  });
  expect(hostAck.ok).toBe(true);

  const hostWebSocket = await connectClient(baseUrl);
  sockets.push(hostWebSocket);
  const hostJoinAck = await emitJoin(hostWebSocket, {
    roomCode: created.data.roomCode,
    nickname: "Host",
    participantId: created.data.hostParticipantId,
    participantCode: created.data.hostCode
  });
  expect(hostJoinAck.ok).toBe(true);

  const action: SourceMirrorActionPayload = {
    roomCode: created.data.roomCode,
    actionId: "act-1",
    action: { name: "search", query: "pokemon" }
  };

  const forwarded = waitForEvent(extensionSocket, "source:action");
  await expect(emitSourceMirrorAction(participantSocket, action)).resolves.toEqual({
    ok: false,
    error: "Host authorization required"
  });

  await expect(emitSourceMirrorAction(hostWebSocket, action)).resolves.toEqual({
    ok: true,
    data: undefined
  });
  await expect(forwarded).resolves.toEqual(action);
});
```

- [ ] **Step 6: Run socket test and verify failure**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- socketServer.test.ts
```

Expected: FAIL because `source:action` is not handled yet.

- [ ] **Step 7: Add schemas and socket handlers**

Modify `apps/server/src/socket/createSocketServer.ts` imports:

```ts
  SourceMirrorActionFailurePayload,
  SourceMirrorActionPayload,
  SourceMirrorPayload,
```

Add schemas near existing schemas:

```ts
const sourceMirrorActionSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  actionId: z.string().trim().min(1).max(80),
  action: z.custom<SourceMirrorActionPayload["action"]>((value) => typeof value === "object" && value !== null)
});

const sourceMirrorSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  sourceMirror: z.custom<SourceMirrorPayload["sourceMirror"]>((value) => typeof value === "object" && value !== null)
});

const sourceMirrorFailureSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  actionId: z.string().trim().min(1).max(80),
  action: z.custom<SourceMirrorActionFailurePayload["action"]>((value) => typeof value === "object" && value !== null),
  reason: z.string().trim().min(1).max(500)
});
```

Add handlers inside `io.on("connection")`, after `extension:source`:

```ts
    socket.on("source:mirror", (payload: SourceMirrorPayload, ack: Ack<void>) => {
      const parsed = sourceMirrorSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid source mirror payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        const state = roomService.updateSourceMirror(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
        emitOriginalSubmitIfReady(parsed.data.roomCode, state);
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Source mirror update failed");
      }
    });

    socket.on("source:action", (payload: SourceMirrorActionPayload, ack: Ack<void>) => {
      const parsed = sourceMirrorActionSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid source action payload");
        return;
      }

      try {
        requireHostSession(session, parsed.data.roomCode);
        const extensionSocketId = hostExtensionSocketIds.get(parsed.data.roomCode);
        if (!extensionSocketId) {
          throw new Error("Host extension is not connected");
        }
        io.to(extensionSocketId).emit("source:action", parsed.data);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Source action failed");
      }
    });

    socket.on("source:action-failure", (payload: SourceMirrorActionFailurePayload, ack: Ack<void>) => {
      const parsed = sourceMirrorFailureSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid source action failure payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        io.to(parsed.data.roomCode).emit("source:action-failure", parsed.data);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Source action failure failed");
      }
    });
```

- [ ] **Step 8: Run server tests and typecheck**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- roomService.test.ts socketServer.test.ts
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit server mirror plumbing**

Run:

```powershell
git add apps/server/src/domain/roomService.ts apps/server/src/domain/roomService.test.ts apps/server/src/socket/createSocketServer.ts apps/server/src/socket/socketServer.test.ts
git commit -m "feat: relay source mirror room state"
```

---

### Task 3: Extension Source Mirror Extraction

**Files:**
- Create: `apps/extension/src/machugi/sourceMirror.ts`
- Create: `apps/extension/src/machugi/sourceMirror.test.ts`
- Modify: `apps/extension/src/contentScript.ts`
- Modify: `apps/extension/src/messages.ts`

- [ ] **Step 1: Write source mirror extractor tests**

Create `apps/extension/src/machugi/sourceMirror.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractSourceMirrorState } from "./sourceMirror";

describe("extractSourceMirrorState", () => {
  it("extracts the home search state", () => {
    document.title = "마추기 아이오";
    history.replaceState(null, "", "https://machugi.io/");
    document.body.innerHTML = `<input type="search" value="pokemon" aria-label="검색">`;

    expect(extractSourceMirrorState(document)).toMatchObject({
      kind: "home",
      query: "pokemon"
    });
  });

  it("extracts visible quiz search results", () => {
    document.title = "검색 - 마추기 아이오";
    history.replaceState(null, "", "https://machugi.io/search?q=pokemon");
    document.body.innerHTML = `
      <input type="search" value="pokemon" aria-label="검색">
      <a class="QuizCard_root__abc" href="/quiz/123">
        <img src="/thumb.png" alt="">
        <strong>포켓몬 실루엣 맞추기</strong>
        <p>20문제</p>
      </a>
    `;

    const state = extractSourceMirrorState(document);
    expect(state.kind).toBe("searchResults");
    if (state.kind !== "searchResults") throw new Error("expected searchResults");
    expect(state.query).toBe("pokemon");
    expect(state.results).toEqual([
      expect.objectContaining({
        title: "포켓몬 실루엣 맞추기",
        href: "https://machugi.io/quiz/123",
        thumbnailUrl: "https://machugi.io/thumb.png"
      })
    ]);
  });

  it("delegates active question pages to QuizState", () => {
    document.title = "Pokemon - 마추기 아이오";
    history.replaceState(null, "", "https://machugi.io/quiz/123/play");
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <p data-question-text>Who is this?</p>
        <input type="text">
      </div>
    `;

    const state = extractSourceMirrorState(document);
    expect(state.kind).toBe("playing");
    if (state.kind !== "playing") throw new Error("expected playing");
    expect(state.quiz.questionText).toBe("Who is this?");
  });
});
```

- [ ] **Step 2: Run extractor tests and verify failure**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test -- sourceMirror.test.ts
```

Expected: FAIL because `sourceMirror.ts` does not exist.

- [ ] **Step 3: Implement source mirror extraction**

Create `apps/extension/src/machugi/sourceMirror.ts`:

```ts
import type { MirrorQuizResult, SourceMirrorState } from "@gatchi/shared";
import { extractQuizState } from "./extractor";

const searchInputSelector = "input[type='search'], input[aria-label*='검색'], input[name*='search' i]";
const resultSelector = "a[href*='quiz'], a[class*='QuizCard'], article a[href], [class*='QuizCard'] a[href]";
const playingSelector = "[class*='QuizDetailPlaying'], [data-question-text], [data-question-image], audio, video";
const resultFeedbackSelector = "[class*='QuizDetailAnswerResult'], [role='alert'], [data-result-message]";

function now(): string {
  return new Date().toISOString();
}

function absoluteUrl(value: string | null, root: Document): string | null {
  if (!value) return null;
  try {
    return new URL(value, root.location.href).toString();
  } catch {
    return value;
  }
}

function currentQuery(root: Document): string {
  const input = root.querySelector<HTMLInputElement>(searchInputSelector);
  if (input?.value) return input.value.trim();
  try {
    return new URL(root.location.href).searchParams.get("q")?.trim() ?? "";
  } catch {
    return "";
  }
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function resultTitle(element: Element): string {
  const preferred = element.querySelector("strong, h1, h2, h3, [class*='Title']")?.textContent;
  return compactText(preferred || element.textContent).slice(0, 120);
}

function extractResults(root: Document): MirrorQuizResult[] {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>(resultSelector));
  const seen = new Set<string>();

  return anchors
    .map((anchor, index) => {
      const href = absoluteUrl(anchor.getAttribute("href"), root);
      const title = resultTitle(anchor);
      const id = href || `${index + 1}:${title}`;
      const image = anchor.querySelector<HTMLImageElement>("img");
      const description = compactText(anchor.querySelector("p, [class*='Description'], [class*='Meta']")?.textContent).slice(0, 160) || null;

      return {
        id,
        title,
        href,
        thumbnailUrl: absoluteUrl(image?.getAttribute("src") ?? null, root),
        description,
        meta: description ? [description] : []
      };
    })
    .filter((result) => {
      if (!result.title || seen.has(result.id)) return false;
      seen.add(result.id);
      return true;
    })
    .slice(0, 30);
}

function hasPlayableEvidence(root: Document): boolean {
  return Boolean(root.querySelector(playingSelector));
}

function hasResultEvidence(root: Document): boolean {
  return Boolean(root.querySelector(resultFeedbackSelector));
}

export function extractSourceMirrorState(root: Document = document): SourceMirrorState {
  const url = root.location.href;
  const title = root.title || null;
  const lastSeenAt = now();

  if (hasPlayableEvidence(root)) {
    const quiz = extractQuizState(root);
    return {
      kind: hasResultEvidence(root) ? "result" : "playing",
      url,
      title,
      lastSeenAt,
      quiz
    };
  }

  const query = currentQuery(root);
  const results = extractResults(root);
  if (results.length > 0) {
    return {
      kind: "searchResults",
      url,
      title,
      lastSeenAt,
      query,
      results
    };
  }

  if (root.querySelector(searchInputSelector) || new URL(url).pathname === "/") {
    return {
      kind: "home",
      url,
      title,
      lastSeenAt,
      query
    };
  }

  return {
    kind: "unsupported",
    url,
    title,
    lastSeenAt,
    reason: "원본 사이트의 현재 화면을 읽을 수 없습니다."
  };
}
```

- [ ] **Step 4: Add mirror message constant**

Modify `apps/extension/src/messages.ts`:

```ts
export const CONTENT_SOURCE_MIRROR_MESSAGE = "machugi-source-mirror";
```

- [ ] **Step 5: Send mirror state from content script**

Modify imports in `apps/extension/src/contentScript.ts`:

```ts
import { extractSourceMirrorState } from "./machugi/sourceMirror";
```

Add local constant:

```ts
const CONTENT_SOURCE_MIRROR_MESSAGE = "machugi-source-mirror";
```

Add function:

```ts
function sendSourceMirrorState() {
  chrome.runtime.sendMessage({
    type: CONTENT_SOURCE_MIRROR_MESSAGE,
    href: window.location.href,
    title: document.title,
    payload: extractSourceMirrorState(document)
  });
}
```

Call it after each `sendState()` call by replacing:

```ts
sendState();
```

with:

```ts
sendState();
sendSourceMirrorState();
```

Inside the mutation observer callback, replace:

```ts
sendState();
```

with:

```ts
sendState();
sendSourceMirrorState();
```

- [ ] **Step 6: Run extension extractor tests and typecheck**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test -- sourceMirror.test.ts extractor.test.ts
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit source mirror extraction**

Run:

```powershell
git add apps/extension/src/messages.ts apps/extension/src/contentScript.ts apps/extension/src/machugi/sourceMirror.ts apps/extension/src/machugi/sourceMirror.test.ts
git commit -m "feat: extract machugi source mirror state"
```

---

### Task 4: Extension Mirror Actions And Socket Bridge

**Files:**
- Create: `apps/extension/src/machugi/sourceActions.ts`
- Create: `apps/extension/src/machugi/sourceActions.test.ts`
- Modify: `apps/extension/src/messages.ts`
- Modify: `apps/extension/src/contentScript.ts`
- Modify: `apps/extension/src/background.ts`
- Modify: `apps/extension/src/socketClient.ts`
- Modify: `apps/extension/src/socketClient.test.ts`

- [ ] **Step 1: Write action runner tests**

Create `apps/extension/src/machugi/sourceActions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runSourceMirrorAction } from "./sourceActions";

describe("runSourceMirrorAction", () => {
  it("fills and submits the search input", () => {
    document.body.innerHTML = `
      <form>
        <input type="search" aria-label="검색">
        <button type="submit">검색</button>
      </form>
    `;
    const form = document.querySelector("form") as HTMLFormElement;
    const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => undefined);

    expect(runSourceMirrorAction({ name: "search", query: "pokemon" }, document)).toEqual({ ok: true });
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("pokemon");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("clicks a selected quiz result by href", () => {
    document.body.innerHTML = `<a href="/quiz/123">포켓몬 실루엣 맞추기</a>`;
    const anchor = document.querySelector("a") as HTMLAnchorElement;
    const click = vi.spyOn(anchor, "click");

    expect(runSourceMirrorAction({ name: "selectResult", resultId: "https://machugi.io/quiz/123", href: "https://machugi.io/quiz/123" }, document)).toEqual({
      ok: true
    });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("reports an actionable failure when a control is missing", () => {
    document.body.innerHTML = `<main></main>`;

    expect(runSourceMirrorAction({ name: "search", query: "pokemon" }, document)).toEqual({
      ok: false,
      reason: "검색창을 찾을 수 없습니다."
    });
  });
});
```

- [ ] **Step 2: Run action tests and verify failure**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test -- sourceActions.test.ts
```

Expected: FAIL because `sourceActions.ts` does not exist.

- [ ] **Step 3: Implement action runner**

Create `apps/extension/src/machugi/sourceActions.ts`:

```ts
import type { SourceMirrorAction } from "@gatchi/shared";
import { runMachugiCommand } from "./commands";

type ActionResult = { ok: true } | { ok: false; reason: string };

const searchInputSelector = "input[type='search'], input[aria-label*='검색'], input[name*='search' i]";
const startButtonPattern = /시작|풀기|start/i;

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function absoluteUrl(value: string | null, root: Document): string | null {
  if (!value) return null;
  try {
    return new URL(value, root.location.href).toString();
  } catch {
    return value;
  }
}

function clickButtonByText(root: Document, pattern: RegExp): boolean {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((element) =>
    pattern.test(`${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`)
  );
  if (!button) return false;
  button.click();
  return true;
}

function runSearch(query: string, root: Document): ActionResult {
  const input = root.querySelector<HTMLInputElement>(searchInputSelector);
  if (!input) return { ok: false, reason: "검색창을 찾을 수 없습니다." };

  input.focus();
  setInputValue(input, query);
  const form = input.closest("form");
  if (form) {
    form.requestSubmit();
    return { ok: true };
  }

  if (clickButtonByText(root, /검색|search/i)) return { ok: true };
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return { ok: true };
}

function runSelectResult(href: string | null | undefined, resultId: string, root: Document): ActionResult {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const target = anchors.find((anchor) => {
    const absolute = absoluteUrl(anchor.getAttribute("href"), root);
    return absolute === href || absolute === resultId || anchor.textContent?.trim() === resultId;
  });

  if (!target) return { ok: false, reason: "선택한 퀴즈를 원본 화면에서 찾을 수 없습니다." };
  target.click();
  return { ok: true };
}

export function runSourceMirrorAction(action: SourceMirrorAction, root: Document = document): ActionResult {
  if (action.name === "focusHome") {
    root.defaultView?.location.assign("https://machugi.io/");
    return { ok: true };
  }

  if (action.name === "search") return runSearch(action.query, root);
  if (action.name === "selectResult") return runSelectResult(action.href, action.resultId, root);
  if (action.name === "startQuiz") return clickButtonByText(root, startButtonPattern) || runMachugiCommand("start", root) ? { ok: true } : { ok: false, reason: "시작 버튼을 찾을 수 없습니다." };
  if (action.name === "next") return runMachugiCommand("next", root) ? { ok: true } : { ok: false, reason: "다음 버튼을 찾을 수 없습니다." };
  if (action.name === "previous") return runMachugiCommand("previous", root) ? { ok: true } : { ok: false, reason: "이전 화면으로 이동할 수 없습니다." };
  if (action.name === "skip") return runMachugiCommand("skip", root) ? { ok: true } : { ok: false, reason: "건너뛰기 버튼을 찾을 수 없습니다." };
  if (action.name === "refreshSource") {
    root.defaultView?.location.reload();
    return { ok: true };
  }

  return { ok: false, reason: "이 설정은 현재 원본 화면에서 자동 적용할 수 없습니다." };
}
```

- [ ] **Step 4: Add action message constants**

Modify `apps/extension/src/messages.ts`:

```ts
export const CONTENT_SOURCE_ACTION_MESSAGE = "machugi-source-action";
export const CONTENT_SOURCE_ACTION_FAILURE_MESSAGE = "machugi-source-action-failure";
```

- [ ] **Step 5: Add content script action handling**

Modify `apps/extension/src/contentScript.ts` imports:

```ts
import type { SourceMirrorActionPayload } from "@gatchi/shared";
import { runSourceMirrorAction } from "./machugi/sourceActions";
```

Add local constants:

```ts
const CONTENT_SOURCE_ACTION_MESSAGE = "machugi-source-action";
const CONTENT_SOURCE_ACTION_FAILURE_MESSAGE = "machugi-source-action-failure";
```

Add function:

```ts
function sendSourceActionFailure(payload: SourceMirrorActionPayload, reason: string) {
  chrome.runtime.sendMessage({
    type: CONTENT_SOURCE_ACTION_FAILURE_MESSAGE,
    payload: {
      ...payload,
      reason
    }
  });
}
```

Add `onMessage` branch before the final `return false`:

```ts
    if (messageType === CONTENT_SOURCE_ACTION_MESSAGE) {
      const payload = (message as unknown as { payload: SourceMirrorActionPayload }).payload;
      const result = runSourceMirrorAction(payload.action, document);
      if (!result.ok) {
        sendSourceActionFailure(payload, result.reason);
      }
      window.setTimeout(() => {
        sendState();
        sendSourceMirrorState();
      }, 250);
      sendResponse(result);
      return true;
    }
```

- [ ] **Step 6: Extend socket client**

Modify `apps/extension/src/socketClient.ts` imports:

```ts
  SourceMirrorActionFailurePayload,
  SourceMirrorActionPayload,
  SourceMirrorPayload,
```

Add methods:

```ts
  sendSourceMirror(payload: SourceMirrorPayload): Promise<void> {
    if (!this.socket) {
      throw new Error(NOT_CONNECTED_MESSAGE);
    }

    return new Promise((resolve, reject) => {
      this.socket?.emit("source:mirror", payload, (response) => {
        if (response.ok) {
          resolve();
          return;
        }

        reject(new Error(response.error));
      });
    });
  }

  sendSourceActionFailure(payload: SourceMirrorActionFailurePayload): Promise<void> {
    if (!this.socket) {
      throw new Error(NOT_CONNECTED_MESSAGE);
    }

    return new Promise((resolve, reject) => {
      this.socket?.emit("source:action-failure", payload, (response) => {
        if (response.ok) {
          resolve();
          return;
        }

        reject(new Error(response.error));
      });
    });
  }

  onSourceAction(handler: (payload: SourceMirrorActionPayload) => void): () => void {
    if (!this.socket) {
      throw new Error(NOT_CONNECTED_MESSAGE);
    }

    const socket = this.socket;
    socket.on("source:action" as never, handler as never);
    return () => socket.off("source:action" as never, handler as never);
  }
```

- [ ] **Step 7: Bridge background to source tab and server**

Modify `apps/extension/src/background.ts` imports:

```ts
  SourceMirrorActionFailurePayload,
  SourceMirrorActionPayload,
  SourceMirrorState
```

Import constants:

```ts
  CONTENT_SOURCE_ACTION_FAILURE_MESSAGE,
  CONTENT_SOURCE_ACTION_MESSAGE,
  CONTENT_SOURCE_MIRROR_MESSAGE,
```

Add helper:

```ts
function isSourceMirrorState(value: unknown): value is SourceMirrorState {
  return typeof value === "object" && value !== null && "kind" in value;
}
```

Register action handler in `registerPairedBridge`:

```ts
    socketClient.onSourceAction((payload) => {
      void sendSourceActionToPairedMachugiFrame(payload);
    }),
```

Add functions:

```ts
async function forwardSourceMirror(sourceMirror: SourceMirrorState): Promise<void> {
  if (!pairedRoomCode) return;

  try {
    await socketClient.sendSourceMirror({
      roomCode: pairedRoomCode,
      sourceMirror
    });
  } catch (error) {
    console.error("원본 미러 상태 전달에 실패했습니다.", error);
  }
}

async function forwardSourceActionFailure(payload: SourceMirrorActionFailurePayload): Promise<void> {
  try {
    await socketClient.sendSourceActionFailure(payload);
  } catch (error) {
    console.error("원본 미러 동작 실패 전달에 실패했습니다.", error);
  }
}

async function sendSourceActionToPairedMachugiFrame(payload: SourceMirrorActionPayload): Promise<void> {
  if (payload.action.name === "focusOriginalTab" && pairedMachugiFrame) {
    await chrome.tabs.update(pairedMachugiFrame.tabId, { active: true });
    return;
  }

  const delivered = await sendMessageToPairedMachugiFrame({
    type: CONTENT_SOURCE_ACTION_MESSAGE,
    payload
  }).catch(() => false);

  if (delivered) return;

  await forwardSourceActionFailure({
    ...payload,
    reason: ORIGINAL_SOURCE_DISCONNECTED_MESSAGE
  });
}
```

Add `onMessage` branches:

```ts
    if (messageType === CONTENT_SOURCE_MIRROR_MESSAGE) {
      if (!isSourceMirrorState(message.payload)) {
        sendResponse({ ok: false, error: "올바른 원본 미러 상태가 아닙니다." });
        return true;
      }

      if (shouldAcceptOriginalEvent(sender) && bindMachugiFrame(sender)) {
        void announceSourceWindow(message, sender);
        void forwardSourceMirror(message.payload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: UNBOUND_SOURCE_MESSAGE });
      }
      return true;
    }

    if (messageType === CONTENT_SOURCE_ACTION_FAILURE_MESSAGE) {
      if (shouldAcceptOriginalEvent(sender)) {
        void forwardSourceActionFailure(message.payload as SourceMirrorActionFailurePayload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: UNBOUND_SOURCE_MESSAGE });
      }
      return true;
    }
```

- [ ] **Step 8: Run extension action and socket tests**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test -- sourceActions.test.ts socketClient.test.ts
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit extension mirror actions**

Run:

```powershell
git add apps/extension/src/messages.ts apps/extension/src/contentScript.ts apps/extension/src/background.ts apps/extension/src/socketClient.ts apps/extension/src/socketClient.test.ts apps/extension/src/machugi/sourceActions.ts apps/extension/src/machugi/sourceActions.test.ts
git commit -m "feat: control machugi source mirror actions"
```

---

### Task 5: Web Socket Hook And Source Mirror Components

**Files:**
- Modify: `apps/web/src/socket/useRoomSocket.ts`
- Create: `apps/web/src/sourceMirror/SourceMirrorView.tsx`
- Create: `apps/web/src/sourceMirror/MirrorSearchView.tsx`
- Create: `apps/web/src/sourceMirror/MirrorResultsView.tsx`
- Create: `apps/web/src/sourceMirror/MirrorSetupView.tsx`
- Create: `apps/web/src/sourceMirror/MirrorUnsupportedView.tsx`
- Create: `apps/web/src/sourceMirror/SourceMirrorView.test.tsx`

- [ ] **Step 1: Write mirror UI tests**

Create `apps/web/src/sourceMirror/SourceMirrorView.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceMirrorState } from "@gatchi/shared";
import { describe, expect, it, vi } from "vitest";
import { SourceMirrorView } from "./SourceMirrorView";

const home: SourceMirrorState = {
  kind: "home",
  url: "https://machugi.io/",
  title: "마추기 아이오",
  lastSeenAt: "2026-06-19T00:00:00.000Z",
  query: ""
};

const results: SourceMirrorState = {
  kind: "searchResults",
  url: "https://machugi.io/search?q=pokemon",
  title: "검색",
  lastSeenAt: "2026-06-19T00:00:00.000Z",
  query: "pokemon",
  results: [
    {
      id: "https://machugi.io/quiz/123",
      title: "포켓몬 실루엣 맞추기",
      href: "https://machugi.io/quiz/123",
      thumbnailUrl: null,
      description: "20문제",
      meta: ["20문제"]
    }
  ]
};

describe("SourceMirrorView", () => {
  it("lets the host search from the mirrored home view", async () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={home} isHost onAction={onAction} />);

    await userEvent.type(screen.getByLabelText("검색어"), "pokemon");
    await userEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(onAction).toHaveBeenCalledWith({ name: "search", query: "pokemon" });
  });

  it("shows search results and lets only the host select them", async () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    await userEvent.click(screen.getByRole("button", { name: "포켓몬 실루엣 맞추기 선택" }));

    expect(onAction).toHaveBeenCalledWith({
      name: "selectResult",
      resultId: "https://machugi.io/quiz/123",
      href: "https://machugi.io/quiz/123"
    });
  });

  it("renders participant results as read-only", () => {
    render(<SourceMirrorView state={results} isHost={false} onAction={() => undefined} />);

    expect(screen.getByText("포켓몬 실루엣 맞추기")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "포켓몬 실루엣 맞추기 선택" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run mirror UI tests and verify failure**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- SourceMirrorView.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Add socket action sender**

Modify `apps/web/src/socket/useRoomSocket.ts` imports:

```ts
  SourceMirrorAction,
```

Add helper:

```ts
function createActionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
```

Add function inside `useRoomSocket`:

```ts
  function sendSourceAction(action: SourceMirrorAction) {
    if (!state) return;

    socket.emit(
      "source:action",
      {
        roomCode: state.roomCode,
        actionId: createActionId(),
        action
      },
      (ack) => {
        if (!ack.ok) setError(localizeSocketError(ack.error));
      }
    );
  }
```

Return it:

```ts
    sendSourceAction
```

- [ ] **Step 4: Create `MirrorSearchView`**

Create `apps/web/src/sourceMirror/MirrorSearchView.tsx`:

```tsx
import { Search } from "lucide-react";
import { useState } from "react";
import type { SourceMirrorAction } from "@gatchi/shared";

export function MirrorSearchView(props: {
  initialQuery: string;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  const [query, setQuery] = useState(props.initialQuery);

  function submit() {
    const trimmed = query.trim();
    if (!trimmed || !props.isHost) return;
    props.onAction({ name: "search", query: trimmed });
  }

  return (
    <section className="mirror-search" aria-label="마추기 검색">
      <div className="mirror-search-bar">
        <label>
          검색어
          <input
            value={query}
            disabled={!props.isHost}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        </label>
        <button type="button" disabled={!props.isHost || !query.trim()} onClick={submit}>
          <Search size={18} />
          검색
        </button>
      </div>
      {!props.isHost ? <p className="mirror-note">방장이 퀴즈를 검색하는 중입니다.</p> : null}
    </section>
  );
}
```

- [ ] **Step 5: Create `MirrorResultsView`**

Create `apps/web/src/sourceMirror/MirrorResultsView.tsx`:

```tsx
import type { MirrorQuizResult, SourceMirrorAction } from "@gatchi/shared";

export function MirrorResultsView(props: {
  query: string;
  results: MirrorQuizResult[];
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  return (
    <section className="mirror-results" aria-label="검색 결과">
      <div className="section-heading">
        <h2>검색 결과</h2>
        <span>{props.query}</span>
      </div>
      <div className="mirror-result-grid">
        {props.results.map((result) => {
          const card = (
            <>
              {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" /> : <div className="mirror-thumb-empty" />}
              <strong>{result.title}</strong>
              {result.description ? <small>{result.description}</small> : null}
            </>
          );

          return props.isHost ? (
            <button
              className="mirror-result-card"
              type="button"
              key={result.id}
              aria-label={`${result.title} 선택`}
              onClick={() => props.onAction({ name: "selectResult", resultId: result.id, href: result.href })}
            >
              {card}
            </button>
          ) : (
            <article className="mirror-result-card read-only" key={result.id}>
              {card}
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Create setup and unsupported views**

Create `apps/web/src/sourceMirror/MirrorSetupView.tsx`:

```tsx
import { Play } from "lucide-react";
import type { MirrorQuizSettings, MirrorQuizSummary, SourceMirrorAction } from "@gatchi/shared";

export function MirrorSetupView(props: {
  quiz: MirrorQuizSummary;
  settings: MirrorQuizSettings;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  return (
    <section className="mirror-setup" aria-label="문제 설정">
      <div className="section-heading">
        <h2>{props.quiz.title}</h2>
        <span>문제 설정</span>
      </div>
      {props.quiz.thumbnailUrl ? <img className="mirror-setup-thumb" src={props.quiz.thumbnailUrl} alt="" /> : null}
      <div className="mirror-setting-row">
        <span>타이머</span>
        <div className="mirror-segmented">
          {props.settings.availableTimers.map((seconds) => (
            <button
              type="button"
              key={seconds}
              disabled={!props.isHost}
              className={props.settings.timerSeconds === seconds ? "active" : ""}
              onClick={() => props.onAction({ name: "setTimer", timerSeconds: seconds })}
            >
              {seconds}초
            </button>
          ))}
        </div>
      </div>
      <div className="mirror-setting-row">
        <span>문항 수</span>
        <div className="mirror-segmented">
          {props.settings.availableQuestionCounts.map((count) => (
            <button
              type="button"
              key={count}
              disabled={!props.isHost}
              className={props.settings.questionCount === count ? "active" : ""}
              onClick={() => props.onAction({ name: "setQuestionCount", questionCount: count })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
      <button className="primary-button" type="button" disabled={!props.isHost} onClick={() => props.onAction({ name: "startQuiz" })}>
        <Play size={18} />
        문제 시작
      </button>
    </section>
  );
}
```

Create `apps/web/src/sourceMirror/MirrorUnsupportedView.tsx`:

```tsx
import { ExternalLink, RefreshCw } from "lucide-react";
import type { SourceMirrorAction } from "@gatchi/shared";

export function MirrorUnsupportedView(props: {
  title: string;
  message: string;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  return (
    <section className="mirror-unsupported" aria-label={props.title}>
      <h2>{props.title}</h2>
      <p>{props.message}</p>
      {props.isHost ? (
        <div className="mirror-fallback-actions">
          <button type="button" onClick={() => props.onAction({ name: "refreshSource" })}>
            <RefreshCw size={18} />
            다시 읽기
          </button>
          <button type="button" onClick={() => props.onAction({ name: "focusOriginalTab" })}>
            <ExternalLink size={18} />
            원본 탭 열기
          </button>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 7: Create `SourceMirrorView`**

Create `apps/web/src/sourceMirror/SourceMirrorView.tsx`:

```tsx
import type { SourceMirrorAction, SourceMirrorState } from "@gatchi/shared";
import { QuizPanel } from "../room/QuizPanel";
import { MirrorResultsView } from "./MirrorResultsView";
import { MirrorSearchView } from "./MirrorSearchView";
import { MirrorSetupView } from "./MirrorSetupView";
import { MirrorUnsupportedView } from "./MirrorUnsupportedView";

export function SourceMirrorView(props: {
  state: SourceMirrorState;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  if (props.state.kind === "home") {
    return <MirrorSearchView initialQuery={props.state.query} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "searchResults") {
    return <MirrorResultsView query={props.state.query} results={props.state.results} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "quizDetail") {
    return <MirrorSetupView quiz={props.state.quiz} settings={props.state.settings} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "playing" || props.state.kind === "result") {
    return <QuizPanel quiz={props.state.quiz} />;
  }

  if (props.state.kind === "loading") {
    return <MirrorUnsupportedView title="원본 탭과 동기화 중" message={props.state.message ?? "잠시만 기다려 주세요."} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "unsupported") {
    return <MirrorUnsupportedView title="이 화면은 아직 읽을 수 없습니다" message={props.state.reason} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "error") {
    return <MirrorUnsupportedView title="원본 화면 오류" message={props.state.message} isHost={props.isHost} onAction={props.onAction} />;
  }

  return <MirrorUnsupportedView title="원본 탭을 연결해 주세요" message={props.state.message ?? "방장 확장 프로그램에서 마추기 아이오 탭을 연결해 주세요."} isHost={props.isHost} onAction={props.onAction} />;
}
```

- [ ] **Step 8: Run web mirror tests and typecheck**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- SourceMirrorView.test.tsx
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit web mirror components**

Run:

```powershell
git add apps/web/src/socket/useRoomSocket.ts apps/web/src/sourceMirror
git commit -m "feat: add source mirror web views"
```

---

### Task 6: Integrate Mirror UI Into Room Flow

**Files:**
- Modify: `apps/web/src/room/RoomView.tsx`
- Modify: `apps/web/src/room/RoomView.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.host.test.tsx`

- [ ] **Step 1: Update RoomView test for mirror UI**

Modify `apps/web/src/room/RoomView.test.tsx` base state to include:

```ts
  sourceMirror: {
    kind: "playing",
    url: "https://machugi.io/quiz/123/play",
    title: "Pokemon",
    lastSeenAt: "2026-06-19T00:00:00.000Z",
    quiz: {
      quizTitle: "Pokemon",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "free-text",
      questionText: "Who is this?",
      imageUrl: null,
      audioUrl: null,
      videoUrl: null,
      choices: [],
      timerSecondsRemaining: null,
      canGoNext: true,
      canGoPrevious: false,
      resultMessage: null,
      answerCandidates: []
    }
  },
```

Update render calls:

```tsx
render(
  <RoomView
    state={baseState}
    currentParticipantId="host"
    onSubmitAnswer={() => undefined}
    onSourceAction={() => undefined}
  />
);
```

- [ ] **Step 2: Run RoomView test and verify failure**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- RoomView.test.tsx
```

Expected: FAIL because `RoomView` does not accept `onSourceAction`.

- [ ] **Step 3: Integrate `SourceMirrorView` into `RoomView`**

Modify `apps/web/src/room/RoomView.tsx` imports:

```ts
import type { ChatMessagePayload, RoomState, SourceMirrorAction } from "@gatchi/shared";
import { SourceMirrorView } from "../sourceMirror/SourceMirrorView";
```

Update props:

```ts
  onSourceAction: (action: SourceMirrorAction) => void;
```

Add:

```ts
  const isHost = currentParticipant?.role === "host";
```

Replace:

```tsx
        <QuizPanel quiz={props.state.quiz} />
```

with:

```tsx
        <SourceMirrorView state={props.state.sourceMirror} isHost={Boolean(isHost)} onAction={props.onSourceAction} />
```

- [ ] **Step 4: Remove host command panel from primary App layout**

Modify `apps/web/src/App.tsx`:

Remove import:

```ts
import { HostControls } from "./host/HostControls";
```

Remove this JSX:

```tsx
              <HostControls extensionConnected={roomSocket.state.hostExtensionConnected} onCommand={roomSocket.sendHostCommand} />
```

Add `onSourceAction` to `RoomView`:

```tsx
            onSourceAction={roomSocket.sendSourceAction}
```

Keep `HostWorkspace` and `ExtensionSetup` because they show connection and setup.

- [ ] **Step 5: Update App host test**

Modify `apps/web/src/App.host.test.tsx` to assert the room contains mirror UI and not the old command panel:

```tsx
expect(screen.getByText("원본 탭을 연결해 주세요")).toBeInTheDocument();
expect(screen.queryByText("방장 컨트롤")).not.toBeInTheDocument();
```

If the current mocked `RoomState` does not include `sourceMirror`, add the disconnected state:

```ts
sourceMirror: {
  kind: "disconnected",
  url: null,
  title: null,
  lastSeenAt: null,
  message: "원본 탭을 연결해 주세요."
}
```

- [ ] **Step 6: Run web integration tests**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- RoomView.test.tsx App.host.test.tsx SourceMirrorView.test.tsx
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit room integration**

Run:

```powershell
git add apps/web/src/App.tsx apps/web/src/App.host.test.tsx apps/web/src/room/RoomView.tsx apps/web/src/room/RoomView.test.tsx
git commit -m "feat: make source mirror the room surface"
```

---

### Task 7: Styling And Korean Fallback Polish

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/sourceMirror/SourceMirrorView.test.tsx`
- Modify: `apps/web/src/room/QuizPanel.tsx`
- Modify: `apps/web/src/room/QuizPanel.test.tsx`

- [ ] **Step 1: Add visual state test for fallback actions**

Add to `apps/web/src/sourceMirror/SourceMirrorView.test.tsx`:

```tsx
it("shows Korean fallback actions for unsupported host states", () => {
  render(
    <SourceMirrorView
      isHost
      onAction={() => undefined}
      state={{
        kind: "unsupported",
        url: "https://machugi.io/unknown",
        title: "Unknown",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        reason: "원본 사이트의 현재 화면을 읽을 수 없습니다."
      }}
    />
  );

  expect(screen.getByText("이 화면은 아직 읽을 수 없습니다")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /다시 읽기/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /원본 탭 열기/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run fallback test**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- SourceMirrorView.test.tsx
```

Expected: PASS after Task 5; if it fails, fix only the rendered label mismatch.

- [ ] **Step 3: Add mirror CSS**

Append to `apps/web/src/styles.css`:

```css
.mirror-search,
.mirror-results,
.mirror-setup,
.mirror-unsupported {
  border: 1px solid var(--border-color, #d7e2f2);
  border-radius: 8px;
  background: #ffffff;
  padding: 18px;
}

.mirror-search-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.mirror-search-bar label {
  display: grid;
  gap: 6px;
  color: #22324a;
  font-weight: 700;
}

.mirror-search-bar input {
  min-height: 42px;
  border: 1px solid #bfd0e5;
  border-radius: 8px;
  padding: 0 12px;
  font: inherit;
}

.mirror-search-bar button,
.mirror-fallback-actions button,
.mirror-segmented button {
  min-height: 38px;
  border: 1px solid #bfd0e5;
  border-radius: 8px;
  background: #ffffff;
  color: #0b1730;
  font-weight: 800;
}

.mirror-search-bar button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-color: #2f66f6;
  background: #2f66f6;
  color: #ffffff;
  padding: 0 16px;
}

.mirror-note {
  margin: 12px 0 0;
  color: #607089;
}

.mirror-result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}

.mirror-result-card {
  display: grid;
  gap: 8px;
  min-height: 176px;
  border: 1px solid #d7e2f2;
  border-radius: 8px;
  background: #ffffff;
  padding: 10px;
  text-align: left;
  color: #0b1730;
}

.mirror-result-card img,
.mirror-thumb-empty {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  object-fit: cover;
  background: linear-gradient(135deg, #e8f1ff, #edf8f2);
}

.mirror-result-card strong {
  font-size: 15px;
}

.mirror-result-card small {
  color: #607089;
}

.mirror-setup {
  display: grid;
  gap: 14px;
}

.mirror-setup-thumb {
  width: 100%;
  max-height: 220px;
  border-radius: 8px;
  object-fit: cover;
}

.mirror-setting-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  align-items: center;
}

.mirror-segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mirror-segmented button.active {
  border-color: #0b1730;
  background: #0b1730;
  color: #ffffff;
}

.mirror-unsupported {
  display: grid;
  place-items: center;
  min-height: 280px;
  text-align: center;
  color: #0b1730;
}

.mirror-unsupported p {
  max-width: 520px;
  color: #607089;
}

.mirror-fallback-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.mirror-fallback-actions button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

@media (max-width: 720px) {
  .mirror-search-bar,
  .mirror-setting-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Update QuizPanel fallback copy**

Modify `apps/web/src/room/QuizPanel.tsx` fallback strings to Korean:

```ts
  const fallback = quiz.quizTitle
    ? "원본 탭에서 문제를 준비하는 중입니다."
    : "방장이 퀴즈를 선택하면 여기에 문제가 표시됩니다.";
```

- [ ] **Step 5: Run web tests and build**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- SourceMirrorView.test.tsx QuizPanel.test.tsx RoomView.test.tsx
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web build
```

Expected: PASS.

- [ ] **Step 6: Commit UI polish**

Run:

```powershell
git add apps/web/src/styles.css apps/web/src/sourceMirror/SourceMirrorView.test.tsx apps/web/src/room/QuizPanel.tsx apps/web/src/room/QuizPanel.test.tsx
git commit -m "style: polish source mirror room UI"
```

---

### Task 8: Final Verification, Review Prep, And Package

**Files:**
- No required source edits unless verification finds a concrete failure.

- [ ] **Step 1: Run full typecheck**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- typecheck
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- test
```

Expected: PASS.

- [ ] **Step 3: Run full production build**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- build
```

Expected: PASS.

- [ ] **Step 4: Build extension release zip**

Run:

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension zip
```

Expected: PASS and a zip at `apps/extension/release/gatchi-machugi-extension.zip`.

- [ ] **Step 5: Start local server for manual smoke**

Run:

```powershell
$env:PORT='3104'
Start-Process -FilePath 'npm' -ArgumentList @('exec','--yes','pnpm@9.15.0','--','start') -WorkingDirectory 'D:\DATA\Desktop\Gatchi Machugi\.worktrees\machugi-room-play' -WindowStyle Hidden
Start-Sleep -Seconds 3
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3104/health' | Select-Object -ExpandProperty StatusCode
```

Expected: `200`.

- [ ] **Step 6: Manual smoke checklist**

Verify in browser:

- Create a public room as host.
- Confirm host setup still shows extension instructions.
- Confirm the old host command panel is not the primary room UI.
- Connect the unpacked extension.
- Open `machugi.io` in a source tab.
- Confirm the room mirror moves from disconnected to home/search.
- Search for a quiz from Gatchi Machugi.
- Confirm results appear in Gatchi Machugi.
- Select a result and confirm the original tab follows it.
- Start a quiz and confirm `QuizPanel` shows the active problem.
- Join as a participant in another browser session.
- Confirm participant sees the same mirror screen and cannot control search/results/settings.
- Submit answers as host and participant.
- Confirm the extension submits to original only after all required players submit.
- Confirm result and score update.

- [ ] **Step 7: Resolve verification failures through the owning task**

If a verification command or manual smoke item fails, return to the task that owns the failing file and repeat that task's test, implementation, and commit steps. Use these mappings:

- Shared type/schema failure: return to Task 1.
- Server state or authorization failure: return to Task 2.
- Extension extraction failure: return to Task 3.
- Extension action or socket bridge failure: return to Task 4.
- Web mirror component failure: return to Task 5.
- Room integration or visual fallback failure: return to Task 6 or Task 7.

Expected: each returned task ends with its own focused commit. Do not create a broad verification commit.

- [ ] **Step 8: Push branch**

Run:

```powershell
git push origin feature/machugi-room-play
```

Expected: branch updates on GitHub.

- [ ] **Step 9: Prepare final review**

After implementation and verification, request one whole-change review focused on:

- stale extension socket rejection,
- host-only source action authorization,
- fairness lock during playing/result state,
- DOM action failure reporting,
- participant read-only UI,
- no permanent quiz-content persistence,
- and extension release package viability.

Do the review after the implementation is complete, matching the requested workflow.

---

## Self-Review

- Spec coverage: The plan covers shared contracts, server relay, extension extraction/actions, web mirror UI, Korean fallbacks, fairness preservation through existing `QuizState` flow, and final packaging.
- Scope: The plan stays on the A-slice and avoids a full `machugi.io` clone.
- Type consistency: `SourceMirrorState`, `SourceMirrorAction`, `SourceMirrorActionPayload`, and `SourceMirrorActionFailurePayload` are introduced in Task 1 and reused consistently by server, extension, and web tasks.
- Verification: Each task has focused tests, and Task 8 runs full typecheck, test, build, extension zip, and manual smoke.
