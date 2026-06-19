# Iframe Host Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the host operate `machugi.io` inside the room screen while the extension prevents original submission and next-question navigation until every required player, including the host, has submitted in Gatchi Machugi.

**Architecture:** The web app renders a host-only `machugi.io` iframe and keeps participants on the mirrored quiz UI. The extension injects into the web app and every `machugi.io` frame, binds the visible machugi frame to the host room, locks original controls during active questions, and submits the host answer to the original site only after the server authorizes it. The server remains the source of truth for room membership, submissions, scoring, and original-result reveal.

**Tech Stack:** TypeScript, React, Socket.io, Chrome MV3 extension APIs, Vite, Vitest, jsdom.

---

## File Structure

- `packages/shared/src/models.ts`: Add public fair-play state to `RoomState`.
- `packages/shared/src/events.ts`: Add original-submission Socket.io event payloads and extension-only result payloads.
- `packages/shared/src/fairPlay.ts`: New shared helpers for question keys and all-submitted checks.
- `packages/shared/src/fairPlay.test.ts`: Unit tests for the helpers.
- `packages/shared/src/extensionBridge.ts`: Add web-app-to-extension status message types for iframe binding and setup feedback.
- `packages/shared/src/index.ts`: Export the new helper module.
- `apps/server/src/domain/roomService.ts`: Track fair-play state, required participants, original-submit authorization, and original result application.
- `apps/server/src/domain/roomService.test.ts`: Add server-domain tests for lock transitions and reveal.
- `apps/server/src/socket/createSocketServer.ts`: Distinguish host web sockets from host extension sockets and route original-submit payloads only to the paired extension socket.
- `apps/server/src/socket/answerEvents.test.ts`: Cover submit-to-original authorization after all required submissions.
- `apps/server/src/socket/operationEvents.test.ts`: Cover extension-only original-result ingestion and rejection of web-client spoofing.
- `apps/web/src/host/HostWorkspace.tsx`: New host workspace with iframe, setup/status, submission count, and lock state.
- `apps/web/src/host/HostWorkspace.test.tsx`: Rendering tests for host iframe and Korean status copy.
- `apps/web/src/App.tsx`: Replace the old `HostControls` primary flow with `HostWorkspace`, keep pairing settings save flow.
- `apps/web/src/room/AnswerPanel.tsx`: Keep host and participants submitting through Gatchi Machugi, with clearer disabled/submitted states.
- `apps/web/src/room/RoomView.tsx`: Pass submission state into `AnswerPanel`.
- `apps/web/src/styles.css`: Layout for iframe workspace and compact status rail.
- `apps/extension/manifest.json`: Set `all_frames: true` for machugi content script and normalize Korean metadata.
- `apps/extension/src/messages.ts`: Add frame-ready, fair-play-state, original-submit, and original-result content message constants.
- `apps/extension/src/background.ts`: Replace active-tab-only pairing with tab/frame routing and extension-only original-submit handling.
- `apps/extension/src/appBridge.ts`: Auto-save pairing settings, trigger background pairing from the web app tab, and forward extension status back to the page.
- `apps/extension/src/contentScript.ts`: Report frame readiness, install lock controller, handle fair-play and original-submit messages, and send extracted result state.
- `apps/extension/src/machugi/commands.ts`: Add original answer fill-and-submit command.
- `apps/extension/src/machugi/commands.test.ts`: Test original text answer fill and submit button selection.
- `apps/extension/src/machugi/lock.ts`: New content-script lock controller for click/keyboard prevention and overlay rendering.
- `apps/extension/src/machugi/lock.test.ts`: Unit tests for submit/next blocking and unlock behavior.
- `apps/extension/src/socketClient.ts`: Listen for `original:submit-allowed` and `room:state`; send `original:result`.
- `apps/extension/src/socketClient.test.ts`: Test socket client event wiring.

---

### Task 1: Shared Fair-Play Protocol

**Files:**
- Create: `packages/shared/src/fairPlay.ts`
- Create: `packages/shared/src/fairPlay.test.ts`
- Modify: `packages/shared/src/models.ts`
- Modify: `packages/shared/src/events.ts`
- Modify: `packages/shared/src/extensionBridge.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing helper tests**

Add `packages/shared/src/fairPlay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allRequiredSubmitted, createQuestionKey, requiredParticipantIds, submittedParticipantIds } from "./fairPlay.js";
import type { Participant, SubmissionStatus } from "./models.js";

const participants: Participant[] = [
  { id: "host", nickname: "Host", role: "host", connected: true, score: 0 },
  { id: "mina", nickname: "Mina", role: "player", connected: true, score: 0 },
  { id: "off", nickname: "Offline", role: "player", connected: false, score: 0 }
];

describe("fairPlay helpers", () => {
  it("creates a stable key from the visible question identity", () => {
    const first = createQuestionKey({
      quizTitle: "Quiz",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "image",
      questionText: null,
      imageUrl: "https://example.com/a.png",
      audioUrl: null,
      videoUrl: null,
      choices: [],
      timerSecondsRemaining: null,
      canGoNext: false,
      canGoPrevious: false,
      resultMessage: null,
      answerCandidates: []
    });

    const second = createQuestionKey({
      quizTitle: "Quiz",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "image",
      questionText: null,
      imageUrl: "https://example.com/a.png",
      audioUrl: null,
      videoUrl: null,
      choices: [],
      timerSecondsRemaining: 18,
      canGoNext: true,
      canGoPrevious: false,
      resultMessage: "wrong",
      answerCandidates: ["answer"]
    });

    expect(first).toBe(second);
  });

  it("requires only connected participants and recognizes all submitted", () => {
    const required = requiredParticipantIds(participants);
    const statuses: SubmissionStatus[] = [
      { participantId: "host", submitted: true, skipped: false },
      { participantId: "mina", submitted: true, skipped: false }
    ];

    expect(required).toEqual(["host", "mina"]);
    expect(submittedParticipantIds(statuses)).toEqual(["host", "mina"]);
    expect(allRequiredSubmitted(required, statuses)).toBe(true);
    expect(allRequiredSubmitted(required, statuses.slice(0, 1))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the shared helper test to verify it fails**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared test -- fairPlay.test.ts
```

Expected: FAIL because `packages/shared/src/fairPlay.ts` does not exist.

- [ ] **Step 3: Add fair-play model types**

In `packages/shared/src/models.ts`, add these types near the existing room model types:

```ts
export type OriginalSubmitStatus = "idle" | "locked" | "ready" | "submitting" | "result-opened" | "unsupported";

export interface FairPlayState {
  questionKey: string | null;
  requiredParticipantIds: string[];
  submittedParticipantIds: string[];
  allRequiredSubmitted: boolean;
  originalSubmitStatus: OriginalSubmitStatus;
  lockReason: string | null;
}
```

Then add this field to `RoomState`:

```ts
fairPlay: FairPlayState;
```

- [ ] **Step 4: Add shared helper implementation**

Create `packages/shared/src/fairPlay.ts`:

```ts
import type { Participant, QuizState, SubmissionStatus } from "./models.js";

export function createQuestionKey(quiz: QuizState): string | null {
  const visibleIdentity = [
    quiz.quizTitle,
    quiz.questionIndex,
    quiz.totalQuestions,
    quiz.questionType,
    quiz.questionText,
    quiz.imageUrl,
    quiz.audioUrl,
    quiz.videoUrl,
    quiz.choices.map((choice) => `${choice.id}:${choice.label}`).join("|")
  ];

  if (visibleIdentity.every((value) => value === null || value === "")) {
    return null;
  }

  return JSON.stringify(visibleIdentity);
}

export function requiredParticipantIds(participants: Participant[]): string[] {
  return participants.filter((participant) => participant.connected).map((participant) => participant.id);
}

export function submittedParticipantIds(submissions: SubmissionStatus[]): string[] {
  return submissions
    .filter((submission) => submission.submitted || submission.skipped)
    .map((submission) => submission.participantId);
}

export function allRequiredSubmitted(requiredIds: string[], submissions: SubmissionStatus[]): boolean {
  const submitted = new Set(submittedParticipantIds(submissions));
  return requiredIds.length > 0 && requiredIds.every((participantId) => submitted.has(participantId));
}
```

- [ ] **Step 5: Export the helper**

In `packages/shared/src/index.ts`, add:

```ts
export * from "./fairPlay.js";
```

- [ ] **Step 6: Add original-submission event types**

In `packages/shared/src/events.ts`, extend `ServerToClientEvents`:

```ts
"original:submit-allowed": (payload: OriginalSubmitAllowedPayload) => void;
```

Extend `ClientToServerEvents`:

```ts
"original:request-submit": (payload: OriginalSubmitRequestPayload, ack: Ack<void>) => void;
"original:result": (payload: OriginalResultPayload, ack: Ack<void>) => void;
```

Add these payloads after `ExtensionStatePayload`:

```ts
export interface OriginalSubmitAllowedPayload {
  roomCode: string;
  questionKey: string;
  hostRawAnswer: string;
}

export interface OriginalSubmitRequestPayload {
  roomCode: string;
  questionKey: string;
}

export interface OriginalResultPayload {
  roomCode: string;
  questionKey: string;
  quiz: QuizState;
}
```

- [ ] **Step 7: Add extension bridge status types**

In `packages/shared/src/extensionBridge.ts`, add:

```ts
export const APP_EXTENSION_STATUS_MESSAGE = "gatchi:extension-status";

export interface AppExtensionStatusPayload {
  status: "settings-saved" | "paired" | "machugi-frame-ready" | "machugi-frame-missing" | "error";
  roomCode?: string;
  message?: string;
}
```

- [ ] **Step 8: Run shared tests and typecheck**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared test
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/shared typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit shared protocol**

Run:

```bash
git add packages/shared/src/models.ts packages/shared/src/events.ts packages/shared/src/extensionBridge.ts packages/shared/src/index.ts packages/shared/src/fairPlay.ts packages/shared/src/fairPlay.test.ts
git commit -m "feat: add fair play room protocol"
```

---

### Task 2: Server Fair-Play State Transitions

**Files:**
- Modify: `apps/server/src/domain/roomService.ts`
- Modify: `apps/server/src/domain/roomService.test.ts`

- [ ] **Step 1: Write failing room-service tests**

Append these tests inside `describe("RoomService", () => { ... })` in `apps/server/src/domain/roomService.test.ts`:

```ts
it("locks original submission for a new active question until required players submit", async () => {
  const service = new RoomService();
  const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
  const player = service.joinParticipant({ roomCode, nickname: "Mina" });

  const locked = service.updateQuizState({
    roomCode,
    quiz: {
      ...service.getState(roomCode).quiz,
      questionIndex: 1,
      questionText: "Name the game",
      questionType: "free-text"
    }
  });

  expect(locked.fairPlay).toMatchObject({
    requiredParticipantIds: [hostParticipantId, player.participant.id],
    submittedParticipantIds: [],
    allRequiredSubmitted: false,
    originalSubmitStatus: "locked"
  });

  service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "blue archive" });
  const ready = service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });

  expect(ready.fairPlay).toMatchObject({
    submittedParticipantIds: [hostParticipantId, player.participant.id],
    allRequiredSubmitted: true,
    originalSubmitStatus: "ready"
  });
});

it("authorizes original submission with the host raw answer only after everyone submits", async () => {
  const service = new RoomService();
  const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
  const player = service.joinParticipant({ roomCode, nickname: "Mina" });

  service.updateQuizState({
    roomCode,
    quiz: {
      ...service.getState(roomCode).quiz,
      questionIndex: 1,
      questionText: "Name the game",
      questionType: "free-text"
    }
  });
  service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "blue archive" });

  expect(() => service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" })).toThrow(
    "Original submission is still locked"
  );

  service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
  const allowed = service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" });

  expect(allowed).toEqual({
    roomCode,
    questionKey: service.getState(roomCode).fairPlay.questionKey,
    hostRawAnswer: "blue archive"
  });
  expect(service.getState(roomCode).fairPlay.originalSubmitStatus).toBe("submitting");
});

it("applies original result, reveals answers, and unlocks next after original submission", async () => {
  const service = new RoomService();
  const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
  const player = service.joinParticipant({ roomCode, nickname: "Mina" });

  service.updateQuizState({
    roomCode,
    quiz: {
      ...service.getState(roomCode).quiz,
      questionIndex: 1,
      questionText: "Name the game",
      questionType: "free-text"
    }
  });
  service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "blue archive" });
  service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
  const questionKey = service.getState(roomCode).fairPlay.questionKey ?? "";
  service.requestOriginalSubmission({ roomCode, questionKey });

  const revealed = service.applyOriginalResult({
    roomCode,
    questionKey,
    quiz: {
      ...service.getState(roomCode).quiz,
      resultMessage: "correct",
      answerCandidates: ["blue archive"],
      canGoNext: true
    }
  });

  expect(revealed.phase).toBe("revealed");
  expect(revealed.fairPlay.originalSubmitStatus).toBe("result-opened");
  expect(revealed.revealedSubmissions.find((submission) => submission.participantId === hostParticipantId)?.correct).toBe(true);
  expect(revealed.revealedSubmissions.find((submission) => submission.participantId === player.participant.id)?.correct).toBe(false);
});
```

- [ ] **Step 2: Run room-service tests to verify they fail**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- roomService.test.ts
```

Expected: FAIL because `fairPlay`, `requestOriginalSubmission`, and `applyOriginalResult` are not implemented.

- [ ] **Step 3: Import fair-play helpers and event payload type**

In `apps/server/src/domain/roomService.ts`, update imports from `@gatchi/shared`:

```ts
import {
  allRequiredSubmitted,
  createQuestionKey,
  requiredParticipantIds,
  scoreSubmissions,
  submittedParticipantIds,
  type ChatMessagePayload,
  type OriginalSubmitAllowedPayload,
  type Participant,
  type QuizState,
  type RevealedSubmission,
  type RoomSettings,
  type RoomState,
  type RoomVisibility
} from "@gatchi/shared";
```

- [ ] **Step 4: Initialize fair-play state**

In `emptyState`, add:

```ts
fairPlay: {
  questionKey: null,
  requiredParticipantIds: [],
  submittedParticipantIds: [],
  allRequiredSubmitted: false,
  originalSubmitStatus: "idle",
  lockReason: null
},
```

- [ ] **Step 5: Reset fair-play on each new question**

Replace `resetRound(room)` with:

```ts
private resetRound(room: StoredRoom): void {
  room.aliases = [];
  room.rawSubmissions.clear();
  room.state.submissions = [];
  room.state.revealedSubmissions = [];
  const questionKey = createQuestionKey(room.state.quiz);
  const requiredIds = requiredParticipantIds(room.state.participants);
  room.state.fairPlay = {
    questionKey,
    requiredParticipantIds: requiredIds,
    submittedParticipantIds: [],
    allRequiredSubmitted: false,
    originalSubmitStatus: questionKey ? "locked" : "idle",
    lockReason: questionKey ? "모든 참가자가 제출해야 원본 정답 제출이 가능합니다." : null
  };
}
```

- [ ] **Step 6: Refresh fair-play after submissions**

Add this private method:

```ts
private refreshFairPlaySubmissionState(room: StoredRoom): void {
  const submittedIds = submittedParticipantIds(room.state.submissions);
  const complete = allRequiredSubmitted(room.state.fairPlay.requiredParticipantIds, room.state.submissions);
  room.state.fairPlay.submittedParticipantIds = submittedIds;
  room.state.fairPlay.allRequiredSubmitted = complete;

  if (room.state.fairPlay.originalSubmitStatus === "locked" && complete) {
    room.state.fairPlay.originalSubmitStatus = "ready";
    room.state.fairPlay.lockReason = null;
  }
}
```

At the end of `submitAnswer`, after `room.state.submissions = this.publicSubmissionStatuses(room);`, add:

```ts
this.refreshFairPlaySubmissionState(room);
```

- [ ] **Step 7: Add original submission authorization**

Add this public method to `RoomService`:

```ts
requestOriginalSubmission(input: { roomCode: string; questionKey: string }): OriginalSubmitAllowedPayload {
  const room = this.requireRoom(input.roomCode);

  if (!room.state.fairPlay.questionKey || input.questionKey !== room.state.fairPlay.questionKey) {
    throw new Error("Question changed before original submission");
  }

  if (room.state.fairPlay.originalSubmitStatus !== "ready") {
    throw new Error("Original submission is still locked");
  }

  const hostSubmission = room.rawSubmissions.get(room.hostParticipantId);
  if (!hostSubmission || hostSubmission.skipped) {
    throw new Error("Host answer is required before original submission");
  }

  room.state.fairPlay.originalSubmitStatus = "submitting";

  return {
    roomCode: input.roomCode,
    questionKey: input.questionKey,
    hostRawAnswer: hostSubmission.rawAnswer
  };
}
```

- [ ] **Step 8: Add original result application**

Add this public method to `RoomService`:

```ts
applyOriginalResult(input: { roomCode: string; questionKey: string; quiz: QuizState }): RoomState {
  const room = this.requireRoom(input.roomCode);

  if (!room.state.fairPlay.questionKey || input.questionKey !== room.state.fairPlay.questionKey) {
    throw new Error("Question changed before original result");
  }

  if (room.state.fairPlay.originalSubmitStatus !== "submitting" && room.state.fairPlay.originalSubmitStatus !== "ready") {
    throw new Error("Original submission has not been authorized");
  }

  room.state.quiz = input.quiz;
  room.state.fairPlay.originalSubmitStatus = "result-opened";
  room.state.fairPlay.lockReason = null;

  return this.revealAnswers({ roomCode: input.roomCode, skippedParticipantIds: [] });
}
```

- [ ] **Step 9: Run room-service tests**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- roomService.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit server domain state**

Run:

```bash
git add apps/server/src/domain/roomService.ts apps/server/src/domain/roomService.test.ts
git commit -m "feat: enforce fair play room state"
```

---

### Task 3: Socket Events For Extension-Only Original Submission

**Files:**
- Modify: `apps/server/src/socket/createSocketServer.ts`
- Modify: `apps/server/src/socket/answerEvents.test.ts`
- Modify: `apps/server/src/socket/operationEvents.test.ts`

- [ ] **Step 1: Write failing socket tests for original-submit routing**

Add this test in `apps/server/src/socket/answerEvents.test.ts`:

```ts
it("emits original submit only to the paired extension after all required submissions", async () => {
  const roomService = new RoomService();
  const app = createApp({ roomService });
  const server = createServer(app);
  createSocketServer(server, { roomService });
  servers.push(server);

  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

  const hostWebSocket = await connectClient(baseUrl);
  const participantSocket = await connectClient(baseUrl);
  const extensionSocket = await connectClient(baseUrl);
  sockets.push(hostWebSocket, participantSocket, extensionSocket);

  const hostWebJoin = await emitJoin(hostWebSocket, {
    roomCode: created.data.roomCode,
    nickname: "Host",
    participantId: created.data.hostParticipantId,
    participantCode: created.data.hostCode
  });
  const participantJoin = await emitJoin(participantSocket, {
    roomCode: created.data.roomCode,
    nickname: "Mina"
  });
  const extensionPair = await emitHostPair(extensionSocket, {
    roomCode: created.data.roomCode,
    hostCode: created.data.hostCode
  });

  expect(hostWebJoin.ok).toBe(true);
  expect(participantJoin.ok).toBe(true);
  expect(extensionPair.ok).toBe(true);
  if (!hostWebJoin.ok || !participantJoin.ok || !extensionPair.ok) throw new Error("setup failed");

  let leakedToHostWeb = false;
  hostWebSocket.once("original:submit-allowed", () => {
    leakedToHostWeb = true;
  });
  const originalSubmitPromise = waitForEvent(extensionSocket, "original:submit-allowed");

  const stateAck = await emitExtensionState(extensionSocket, {
    roomCode: created.data.roomCode,
    quiz: {
      quizTitle: "Quiz",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "free-text",
      questionText: "Name the game",
      imageUrl: null,
      audioUrl: null,
      videoUrl: null,
      choices: [],
      timerSecondsRemaining: null,
      canGoNext: false,
      canGoPrevious: false,
      resultMessage: null,
      answerCandidates: []
    }
  });
  expect(stateAck).toEqual({ ok: true, data: undefined });

  const hostSubmitAck = await emitSubmitAnswer(hostWebSocket, {
    roomCode: created.data.roomCode,
    participantId: created.data.hostParticipantId,
    rawAnswer: "blue archive"
  });
  const playerSubmitAck = await emitSubmitAnswer(participantSocket, {
    roomCode: created.data.roomCode,
    participantId: participantJoin.data.participantId,
    rawAnswer: "wrong"
  });
  expect(hostSubmitAck).toEqual({ ok: true, data: undefined });
  expect(playerSubmitAck).toEqual({ ok: true, data: undefined });

  await expect(originalSubmitPromise).resolves.toMatchObject({
    roomCode: created.data.roomCode,
    hostRawAnswer: "blue archive"
  });
  expect(leakedToHostWeb).toBe(false);
});
```

- [ ] **Step 2: Write failing spoofing test**

In `apps/server/src/socket/operationEvents.test.ts`, first extend the shared imports:

```ts
import type {
  ChatMessagePayload,
  ClientToServerEvents,
  JoinRoomPayload,
  OriginalResultPayload,
  SendChatPayload,
  ServerToClientEvents
} from "@gatchi/shared";
```

Add this helper near `emitChat`:

```ts
function emitOriginalResult(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: OriginalResultPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("original:result", payload, ((response: unknown) => resolve(response as never)) as never);
  });
}
```

Then add this test:

```ts
it("rejects original result from a host web socket", async () => {
  const roomService = new RoomService();
  const app = createApp({ roomService });
  const server = createServer(app);
  createSocketServer(server, { roomService });
  servers.push(server);

  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const room = await createRoom(baseUrl);
  const hostWebSocket = await connectClient(baseUrl);
  sockets.push(hostWebSocket);

  const joined = await emitJoin(hostWebSocket, {
    roomCode: room.roomCode,
    nickname: "Host",
    participantId: room.hostParticipantId,
    participantCode: room.hostCode
  });
  expect(joined.ok).toBe(true);
  if (!joined.ok) throw new Error(joined.error);

  const response = await emitOriginalResult(hostWebSocket, {
    roomCode: room.roomCode,
    questionKey: "not-authorized",
    quiz: {
      quizTitle: "Quiz",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "free-text",
      questionText: "Name the game",
      imageUrl: null,
      audioUrl: null,
      videoUrl: null,
      choices: [],
      timerSecondsRemaining: null,
      canGoNext: true,
      canGoPrevious: false,
      resultMessage: "correct",
      answerCandidates: ["blue archive"]
    }
  });

  expect(response).toEqual({ ok: false, error: "Host extension authorization required" });
});
```

- [ ] **Step 3: Run socket tests to verify they fail**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- answerEvents.test.ts operationEvents.test.ts
```

Expected: FAIL because the new events and extension-only session kind are missing.

- [ ] **Step 4: Add extension session tracking**

In `apps/server/src/socket/createSocketServer.ts`, change `SocketSession`:

```ts
interface SocketSession {
  roomCode?: string;
  participantId?: string;
  role?: "host" | "participant";
  clientKind?: "web" | "extension";
}
```

Near `const io = new Server(...)`, add:

```ts
const hostExtensionSocketIds = new Map<string, string>();
```

Set `session.clientKind = "web"` in `"room:join"` after the role assignment.

Set `session.clientKind = "extension"` and `hostExtensionSocketIds.set(parsed.data.roomCode, socket.id)` in `"host:pair"`.

- [ ] **Step 5: Add extension-only guard**

Add:

```ts
function requireHostExtensionSession(session: SocketSession, roomCode: string) {
  requireHostSession(session, roomCode);
  if (session.clientKind !== "extension") {
    throw new Error("Host extension authorization required");
  }
}
```

- [ ] **Step 6: Add schemas and imports**

Import payload types:

```ts
OriginalResultPayload,
OriginalSubmitRequestPayload
```

Add schemas:

```ts
const originalSubmitRequestSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  questionKey: z.string().trim().min(1)
});

const originalResultSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  questionKey: z.string().trim().min(1),
  quiz: z.custom<OriginalResultPayload["quiz"]>((value) => typeof value === "object" && value !== null)
});
```

- [ ] **Step 7: Emit original-submit allowed after answer submissions**

Add helper inside `createSocketServer`:

```ts
function emitOriginalSubmitIfReady(roomCode: string, state: RoomState) {
  if (state.fairPlay.originalSubmitStatus !== "ready" || !state.fairPlay.questionKey) return;
  const extensionSocketId = hostExtensionSocketIds.get(roomCode);
  if (!extensionSocketId) return;

  try {
    const payload = roomService.requestOriginalSubmission({
      roomCode,
      questionKey: state.fairPlay.questionKey
    });
    io.to(extensionSocketId).emit("original:submit-allowed", payload);
    io.to(roomCode).emit("room:state", roomService.getState(roomCode));
  } catch {
    return;
  }
}
```

In `"answer:submit"`, after `io.to(parsed.data.roomCode).emit("room:state", state);`, add:

```ts
emitOriginalSubmitIfReady(parsed.data.roomCode, state);
```

- [ ] **Step 8: Add manual original-submit request event**

Add socket handler:

```ts
socket.on("original:request-submit", (payload: OriginalSubmitRequestPayload, ack: Ack<void>) => {
  const parsed = originalSubmitRequestSchema.safeParse(payload);
  if (!parsed.success) {
    ackError(ack, "Invalid original submit payload");
    return;
  }

  try {
    requireHostExtensionSession(session, parsed.data.roomCode);
    const allowed = roomService.requestOriginalSubmission(parsed.data);
    socket.emit("original:submit-allowed", allowed);
    io.to(parsed.data.roomCode).emit("room:state", roomService.getState(parsed.data.roomCode));
    ack({ ok: true, data: undefined });
  } catch (error) {
    ackError(ack, error instanceof Error ? error.message : "Original submit request failed");
  }
});
```

- [ ] **Step 9: Add original-result event**

Add socket handler:

```ts
socket.on("original:result", (payload: OriginalResultPayload, ack: Ack<void>) => {
  const parsed = originalResultSchema.safeParse(payload);
  if (!parsed.success) {
    ackError(ack, "Invalid original result payload");
    return;
  }

  try {
    requireHostExtensionSession(session, parsed.data.roomCode);
    const state = roomService.applyOriginalResult(parsed.data);
    io.to(parsed.data.roomCode).emit("answer:revealed", state.revealedSubmissions);
    io.to(parsed.data.roomCode).emit("room:state", state);
    ack({ ok: true, data: undefined });
  } catch (error) {
    ackError(ack, error instanceof Error ? error.message : "Original result failed");
  }
});
```

- [ ] **Step 10: Clean up extension socket map on disconnect**

At the start of `"disconnect"`, before host expiry logic:

```ts
if (session.clientKind === "extension" && session.roomCode) {
  hostExtensionSocketIds.delete(session.roomCode);
}
```

Keep existing host-disconnect behavior for now because current MVP expires when host authority disconnects. If this makes closing only the extension expire the room too aggressively during browser testing, adjust in a separate commit by expiring only when the host web participant disconnects.

- [ ] **Step 11: Run server socket tests**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/server test -- answerEvents.test.ts operationEvents.test.ts socketServer.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit socket routing**

Run:

```bash
git add apps/server/src/socket/createSocketServer.ts apps/server/src/socket/answerEvents.test.ts apps/server/src/socket/operationEvents.test.ts
git commit -m "feat: route original submission through host extension"
```

---

### Task 4: Host Iframe Workspace In The Web App

**Files:**
- Create: `apps/web/src/host/HostWorkspace.tsx`
- Create: `apps/web/src/host/HostWorkspace.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/room/AnswerPanel.tsx`
- Modify: `apps/web/src/room/RoomView.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write failing HostWorkspace tests**

Create `apps/web/src/host/HostWorkspace.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RoomState } from "@gatchi/shared";
import { HostWorkspace } from "./HostWorkspace";

function state(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: "ABC123",
    phase: "playing",
    settings: { title: "마추기 방", visibility: "public", submissionVisibility: "status-only", timerSeconds: null },
    participants: [
      { id: "host", nickname: "상범", role: "host", connected: true, score: 0 },
      { id: "p1", nickname: "민아", role: "player", connected: true, score: 0 }
    ],
    quiz: {
      quizTitle: "테스트 퀴즈",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "free-text",
      questionText: "문제",
      imageUrl: null,
      audioUrl: null,
      videoUrl: null,
      choices: [],
      timerSecondsRemaining: null,
      canGoNext: false,
      canGoPrevious: false,
      resultMessage: null,
      answerCandidates: []
    },
    submissions: [{ participantId: "host", submitted: true, skipped: false }],
    revealedSubmissions: [],
    hostExtensionConnected: true,
    chatMessageCount: 0,
    fairPlay: {
      questionKey: "q1",
      requiredParticipantIds: ["host", "p1"],
      submittedParticipantIds: ["host"],
      allRequiredSubmitted: false,
      originalSubmitStatus: "locked",
      lockReason: "모든 참가자가 제출해야 원본 정답 제출이 가능합니다."
    },
    ...overrides
  };
}

describe("HostWorkspace", () => {
  it("renders machugi iframe and lock status for host", () => {
    render(
      <HostWorkspace
        state={state()}
        extensionReleaseUrl="https://github.com/csb1004/gatchi-machugi/releases"
        extensionSyncLabel="확장 프로그램 연결됨"
        onResendPairing={vi.fn()}
      />
    );

    expect(screen.getByTitle("마추기아이오 원본 화면")).toHaveAttribute("src", "https://machugi.io/");
    expect(screen.getByText("1 / 2명 제출")).toBeInTheDocument();
    expect(screen.getByText("원본 제출 잠금")).toBeInTheDocument();
  });

  it("shows setup action when extension is disconnected", () => {
    render(
      <HostWorkspace
        state={state({ hostExtensionConnected: false })}
        extensionReleaseUrl="https://github.com/csb1004/gatchi-machugi/releases"
        extensionSyncLabel="확장 설치 후 다시 저장하세요"
        onResendPairing={vi.fn()}
      />
    );

    expect(screen.getByText("확장 프로그램 연결 필요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "확장 프로그램 다운로드" })).toHaveAttribute(
      "href",
      "https://github.com/csb1004/gatchi-machugi/releases"
    );
  });
});
```

- [ ] **Step 2: Run web test to verify it fails**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- HostWorkspace.test.tsx
```

Expected: FAIL because `HostWorkspace` does not exist.

- [ ] **Step 3: Implement HostWorkspace**

Create `apps/web/src/host/HostWorkspace.tsx`:

```tsx
import { Copy, Download, Link2, ShieldCheck } from "lucide-react";
import type { RoomState } from "@gatchi/shared";

function lockLabel(status: RoomState["fairPlay"]["originalSubmitStatus"]) {
  const labels: Record<RoomState["fairPlay"]["originalSubmitStatus"], string> = {
    idle: "대기 중",
    locked: "원본 제출 잠금",
    ready: "원본 제출 가능",
    submitting: "원본 제출 중",
    "result-opened": "결과 확인 완료",
    unsupported: "지원되지 않는 문제"
  };
  return labels[status];
}

export function HostWorkspace({
  state,
  extensionReleaseUrl,
  extensionSyncLabel,
  onResendPairing
}: {
  state: RoomState;
  extensionReleaseUrl: string;
  extensionSyncLabel: string;
  onResendPairing: () => void;
}) {
  const submittedCount = state.fairPlay.submittedParticipantIds.length;
  const requiredCount = state.fairPlay.requiredParticipantIds.length || state.participants.filter((participant) => participant.connected).length;

  return (
    <section className="host-workspace" aria-label="방장 진행 화면">
      <div className="host-workspace-bar">
        <div>
          <p className="eyebrow">{state.roomCode}</p>
          <h2>방장 화면</h2>
        </div>
        <div className="host-workspace-status">
          <span className={state.hostExtensionConnected ? "host-badge online" : "host-badge"}>
            <Link2 size={15} />
            {state.hostExtensionConnected ? "확장 연결됨" : "확장 프로그램 연결 필요"}
          </span>
          <span className="host-badge">
            <ShieldCheck size={15} />
            {lockLabel(state.fairPlay.originalSubmitStatus)}
          </span>
          <strong>{submittedCount} / {requiredCount}명 제출</strong>
        </div>
      </div>

      <div className="host-frame-shell">
        <iframe
          title="마추기아이오 원본 화면"
          src="https://machugi.io/"
          allow="autoplay; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <div className="host-workspace-footer">
        <span>{state.fairPlay.lockReason ?? extensionSyncLabel}</span>
        <button type="button" onClick={onResendPairing}>
          <Copy size={16} />
          확장 프로그램에 저장
        </button>
        {!state.hostExtensionConnected ? (
          <a className="setup-link" href={extensionReleaseUrl} target="_blank" rel="noreferrer">
            <Download size={16} />
            확장 프로그램 다운로드
          </a>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Replace old host controls in App**

In `apps/web/src/App.tsx`:

Remove:

```ts
import { HostControls } from "./host/HostControls";
```

Add:

```ts
import { HostWorkspace } from "./host/HostWorkspace";
```

In the host room branch, replace `<HostControls ... />` and the duplicate host code panel with:

```tsx
<HostWorkspace
  state={roomSocket.state}
  extensionReleaseUrl={extensionReleaseUrl}
  extensionSyncLabel={extensionSyncLabel()}
  onResendPairing={() => {
    if (createdRoom) sendPairingSettingsToExtension(createdRoom);
  }}
/>
<ExtensionSetup releaseUrl={extensionReleaseUrl} />
```

Keep `ExtensionSetup` as the fallback install guide.

- [ ] **Step 5: Keep host submitting through Gatchi Machugi**

In `apps/web/src/room/AnswerPanel.tsx`, add a `submitted` prop:

```tsx
submitted?: boolean;
```

Change:

```ts
const canSubmit = !disabled && answer.trim().length > 0;
```

to:

```ts
const canSubmit = !disabled && !submitted && answer.trim().length > 0;
```

Change the button label to:

```tsx
{submitted ? "제출 완료" : "제출"}
```

In `apps/web/src/room/RoomView.tsx`, compute:

```ts
const currentSubmission = props.state.submissions.find((submission) => submission.participantId === props.currentParticipantId);
```

Pass:

```tsx
submitted={Boolean(currentSubmission)}
```

to `AnswerPanel`.

- [ ] **Step 6: Add host workspace CSS**

In `apps/web/src/styles.css`, add:

```css
.host-workspace {
  display: grid;
  gap: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  padding: 12px;
}

.host-workspace-bar,
.host-workspace-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.host-workspace-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.host-frame-shell {
  min-height: 640px;
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
}

.host-frame-shell iframe {
  width: 100%;
  height: min(72vh, 820px);
  min-height: 640px;
  border: 0;
  background: #ffffff;
}

.host-workspace-footer a,
.host-workspace-footer button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
```

- [ ] **Step 7: Run web tests**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web test -- HostWorkspace.test.tsx RoomView.test.tsx App.test.tsx
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit web host workspace**

Run:

```bash
git add apps/web/src/host/HostWorkspace.tsx apps/web/src/host/HostWorkspace.test.tsx apps/web/src/App.tsx apps/web/src/room/AnswerPanel.tsx apps/web/src/room/RoomView.tsx apps/web/src/styles.css
git commit -m "feat: add host iframe workspace"
```

---

### Task 5: Extension Frame-Aware Pairing

**Files:**
- Modify: `apps/extension/manifest.json`
- Modify: `apps/extension/src/messages.ts`
- Modify: `apps/extension/src/background.ts`
- Modify: `apps/extension/src/appBridge.ts`
- Modify: `apps/extension/src/socketClient.ts`
- Modify: `apps/extension/src/socketClient.test.ts`

- [ ] **Step 1: Write failing socket-client event test**

In `apps/extension/src/socketClient.test.ts`, change the import to:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildPairPayload, MachugiSocketClient, normalizeServerUrl } from "./socketClient.js";
```

Then add:

```ts
it("exposes original submission methods that require a connected socket", async () => {
  const client = new MachugiSocketClient();
  expect(() => client.onOriginalSubmitAllowed(vi.fn())).toThrow("소켓 클라이언트가 연결되지 않았습니다.");
  await expect(
    client.sendOriginalResult({
      roomCode: "ABC123",
      questionKey: "q1",
      quiz: {
        quizTitle: "Quiz",
        questionIndex: 1,
        totalQuestions: 10,
        questionType: "free-text",
        questionText: "Name the game",
        imageUrl: null,
        audioUrl: null,
        videoUrl: null,
        choices: [],
        timerSecondsRemaining: null,
        canGoNext: true,
        canGoPrevious: false,
        resultMessage: "correct",
        answerCandidates: ["blue archive"]
      }
    })
  ).rejects.toThrow("소켓 클라이언트가 연결되지 않았습니다.");
});
```

- [ ] **Step 2: Run extension socket-client test to verify it fails**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test -- socketClient.test.ts
```

Expected: FAIL because `onOriginalSubmitAllowed` does not exist.

- [ ] **Step 3: Extend content message constants**

In `apps/extension/src/messages.ts`, add:

```ts
export const CONTENT_FRAME_READY_MESSAGE = "machugi-frame-ready";
export const CONTENT_FAIR_PLAY_MESSAGE = "machugi-fair-play";
export const CONTENT_ORIGINAL_SUBMIT_MESSAGE = "machugi-original-submit";
export const CONTENT_ORIGINAL_RESULT_MESSAGE = "machugi-original-result";
```

- [ ] **Step 4: Enable content scripts in machugi iframes**

In `apps/extension/manifest.json`, add `all_frames: true` to the machugi content script entry:

```json
{
  "matches": ["https://machugi.io/*", "https://*.machugi.io/*"],
  "js": ["contentScript.js"],
  "run_at": "document_idle",
  "all_frames": true
}
```

Also replace the mojibake `name` and `description` with:

```json
"name": "가치 마추기 방장 연결",
"description": "방장 브라우저를 가치 마추기 방과 연결합니다.",
```

- [ ] **Step 5: Add original-submit listener to socket client**

In `apps/extension/src/socketClient.ts`, import:

```ts
OriginalResultPayload,
OriginalSubmitAllowedPayload
```

Add:

```ts
onOriginalSubmitAllowed(handler: (payload: OriginalSubmitAllowedPayload) => void) {
  if (!this.socket) {
    throw new Error("소켓 클라이언트가 연결되지 않았습니다.");
  }

  this.socket.on("original:submit-allowed" as never, handler as never);
}

sendOriginalResult(payload: OriginalResultPayload): Promise<void> {
  if (!this.socket) {
    throw new Error("소켓 클라이언트가 연결되지 않았습니다.");
  }

  return new Promise((resolve, reject) => {
    this.socket?.emit("original:result", payload, (response) => {
      if (response.ok) {
        resolve();
        return;
      }

      reject(new Error(response.error));
    });
  });
}
```

- [ ] **Step 6: Replace active-tab-only target with frame target**

In `apps/extension/src/background.ts`, replace:

```ts
let pairedTabId: number | null = null;
```

with:

```ts
interface MachugiFrameTarget {
  tabId: number;
  frameId: number;
}

let pairedAppTabId: number | null = null;
let pairedMachugiFrame: MachugiFrameTarget | null = null;
```

Replace `registerPairedBridge(roomCode: string, tabId: number)` with:

```ts
function registerPairedBridge(roomCode: string, appTabId: number | null) {
  pairedRoomCode = roomCode;
  pairedAppTabId = appTabId;
  socketClient.onQuizCommand((command) => {
    void sendCommandToPairedMachugiFrame(command);
  });
  socketClient.onOriginalSubmitAllowed((payload) => {
    void sendOriginalSubmitToPairedMachugiFrame(payload);
  });
}
```

- [ ] **Step 7: Pair from the web app tab without requiring active machugi tab**

Change `pairHost` signature:

```ts
async function pairHost(payload: PairingSettings, appTabId: number | null): Promise<PairHostResponse>
```

Inside it, remove the `activeMachugiTabId()` requirement. After `connectAndPair`, call:

```ts
registerPairedBridge(pairResult.roomCode, appTabId);
```

Keep `savePairingSettings(settings)`.

In the runtime message listener, call:

```ts
void pairHost(message.payload, sender.tab?.id ?? null).then(sendResponse);
```

- [ ] **Step 8: Bind the machugi iframe when it reports ready or state**

Add:

```ts
function bindMachugiFrame(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.tab?.id || sender.frameId === undefined) return false;
  if (pairedAppTabId && sender.tab.id !== pairedAppTabId) return false;

  pairedMachugiFrame = {
    tabId: sender.tab.id,
    frameId: sender.frameId
  };
  return true;
}
```

In the `CONTENT_STATE_MESSAGE` branch, replace the old tab check with:

```ts
if (bindMachugiFrame(sender)) {
  void forwardQuizState((message as unknown as { payload: QuizState }).payload);
  sendResponse({ ok: true });
} else {
  sendResponse({ ok: false, error: "연결되지 않은 마추기아이오 화면입니다." });
}
```

Add a branch for `CONTENT_FRAME_READY_MESSAGE`:

```ts
if ((message as { type?: unknown }).type === CONTENT_FRAME_READY_MESSAGE) {
  sendResponse({ ok: bindMachugiFrame(sender) });
  return true;
}
```

- [ ] **Step 9: Send commands to a specific frame**

Replace tab-level send message calls with:

```ts
async function sendMessageToPairedMachugiFrame(message: unknown): Promise<void> {
  if (!pairedMachugiFrame) return;

  await chrome.tabs.sendMessage(pairedMachugiFrame.tabId, message, {
    frameId: pairedMachugiFrame.frameId
  });
}
```

Then:

```ts
async function sendCommandToPairedMachugiFrame(command: QuizCommandPayload): Promise<void> {
  await sendMessageToPairedMachugiFrame({
    type: CONTENT_COMMAND_MESSAGE,
    command: command.command,
    values: command.values
  });
}
```

And:

```ts
async function sendOriginalSubmitToPairedMachugiFrame(payload: OriginalSubmitAllowedPayload): Promise<void> {
  await sendMessageToPairedMachugiFrame({
    type: CONTENT_ORIGINAL_SUBMIT_MESSAGE,
    payload
  });
}
```

- [ ] **Step 10: Auto-pair from app bridge**

In `apps/extension/src/appBridge.ts`, after saving pairing settings via background, make the background perform pairing by sending the existing `APP_PAIRING_SETTINGS_MESSAGE` and expecting status. Keep the `APP_PAIRING_SETTINGS_ACK_MESSAGE` response shape.

The background branch for `APP_PAIRING_SETTINGS_MESSAGE` should:

```ts
void savePairingSettings(normalizePairingSettingsForStorage(message.payload))
  .then(() => pairHost(message.payload, sender.tab?.id ?? null))
  .then((response) => sendResponse(response.ok ? { ok: true, status: "paired" } : { ok: false, error: response.error }))
  .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "연결 정보를 저장하지 못했습니다." }));
return true;
```

- [ ] **Step 11: Run extension tests and build guard**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test -- socketClient.test.ts
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension typecheck
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension build
```

Expected: PASS.

- [ ] **Step 12: Commit frame-aware extension pairing**

Run:

```bash
git add apps/extension/manifest.json apps/extension/src/messages.ts apps/extension/src/background.ts apps/extension/src/appBridge.ts apps/extension/src/socketClient.ts apps/extension/src/socketClient.test.ts
git commit -m "feat: pair extension with machugi iframe"
```

---

### Task 6: Extension Lock Controller And Original Submission

**Files:**
- Create: `apps/extension/src/machugi/lock.ts`
- Create: `apps/extension/src/machugi/lock.test.ts`
- Modify: `apps/extension/src/contentScript.ts`
- Modify: `apps/extension/src/machugi/commands.ts`
- Modify: `apps/extension/src/machugi/commands.test.ts`

- [ ] **Step 1: Write failing lock tests**

Create `apps/extension/src/machugi/lock.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFairPlayLock, type FairPlayLockState } from "./lock";

function click(element: Element) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe("installFairPlayLock", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prevents original submit and next clicks while locked", () => {
    document.body.innerHTML = `
      <form><input value="answer" /><button type="submit">제출</button></form>
      <button class="NextButton_root">다음</button>
    `;
    const getState = (): FairPlayLockState => ({ status: "locked", submittedCount: 1, requiredCount: 2 });
    const controller = installFairPlayLock(document, getState, vi.fn());

    expect(click(document.querySelector("button[type='submit']")!).defaultPrevented).toBe(true);
    expect(click(document.querySelector(".NextButton_root")!).defaultPrevented).toBe(true);

    controller.dispose();
  });

  it("allows next after result is opened", () => {
    document.body.innerHTML = `<button class="NextButton_root">다음</button>`;
    const getState = (): FairPlayLockState => ({ status: "result-opened", submittedCount: 2, requiredCount: 2 });
    const controller = installFairPlayLock(document, getState, vi.fn());

    expect(click(document.querySelector(".NextButton_root")!).defaultPrevented).toBe(false);

    controller.dispose();
  });

  it("requests original submission instead of allowing original submit when ready", () => {
    document.body.innerHTML = `<button type="submit">제출</button>`;
    const requestOriginalSubmit = vi.fn();
    const getState = (): FairPlayLockState => ({ status: "ready", submittedCount: 2, requiredCount: 2 });
    const controller = installFairPlayLock(document, getState, requestOriginalSubmit);

    expect(click(document.querySelector("button")!).defaultPrevented).toBe(true);
    expect(requestOriginalSubmit).toHaveBeenCalledTimes(1);

    controller.dispose();
  });
});
```

- [ ] **Step 2: Run lock test to verify it fails**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test -- lock.test.ts
```

Expected: FAIL because `lock.ts` does not exist.

- [ ] **Step 3: Implement lock controller**

Create `apps/extension/src/machugi/lock.ts`:

```ts
import type { OriginalSubmitStatus } from "@gatchi/shared";

export interface FairPlayLockState {
  status: OriginalSubmitStatus;
  submittedCount: number;
  requiredCount: number;
}

export interface FairPlayLockController {
  render(): void;
  dispose(): void;
}

function targetElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function isSubmitControl(element: HTMLElement): boolean {
  const button = element.closest("button, input[type='submit'], [role='button']");
  if (!button) return false;
  const text = button.textContent?.trim() ?? "";
  return /제출|확인|정답|O|X/i.test(text) || button.getAttribute("type") === "submit";
}

function isNextControl(element: HTMLElement): boolean {
  const button = element.closest("button, [role='button']");
  if (!button) return false;
  const text = button.textContent?.trim() ?? "";
  return /다음|건너|넘어|next|skip/i.test(text) || button.className.toString().includes("NextButton");
}

function ensureOverlay(root: Document): HTMLElement {
  const existing = root.getElementById("gatchi-machugi-lock");
  if (existing) return existing;

  const overlay = root.createElement("div");
  overlay.id = "gatchi-machugi-lock";
  overlay.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "max-width:260px",
    "padding:12px",
    "border-radius:8px",
    "background:#0f172a",
    "color:#fff",
    "font:13px/1.4 system-ui,sans-serif",
    "box-shadow:0 12px 30px rgba(15,23,42,.28)"
  ].join(";");
  root.documentElement.appendChild(overlay);
  return overlay;
}

export function installFairPlayLock(
  root: Document,
  getState: () => FairPlayLockState,
  requestOriginalSubmit: () => void
): FairPlayLockController {
  function prevent(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleClick(event: MouseEvent) {
    const element = targetElement(event.target);
    if (!element) return;
    const state = getState();

    if (isNextControl(element) && state.status !== "result-opened") {
      prevent(event);
      return;
    }

    if (isSubmitControl(element)) {
      prevent(event);
      if (state.status === "ready") requestOriginalSubmit();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    const state = getState();
    if (state.status === "locked" || state.status === "ready" || state.status === "submitting") {
      prevent(event);
      if (state.status === "ready") requestOriginalSubmit();
    }
  }

  function render() {
    const state = getState();
    const overlay = ensureOverlay(root);
    const label =
      state.status === "ready"
        ? "전체 제출 완료. 원본 제출을 진행합니다."
        : state.status === "result-opened"
          ? "결과 확인 완료. 다음 문제로 이동할 수 있습니다."
          : `${state.submittedCount} / ${state.requiredCount}명 제출. 원본 제출 잠금 중`;
    overlay.textContent = label;
  }

  root.addEventListener("click", handleClick, true);
  root.addEventListener("keydown", handleKeydown, true);
  render();

  return {
    render,
    dispose() {
      root.removeEventListener("click", handleClick, true);
      root.removeEventListener("keydown", handleKeydown, true);
      root.getElementById("gatchi-machugi-lock")?.remove();
    }
  };
}
```

- [ ] **Step 4: Write failing command tests for original submission**

In `apps/extension/src/machugi/commands.test.ts`, add:

```ts
it("fills a text answer and clicks the original submit button", () => {
  document.body.innerHTML = `
    <form>
      <input type="text" />
      <button type="submit">제출</button>
    </form>
  `;
  const button = document.querySelector("button") as HTMLButtonElement;
  const click = vi.spyOn(button, "click");

  expect(submitOriginalAnswer("blue archive", document)).toBe(true);
  expect((document.querySelector("input") as HTMLInputElement).value).toBe("blue archive");
  expect(click).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Implement original answer submit command**

In `apps/extension/src/machugi/commands.ts`, export:

```ts
export function submitOriginalAnswer(rawAnswer: string, root: Document = document): boolean {
  const input = root.querySelector<HTMLInputElement>("input[type='text'], input:not([type]), textarea");
  if (input) {
    input.focus();
    input.value = rawAnswer;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return clickButtonByText(root, /제출|확인|정답/i);
}
```

If `clickButtonByText` is not exported, keep it private and call it from this exported function inside the same file.

- [ ] **Step 6: Wire lock controller into content script**

In `apps/extension/src/contentScript.ts`, import:

```ts
import type { OriginalSubmitAllowedPayload, OriginalSubmitStatus } from "@gatchi/shared";
import { submitOriginalAnswer } from "./machugi/commands";
import { installFairPlayLock } from "./machugi/lock";
import {
  CONTENT_FAIR_PLAY_MESSAGE,
  CONTENT_FRAME_READY_MESSAGE,
  CONTENT_ORIGINAL_RESULT_MESSAGE,
  CONTENT_ORIGINAL_SUBMIT_MESSAGE
} from "./messages";
```

Add state:

```ts
let lockStatus: OriginalSubmitStatus = "idle";
let submittedCount = 0;
let requiredCount = 0;
let activeQuestionKey: string | null = null;
```

Create lock controller:

```ts
const lockController = installFairPlayLock(
  document,
  () => ({ status: lockStatus, submittedCount, requiredCount }),
  () => {
    if (!activeQuestionKey) return;
    chrome.runtime.sendMessage({
      type: CONTENT_ORIGINAL_RESULT_MESSAGE,
      requestSubmit: true,
      questionKey: activeQuestionKey
    });
  }
);
```

Send frame ready once installed:

```ts
chrome.runtime.sendMessage({ type: CONTENT_FRAME_READY_MESSAGE, href: window.location.href });
```

Handle fair-play message:

```ts
if (messageType === CONTENT_FAIR_PLAY_MESSAGE) {
  const payload = message as {
    status?: OriginalSubmitStatus;
    submittedCount?: number;
    requiredCount?: number;
    questionKey?: string | null;
  };
  lockStatus = payload.status ?? lockStatus;
  submittedCount = payload.submittedCount ?? submittedCount;
  requiredCount = payload.requiredCount ?? requiredCount;
  activeQuestionKey = payload.questionKey ?? activeQuestionKey;
  lockController.render();
  sendResponse({ ok: true });
  return true;
}
```

Handle original submit:

```ts
if (messageType === CONTENT_ORIGINAL_SUBMIT_MESSAGE) {
  const payload = (message as { payload?: OriginalSubmitAllowedPayload }).payload;
  const ok = Boolean(payload) && submitOriginalAnswer(payload!.hostRawAnswer, document);
  window.setTimeout(() => {
    chrome.runtime.sendMessage({
      type: CONTENT_ORIGINAL_RESULT_MESSAGE,
      payload: {
        roomCode: payload?.roomCode,
        questionKey: payload?.questionKey,
        quiz: extractQuizState(document)
      }
    });
  }, 500);
  sendResponse({ ok });
  return true;
}
```

- [ ] **Step 7: Forward fair-play room state from background to content frame**

In `apps/extension/src/background.ts`, when forwarding quiz state succeeds or when socket receives `room:state`, send:

```ts
void sendMessageToPairedMachugiFrame({
  type: CONTENT_FAIR_PLAY_MESSAGE,
  status: state.fairPlay.originalSubmitStatus,
  submittedCount: state.fairPlay.submittedParticipantIds.length,
  requiredCount: state.fairPlay.requiredParticipantIds.length,
  questionKey: state.fairPlay.questionKey
});
```

Add `socketClient.onRoomState((state) => { ... })` in `registerPairedBridge`, and implement `onRoomState` in `socketClient.ts` using `this.socket.on("room:state", handler)`.

- [ ] **Step 8: Forward content original result to server**

In `apps/extension/src/background.ts`, add a `CONTENT_ORIGINAL_RESULT_MESSAGE` branch:

```ts
if ((message as { type?: unknown }).type === CONTENT_ORIGINAL_RESULT_MESSAGE) {
  const payload = (message as { payload?: OriginalResultPayload }).payload;
  if (payload?.roomCode && payload.questionKey) {
    void socketClient.sendOriginalResult(payload).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "원본 결과 전송에 실패했습니다." })
    );
    return true;
  }
}
```

For `requestSubmit: true`, call `socketClient.requestOriginalSubmit({ roomCode: pairedRoomCode, questionKey })`.

Add this method in `socketClient.ts`:

```ts
requestOriginalSubmit(payload: OriginalSubmitRequestPayload): Promise<void> {
  if (!this.socket) {
    throw new Error("소켓 클라이언트가 연결되지 않았습니다.");
  }

  return new Promise((resolve, reject) => {
    this.socket?.emit("original:request-submit", payload, (response) => {
      if (response.ok) {
        resolve();
        return;
      }

      reject(new Error(response.error));
    });
  });
}
```

- [ ] **Step 9: Run extension tests**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension test -- lock.test.ts commands.test.ts socketClient.test.ts
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension typecheck
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension build
```

Expected: PASS.

- [ ] **Step 10: Commit lock controller**

Run:

```bash
git add apps/extension/src/machugi/lock.ts apps/extension/src/machugi/lock.test.ts apps/extension/src/contentScript.ts apps/extension/src/machugi/commands.ts apps/extension/src/machugi/commands.test.ts apps/extension/src/background.ts apps/extension/src/socketClient.ts apps/extension/src/socketClient.test.ts
git commit -m "feat: lock machugi original submission"
```

---

### Task 7: End-To-End Verification And Release Package

**Files:**
- No planned source files. Defects found during verification must be fixed with focused test-first changes in the affected files.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- typecheck
npm exec --yes pnpm@9.15.0 -- test
npm exec --yes pnpm@9.15.0 -- build
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension zip
```

Expected: all commands PASS and `apps/extension/release/gatchi-machugi-extension.zip` exists.

- [ ] **Step 2: Start the local server**

Run:

```bash
npm exec --yes pnpm@9.15.0 -- dev
```

Expected: server starts and serves the web app. If port `3102` is already in use, use the port printed by the server.

- [ ] **Step 3: Browser smoke test the host iframe**

Use Playwright or the available browser skill to verify:

```ts
await page.goto("http://127.0.0.1:3102");
await page.getByLabel("방장 닉네임").fill("상범");
await page.getByLabel("방 이름").fill("마추기 방");
await page.getByRole("button", { name: "방 만들기" }).click();
await expect(page.getByTitle("마추기아이오 원본 화면")).toBeVisible();
```

Expected: the iframe element is visible. If the iframe body is blocked by browser frame policy, the host workspace must still show extension setup and the implementation must keep top-level machugi tab fallback available.

- [ ] **Step 4: Browser smoke test content script injection into iframe**

With the built extension loaded in Chrome, create a room and verify:

- the web app saves pairing settings,
- the extension pairs without manual host-code entry,
- the `machugi.io` iframe reports `machugi-frame-ready`,
- room state shows host extension connected,
- and the participant view receives mirrored quiz state after the host opens a quiz in the iframe.

Expected: no manual hidden token entry and no `websocket error` in the extension popup.

- [ ] **Step 5: Browser smoke test hard lock**

In a room with host plus one participant:

1. Host starts a free-text question in the `machugi.io` iframe.
2. Host types/clicks on original machugi submit before participant submits.
3. Verify the click is blocked and the extension overlay says `1 / 2명 제출`.
4. Participant submits in Gatchi Machugi.
5. Verify the extension receives `original:submit-allowed`.
6. Verify original result appears and Gatchi Machugi reveals/scored submissions.
7. Verify next-question click is blocked before reveal and allowed after result-opened.

Expected: host cannot see original answer before all required submissions.

- [ ] **Step 6: Fix defects with focused commits**

For each defect found:

1. Write or update a failing unit/browser test that reproduces the defect.
2. Implement the smallest fix.
3. Run the narrow test.
4. Run the relevant package typecheck.
5. Commit with a specific message, for example:

```bash
git add <changed files>
git commit -m "fix: keep machugi submit locked before all submissions"
```

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: working tree clean except for intentional generated release artifacts if they are ignored. Recent commits show this feature's task commits.

---

## Self-Review

- Spec coverage: The plan covers host iframe rendering, extension all-frame injection, tab/frame bridge routing, server fair-play state, original submit authorization, original result reveal/scoring, participant mirrored UI, Korean host status copy, and iframe fallback verification.
- Ambiguity resolved: Original-submit payload containing `hostRawAnswer` is routed only to the paired extension socket, never to the whole room.
- Risk called out: If `machugi.io` blocks iframe rendering in browser despite current headers, Task 7 keeps the existing top-level tab fallback path rather than expanding scope into screen sharing.
- Test coverage: Shared helpers, server domain, server socket authorization, web host workspace, extension socket client, command fill, lock controller, build guard, and browser smoke checks are covered.
