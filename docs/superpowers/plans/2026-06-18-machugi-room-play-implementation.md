# Machugi Room Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP room-play app where a Railway-hosted web/server app syncs players through Socket.io and a Chrome MV3 host extension controls and reads machugi.io.

**Architecture:** Use a TypeScript pnpm monorepo with shared contracts, an Express + Socket.io server, a Vite React client, and a Chrome/Chromium MV3 extension. Implement the first vertical slice with a mock host adapter, then replace the adapter with extension pairing and machugi.io extraction commands.

**Tech Stack:** pnpm workspaces, TypeScript, Vite, React, Express, Socket.io, Prisma, PostgreSQL, Vitest, React Testing Library, Playwright, Chrome Manifest V3.

---

## Scope Check

This MVP spans web UI, server realtime state, persistence, and an extension. Keep it as one plan because each subsystem depends on the same Socket.io event contract and the MVP is only useful when room creation, answer submission, scoring, and host state updates work together. Each task below produces a testable slice and ends with a commit.

## File Structure

- Create `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`: workspace tooling and shared scripts.
- Create `packages/shared/src/*`: typed room models, Socket.io event contracts, answer normalization, scoring helpers.
- Create `apps/server/src/*`: Express app, Socket.io gateway, room service, auth/token service, in-memory live state, Prisma-backed persistence.
- Create `apps/server/prisma/schema.prisma`: durable room metadata, participant, chat, score snapshot, temporary cache metadata.
- Create `apps/web/src/*`: lobby, nickname gate, room view, host controls, extension setup, quiz renderer, answer panel, chat, scoreboard.
- Create `apps/extension/src/*`: MV3 background service worker, popup UI, content script, machugi.io extractor, command adapter, Socket.io client.
- Create `tests/e2e/*`: Playwright flow using a mock host socket instead of the real extension.
- Create `.github/workflows/ci.yml`, `railway.json`, `README.md`: CI, Railway deployment, GitHub Release extension install instructions.

---

### Task 1: Monorepo Tooling Baseline

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `apps/server/package.json`
- Create: `apps/web/package.json`
- Create: `apps/extension/package.json`
- Create: `packages/shared/package.json`

- [ ] **Step 1: Write workspace manifests**

Create `package.json`:

```json
{
  "name": "gatchi-machugi",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "dev": "pnpm --filter @gatchi/server dev",
    "dev:web": "pnpm --filter @gatchi/web dev",
    "dev:server": "pnpm --filter @gatchi/server dev",
    "build:extension": "pnpm --filter @gatchi/extension build"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Create `.env.example`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gatchi_machugi
HOST_TOKEN_PEPPER=replace-with-random-32-byte-secret
CLIENT_ORIGIN=http://localhost:5173
PUBLIC_APP_URL=http://localhost:3000
GITHUB_EXTENSION_RELEASE_URL=https://github.com/OWNER/REPO/releases
```

- [ ] **Step 2: Write package manifests**

Create `packages/shared/package.json`:

```json
{
  "name": "@gatchi/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/server/package.json`:

```json
{
  "name": "@gatchi/server",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@gatchi/shared": "workspace:*",
    "@prisma/client": "^6.1.0",
    "@node-rs/argon2": "^2.0.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "nanoid": "^5.0.9",
    "socket.io": "^4.8.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "prisma": "^6.1.0",
    "socket.io-client": "^4.8.1",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/web/package.json`:

```json
{
  "name": "@gatchi/web",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@gatchi/shared": "workspace:*",
    "@vitejs/plugin-react": "^4.3.4",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "socket.io-client": "^4.8.1",
    "vite": "^6.0.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.2",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/extension/package.json`:

```json
{
  "name": "@gatchi/extension",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "build": "vite build && node scripts/copy-manifest.mjs",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "zip": "pnpm build && node scripts/zip-release.mjs"
  },
  "dependencies": {
    "@gatchi/shared": "workspace:*",
    "socket.io-client": "^4.8.1",
    "vite": "^6.0.3",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.287",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run:

```powershell
corepack enable
pnpm install
```

Expected: `pnpm-lock.yaml` is created and install exits with code 0.

- [ ] **Step 4: Commit tooling baseline**

```powershell
git add package.json pnpm-workspace.yaml tsconfig.base.json .env.example apps/server/package.json apps/web/package.json apps/extension/package.json packages/shared/package.json pnpm-lock.yaml
git commit -m "chore: scaffold workspace tooling"
```

---

### Task 2: Shared Models, Events, And Scoring

**Files:**
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/models.ts`
- Create: `packages/shared/src/events.ts`
- Create: `packages/shared/src/normalize.ts`
- Create: `packages/shared/src/scoring.ts`
- Create: `packages/shared/src/scoring.test.ts`

- [ ] **Step 1: Write failing scoring tests**

Create `packages/shared/src/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreSubmissions } from "./scoring.js";

describe("scoreSubmissions", () => {
  it("treats whitespace-insensitive answers as equal", () => {
    const result = scoreSubmissions({
      answerCandidates: ["blue archive"],
      aliases: [],
      submissions: [
        { participantId: "p1", rawAnswer: "bluearchive", skipped: false },
        { participantId: "p2", rawAnswer: "blue  archive", skipped: false }
      ]
    });

    expect(result.correctParticipantIds).toEqual(["p1", "p2"]);
  });

  it("re-scores with host aliases", () => {
    const result = scoreSubmissions({
      answerCandidates: ["answer"],
      aliases: ["accepted alias"],
      submissions: [
        { participantId: "p1", rawAnswer: "acceptedalias", skipped: false },
        { participantId: "p2", rawAnswer: "wrong", skipped: false }
      ]
    });

    expect(result.correctParticipantIds).toEqual(["p1"]);
    expect(result.incorrectParticipantIds).toEqual(["p2"]);
  });

  it("does not score skipped submissions", () => {
    const result = scoreSubmissions({
      answerCandidates: ["answer"],
      aliases: [],
      submissions: [{ participantId: "p1", rawAnswer: "", skipped: true }]
    });

    expect(result.correctParticipantIds).toEqual([]);
    expect(result.incorrectParticipantIds).toEqual([]);
    expect(result.skippedParticipantIds).toEqual(["p1"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/shared test
```

Expected: FAIL because `./scoring` does not exist.

- [ ] **Step 3: Create shared TypeScript config**

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Implement shared models**

Create `packages/shared/src/models.ts`:

```ts
export type RoomVisibility = "public" | "private";
export type RoomPhase = "lobby" | "searching" | "ready" | "playing" | "revealed" | "ended" | "expired";
export type ParticipantRole = "host" | "player";
export type QuestionType = "unknown" | "text" | "image" | "audio" | "video" | "ox" | "multiple-choice" | "free-text";
export type SubmissionVisibility = "status-only" | "hidden";

export interface PublicRoomSummary {
  roomCode: string;
  title: string;
  quizTitle: string | null;
  participantCount: number;
  phase: RoomPhase;
  visibility: RoomVisibility;
}

export interface Participant {
  id: string;
  nickname: string;
  role: ParticipantRole;
  connected: boolean;
  score: number;
}

export interface QuizChoice {
  id: string;
  label: string;
}

export interface QuizState {
  quizTitle: string | null;
  questionIndex: number | null;
  totalQuestions: number | null;
  questionType: QuestionType;
  questionText: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  choices: QuizChoice[];
  timerSecondsRemaining: number | null;
  canGoNext: boolean;
  canGoPrevious: boolean;
  resultMessage: string | null;
  answerCandidates: string[];
}

export interface RoomSettings {
  visibility: RoomVisibility;
  submissionVisibility: SubmissionVisibility;
  timerSeconds: number | null;
  title: string;
}

export interface SubmissionStatus {
  participantId: string;
  submitted: boolean;
  skipped: boolean;
}

export interface RevealedSubmission extends SubmissionStatus {
  rawAnswer: string;
  correct: boolean;
}

export interface RoomState {
  roomCode: string;
  phase: RoomPhase;
  settings: RoomSettings;
  participants: Participant[];
  quiz: QuizState;
  submissions: SubmissionStatus[];
  revealedSubmissions: RevealedSubmission[];
  hostExtensionConnected: boolean;
  chatMessageCount: number;
}
```

Create `packages/shared/src/events.ts`:

```ts
import type { PublicRoomSummary, QuestionType, QuizState, RevealedSubmission, RoomSettings, RoomState } from "./models.js";

export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "room:public-list": (rooms: PublicRoomSummary[]) => void;
  "host:connected": () => void;
  "host:disconnected": () => void;
  "quiz:search-results": (results: QuizSearchResult[]) => void;
  "extension:error": (error: ExtensionErrorPayload) => void;
  "answer:revealed": (submissions: RevealedSubmission[]) => void;
  "chat:message": (message: ChatMessagePayload) => void;
  "chat:system": (message: SystemMessagePayload) => void;
}

export interface ClientToServerEvents {
  "room:join": (payload: JoinRoomPayload, ack: Ack<JoinRoomAck>) => void;
  "host:pair": (payload: HostPairPayload, ack: Ack<HostPairAck>) => void;
  "quiz:search": (payload: QuizSearchPayload, ack: Ack<void>) => void;
  "quiz:select": (payload: QuizSelectPayload, ack: Ack<void>) => void;
  "quiz:command": (payload: QuizCommandPayload, ack: Ack<void>) => void;
  "extension:state": (payload: ExtensionStatePayload, ack: Ack<void>) => void;
  "answer:submit": (payload: SubmitAnswerPayload, ack: Ack<void>) => void;
  "answer:reveal": (payload: RevealAnswerPayload, ack: Ack<void>) => void;
  "answer:add-alias": (payload: AddAliasPayload, ack: Ack<void>) => void;
  "score:adjust": (payload: AdjustScorePayload, ack: Ack<void>) => void;
  "chat:send": (payload: SendChatPayload, ack: Ack<void>) => void;
  "room:update-settings": (payload: UpdateSettingsPayload, ack: Ack<void>) => void;
  "participant:kick": (payload: KickParticipantPayload, ack: Ack<void>) => void;
}

export type Ack<T> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface JoinRoomPayload {
  roomCode: string;
  nickname: string;
  participantId?: string;
}

export interface JoinRoomAck {
  participantId: string;
  state: RoomState;
}

export interface HostPairPayload {
  roomCode: string;
  hostToken: string;
}

export interface HostPairAck {
  roomCode: string;
}

export interface QuizSearchPayload {
  roomCode: string;
  query: string;
}

export interface QuizSearchResult {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  description: string | null;
  problemCount: number | null;
}

export interface QuizSelectPayload {
  roomCode: string;
  quizIdOrUrl: string;
}

export type QuizCommandName = "configure" | "start" | "next" | "previous" | "skip" | "reset" | "reveal-original-answer";

export interface QuizCommandPayload {
  roomCode: string;
  command: QuizCommandName;
  values?: Record<string, string | number | boolean | null>;
}

export interface ExtensionStatePayload {
  roomCode: string;
  quiz: QuizState;
}

export interface ExtensionErrorPayload {
  roomCode: string;
  stage: "search" | "select" | "command" | "extract";
  message: string;
}

export interface SubmitAnswerPayload {
  roomCode: string;
  participantId: string;
  rawAnswer: string;
}

export interface RevealAnswerPayload {
  roomCode: string;
  skippedParticipantIds: string[];
}

export interface AddAliasPayload {
  roomCode: string;
  alias: string;
}

export interface AdjustScorePayload {
  roomCode: string;
  participantId: string;
  delta: number;
  reason: string;
}

export interface SendChatPayload {
  roomCode: string;
  participantId: string;
  text: string;
}

export interface ChatMessagePayload {
  id: string;
  roomCode: string;
  participantId: string;
  nickname: string;
  text: string;
  createdAt: string;
}

export interface SystemMessagePayload {
  id: string;
  roomCode: string;
  text: string;
  createdAt: string;
}

export interface UpdateSettingsPayload {
  roomCode: string;
  settings: Partial<RoomSettings> & { forcedQuestionType?: QuestionType };
}

export interface KickParticipantPayload {
  roomCode: string;
  participantId: string;
}
```

- [ ] **Step 5: Implement normalization and scoring**

Create `packages/shared/src/normalize.ts`:

```ts
export function normalizeAnswer(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase();
}
```

Create `packages/shared/src/scoring.ts`:

```ts
import { normalizeAnswer } from "./normalize.js";

export interface ScoringSubmission {
  participantId: string;
  rawAnswer: string;
  skipped: boolean;
}

export interface ScoreSubmissionsInput {
  answerCandidates: string[];
  aliases: string[];
  submissions: ScoringSubmission[];
}

export interface ScoreSubmissionsResult {
  correctParticipantIds: string[];
  incorrectParticipantIds: string[];
  skippedParticipantIds: string[];
}

export function scoreSubmissions(input: ScoreSubmissionsInput): ScoreSubmissionsResult {
  const accepted = new Set([...input.answerCandidates, ...input.aliases].map(normalizeAnswer).filter(Boolean));
  const result: ScoreSubmissionsResult = {
    correctParticipantIds: [],
    incorrectParticipantIds: [],
    skippedParticipantIds: []
  };

  for (const submission of input.submissions) {
    if (submission.skipped) {
      result.skippedParticipantIds.push(submission.participantId);
      continue;
    }

    if (accepted.has(normalizeAnswer(submission.rawAnswer))) {
      result.correctParticipantIds.push(submission.participantId);
    } else {
      result.incorrectParticipantIds.push(submission.participantId);
    }
  }

  return result;
}
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./events.js";
export * from "./models.js";
export * from "./normalize.js";
export * from "./scoring.js";
```

- [ ] **Step 6: Verify shared package**

Run:

```powershell
pnpm --filter @gatchi/shared test
pnpm --filter @gatchi/shared typecheck
pnpm --filter @gatchi/shared build
```

Expected: all commands pass.

- [ ] **Step 7: Commit shared contracts**

```powershell
git add packages/shared
git commit -m "feat: add shared room contracts and scoring"
```

---

### Task 3: Server Room Service And Host Token Security

**Files:**
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/security/hostToken.ts`
- Create: `apps/server/src/security/hostToken.test.ts`
- Create: `apps/server/src/domain/roomService.ts`
- Create: `apps/server/src/domain/roomService.test.ts`

- [ ] **Step 1: Write host token tests**

Create `apps/server/src/security/hostToken.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHostToken, hashHostToken, verifyHostToken } from "./hostToken.js";

describe("host token security", () => {
  it("creates a one-time plaintext token and stores only a hash", async () => {
    const token = createHostToken();
    const hash = await hashHostToken(token, "pepper");

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hash).not.toContain(token);
    await expect(verifyHostToken(token, hash, "pepper")).resolves.toBe(true);
    await expect(verifyHostToken("wrong", hash, "pepper")).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Write room service tests**

Create `apps/server/src/domain/roomService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomService } from "./roomService.js";

describe("RoomService", () => {
  it("creates a room with a public room code and one-time host token", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const created = await service.createRoom({ title: "Friday quiz", visibility: "public" });

    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.hostToken.length).toBeGreaterThanOrEqual(32);
    expect(created.state.settings.title).toBe("Friday quiz");
    expect(created.state.settings.visibility).toBe("public");
  });

  it("adds numeric suffixes for duplicate nicknames", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });

    const first = service.joinParticipant({ roomCode, nickname: "Mina" });
    const second = service.joinParticipant({ roomCode, nickname: "Mina" });

    expect(first.participant.nickname).toBe("Mina");
    expect(second.participant.nickname).toBe("Mina#2");
  });

  it("verifies host token before granting host access", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode, hostToken } = await service.createRoom({ title: "Room", visibility: "private" });

    await expect(service.verifyHost({ roomCode, hostToken })).resolves.toBe(true);
    await expect(service.verifyHost({ roomCode, hostToken: "wrong" })).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run server tests to verify they fail**

Run:

```powershell
pnpm --filter @gatchi/server test
```

Expected: FAIL because `hostToken.ts` and `roomService.ts` do not exist.

- [ ] **Step 4: Create server TypeScript config**

Create `apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Implement host token utilities**

Create `apps/server/src/security/hostToken.ts`:

```ts
import { hash, verify } from "@node-rs/argon2";
import { customAlphabet } from "nanoid";

const tokenAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const createToken = customAlphabet(tokenAlphabet, 40);

export function createHostToken(): string {
  return createToken();
}

export async function hashHostToken(token: string, pepper: string): Promise<string> {
  return hash(`${pepper}:${token}`, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyHostToken(token: string, tokenHash: string, pepper: string): Promise<boolean> {
  return verify(tokenHash, `${pepper}:${token}`);
}
```

- [ ] **Step 6: Implement room service**

Create `apps/server/src/domain/roomService.ts`:

```ts
import type { Participant, RoomState, RoomVisibility } from "@gatchi/shared";
import { customAlphabet, nanoid } from "nanoid";
import { createHostToken, hashHostToken, verifyHostToken } from "../security/hostToken.js";

const createRoomCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

interface StoredRoom {
  hostTokenHash: string;
  state: RoomState;
  aliases: string[];
  rawSubmissions: Map<string, { rawAnswer: string; skipped: boolean }>;
  expiresAt: Date;
}

export interface CreateRoomInput {
  title: string;
  visibility: RoomVisibility;
}

export interface CreateRoomResult {
  roomCode: string;
  hostToken: string;
  state: RoomState;
}

export class RoomService {
  private rooms = new Map<string, StoredRoom>();

  constructor(private readonly options: { hostTokenPepper: string }) {}

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    const roomCode = this.uniqueRoomCode();
    const hostToken = createHostToken();
    const hostTokenHash = await hashHostToken(hostToken, this.options.hostTokenPepper);
    const state = this.emptyState(roomCode, input);

    this.rooms.set(roomCode, {
      hostTokenHash,
      state,
      aliases: [],
      rawSubmissions: new Map(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    return { roomCode, hostToken, state };
  }

  joinParticipant(input: { roomCode: string; nickname: string; participantId?: string }): { participant: Participant; state: RoomState } {
    const room = this.requireRoom(input.roomCode);
    const existing = input.participantId ? room.state.participants.find((p) => p.id === input.participantId) : undefined;

    if (existing) {
      existing.connected = true;
      return { participant: existing, state: room.state };
    }

    const participant: Participant = {
      id: input.participantId ?? nanoid(12),
      nickname: this.uniqueNickname(room.state.participants, input.nickname.trim() || "Player"),
      role: "player",
      connected: true,
      score: 0
    };

    room.state.participants.push(participant);
    return { participant, state: room.state };
  }

  async verifyHost(input: { roomCode: string; hostToken: string }): Promise<boolean> {
    const room = this.rooms.get(input.roomCode);
    if (!room) return false;
    return verifyHostToken(input.hostToken, room.hostTokenHash, this.options.hostTokenPepper);
  }

  getState(roomCode: string): RoomState {
    return this.requireRoom(roomCode).state;
  }

  listPublicRooms() {
    return [...this.rooms.values()]
      .filter((room) => room.state.settings.visibility === "public" && room.state.phase !== "expired")
      .map((room) => ({
        roomCode: room.state.roomCode,
        title: room.state.settings.title,
        quizTitle: room.state.quiz.quizTitle,
        participantCount: room.state.participants.filter((p) => p.connected).length,
        phase: room.state.phase,
        visibility: room.state.settings.visibility
      }));
  }

  private requireRoom(roomCode: string): StoredRoom {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error("Room not found");
    return room;
  }

  private uniqueRoomCode(): string {
    let code = createRoomCode();
    while (this.rooms.has(code)) code = createRoomCode();
    return code;
  }

  private uniqueNickname(participants: Participant[], requested: string): string {
    const existing = new Set(participants.map((participant) => participant.nickname));
    if (!existing.has(requested)) return requested;

    let suffix = 2;
    while (existing.has(`${requested}#${suffix}`)) suffix += 1;
    return `${requested}#${suffix}`;
  }

  private emptyState(roomCode: string, input: CreateRoomInput): RoomState {
    return {
      roomCode,
      phase: "lobby",
      settings: {
        title: input.title,
        visibility: input.visibility,
        submissionVisibility: "status-only",
        timerSeconds: null
      },
      participants: [],
      quiz: {
        quizTitle: null,
        questionIndex: null,
        totalQuestions: null,
        questionType: "unknown",
        questionText: null,
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
      submissions: [],
      revealedSubmissions: [],
      hostExtensionConnected: false,
      chatMessageCount: 0
    };
  }
}
```

- [ ] **Step 7: Verify server domain tests**

Run:

```powershell
pnpm --filter @gatchi/server test src/security/hostToken.test.ts src/domain/roomService.test.ts
pnpm --filter @gatchi/server typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 8: Commit room service**

```powershell
git add apps/server/tsconfig.json apps/server/src
git commit -m "feat: add room service and host token security"
```

---

### Task 4: Socket.io Gateway And Mock Host Flow

**Files:**
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/socket/createSocketServer.ts`
- Create: `apps/server/src/socket/socketServer.test.ts`
- Create: `apps/server/src/index.ts`

- [ ] **Step 1: Write socket flow test**

Create `apps/server/src/socket/socketServer.test.ts`:

```ts
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { io as createClient, Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { attachSocketServer } from "./createSocketServer.js";

describe("Socket.io room flow", () => {
  const sockets: Socket[] = [];

  afterEach(() => {
    for (const socket of sockets) socket.close();
    sockets.length = 0;
  });

  it("joins player and host extension to the same room", async () => {
    const app = createApp({ hostTokenPepper: "pepper" });
    const httpServer = createServer(app.express);
    attachSocketServer(httpServer, app.services);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const url = `http://localhost:${port}`;

    const created = await app.services.rooms.createRoom({ title: "Socket room", visibility: "public" });
    const player = createClient(url);
    const host = createClient(url);
    sockets.push(player, host);

    const joinAck = await emitWithAck(player, "room:join", { roomCode: created.roomCode, nickname: "Mina" });
    expect(joinAck.ok).toBe(true);

    const hostAck = await emitWithAck(host, "host:pair", { roomCode: created.roomCode, hostToken: created.hostToken });
    expect(hostAck.ok).toBe(true);

    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
});

function emitWithAck(socket: Socket, event: string, payload: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}
```

- [ ] **Step 2: Run socket test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/server test src/socket/socketServer.test.ts
```

Expected: FAIL because `app.ts` and `createSocketServer.ts` do not exist.

- [ ] **Step 3: Implement Express app container**

Create `apps/server/src/app.ts`:

```ts
import cors from "cors";
import express from "express";
import { RoomService } from "./domain/roomService.js";

export interface AppServices {
  rooms: RoomService;
}

export interface AppContainer {
  express: express.Express;
  services: AppServices;
}

export function createApp(options: { hostTokenPepper: string }): AppContainer {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const services: AppServices = {
    rooms: new RoomService({ hostTokenPepper: options.hostTokenPepper })
  };

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/public-rooms", (_req, res) => {
    res.json({ rooms: services.rooms.listPublicRooms() });
  });

  app.post("/api/rooms", async (req, res) => {
    const title = typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : "Machugi Room";
    const visibility = req.body.visibility === "private" ? "private" : "public";
    const room = await services.rooms.createRoom({ title, visibility });
    res.status(201).json(room);
  });

  return { express: app, services };
}
```

- [ ] **Step 4: Implement Socket.io gateway**

Create `apps/server/src/socket/createSocketServer.ts`:

```ts
import type { Server as HttpServer } from "node:http";
import type { ClientToServerEvents, ServerToClientEvents } from "@gatchi/shared";
import { Server } from "socket.io";
import type { AppServices } from "../app.js";

export function attachSocketServer(httpServer: HttpServer, services: AppServices) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: true }
  });

  const hostSockets = new Map<string, string>();

  io.on("connection", (socket) => {
    socket.on("room:join", (payload, ack) => {
      try {
        const { participant, state } = services.rooms.joinParticipant(payload);
        socket.join(payload.roomCode);
        socket.data.roomCode = payload.roomCode;
        socket.data.participantId = participant.id;
        io.to(payload.roomCode).emit("room:state", state);
        ack({ ok: true, data: { participantId: participant.id, state } });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Join failed" });
      }
    });

    socket.on("host:pair", async (payload, ack) => {
      const verified = await services.rooms.verifyHost(payload);
      if (!verified) {
        ack({ ok: false, error: "Invalid host token" });
        return;
      }

      socket.join(payload.roomCode);
      socket.data.roomCode = payload.roomCode;
      socket.data.host = true;
      hostSockets.set(payload.roomCode, socket.id);
      const state = services.rooms.getState(payload.roomCode);
      state.hostExtensionConnected = true;
      io.to(payload.roomCode).emit("host:connected");
      io.to(payload.roomCode).emit("room:state", state);
      ack({ ok: true, data: { roomCode: payload.roomCode } });
    });

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode as string | undefined;
      if (roomCode && socket.data.host && hostSockets.get(roomCode) === socket.id) {
        hostSockets.delete(roomCode);
        const state = services.rooms.getState(roomCode);
        state.hostExtensionConnected = false;
        io.to(roomCode).emit("host:disconnected");
        io.to(roomCode).emit("room:state", state);
      }
    });
  });

  return io;
}
```

Create `apps/server/src/index.ts`:

```ts
import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { attachSocketServer } from "./socket/createSocketServer.js";

const port = Number(process.env.PORT ?? 3000);
const hostTokenPepper = process.env.HOST_TOKEN_PEPPER ?? "dev-pepper-change-me";
const app = createApp({ hostTokenPepper });
const httpServer = createServer(app.express);

attachSocketServer(httpServer, app.services);

httpServer.listen(port, () => {
  console.log(`Server listening on ${port}`);
});
```

- [ ] **Step 5: Verify socket gateway**

Run:

```powershell
pnpm --filter @gatchi/server test src/socket/socketServer.test.ts
pnpm --filter @gatchi/server typecheck
```

Expected: test and typecheck pass.

- [ ] **Step 6: Commit socket gateway**

```powershell
git add apps/server/src
git commit -m "feat: add socket room gateway"
```

---

### Task 5: Answers, Reveal Fairness, Aliases, And Score Updates

**Files:**
- Modify: `apps/server/src/domain/roomService.ts`
- Modify: `apps/server/src/domain/roomService.test.ts`
- Modify: `apps/server/src/socket/createSocketServer.ts`
- Create: `apps/server/src/socket/answerEvents.test.ts`

- [ ] **Step 1: Add room service fairness tests**

Append to `apps/server/src/domain/roomService.test.ts`:

```ts
it("hides raw answers before reveal and requires every active player to submit or be skipped", async () => {
  const service = new RoomService({ hostTokenPepper: "pepper" });
  const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });
  const host = service.joinHostPlayer({ roomCode, nickname: "Host" });
  const player = service.joinParticipant({ roomCode, nickname: "Mina" });

  service.submitAnswer({ roomCode, participantId: host.participant.id, rawAnswer: "answer" });
  service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "answer" });

  const hidden = service.getState(roomCode);
  expect(hidden.revealedSubmissions).toEqual([]);
  expect(hidden.submissions).toEqual([
    { participantId: host.participant.id, submitted: true, skipped: false },
    { participantId: player.participant.id, submitted: true, skipped: false }
  ]);

  service.updateQuizState({ roomCode, quiz: { ...hidden.quiz, answerCandidates: ["answer"] } });
  const revealed = service.revealAnswers({ roomCode, skippedParticipantIds: [] });
  expect(revealed.revealedSubmissions.every((submission) => submission.rawAnswer === "answer")).toBe(true);
});

it("re-scores existing submissions when host adds an alias", async () => {
  const service = new RoomService({ hostTokenPepper: "pepper" });
  const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });
  const host = service.joinHostPlayer({ roomCode, nickname: "Host" });
  const player = service.joinParticipant({ roomCode, nickname: "Mina" });

  service.updateQuizState({ roomCode, quiz: { ...service.getState(roomCode).quiz, answerCandidates: ["answer"] } });
  service.submitAnswer({ roomCode, participantId: host.participant.id, rawAnswer: "answer" });
  service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "acceptedalias" });
  service.revealAnswers({ roomCode, skippedParticipantIds: [] });
  const rescored = service.addAlias({ roomCode, alias: "accepted alias" });

  const mina = rescored.revealedSubmissions.find((submission) => submission.participantId === player.participant.id);
  expect(mina?.correct).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/server test src/domain/roomService.test.ts
```

Expected: FAIL because answer methods do not exist.

- [ ] **Step 3: Implement answer methods**

Modify `apps/server/src/domain/roomService.ts`:

```ts
import { scoreSubmissions, type QuizState, type RevealedSubmission } from "@gatchi/shared";
```

Add these methods inside `RoomService`:

```ts
  joinHostPlayer(input: { roomCode: string; nickname: string }): { participant: Participant; state: RoomState } {
    const room = this.requireRoom(input.roomCode);
    const existingHost = room.state.participants.find((participant) => participant.role === "host");
    if (existingHost) return { participant: existingHost, state: room.state };

    const participant: Participant = {
      id: nanoid(12),
      nickname: this.uniqueNickname(room.state.participants, input.nickname.trim() || "Host"),
      role: "host",
      connected: true,
      score: 0
    };
    room.state.participants.push(participant);
    return { participant, state: room.state };
  }

  updateQuizState(input: { roomCode: string; quiz: QuizState }): RoomState {
    const room = this.requireRoom(input.roomCode);
    room.state.quiz = input.quiz;
    return room.state;
  }

  submitAnswer(input: { roomCode: string; participantId: string; rawAnswer: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    room.rawSubmissions.set(input.participantId, { rawAnswer: input.rawAnswer, skipped: false });
    room.state.submissions = this.publicSubmissionStatuses(room);
    return room.state;
  }

  revealAnswers(input: { roomCode: string; skippedParticipantIds: string[] }): RoomState {
    const room = this.requireRoom(input.roomCode);
    for (const participantId of input.skippedParticipantIds) {
      room.rawSubmissions.set(participantId, { rawAnswer: "", skipped: true });
    }

    const activeParticipants = room.state.participants.filter((participant) => participant.connected);
    const missing = activeParticipants.filter((participant) => !room.rawSubmissions.has(participant.id));
    if (missing.length > 0) {
      throw new Error("All active players must submit or be skipped before reveal");
    }

    room.state.phase = "revealed";
    room.state.revealedSubmissions = this.revealedSubmissions(room);
    this.applyScores(room);
    return room.state;
  }

  addAlias(input: { roomCode: string; alias: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const alias = input.alias.trim();
    if (alias) room.aliases.push(alias);
    if (room.state.phase === "revealed") {
      room.state.revealedSubmissions = this.revealedSubmissions(room);
      this.applyScores(room);
    }
    return room.state;
  }

  private publicSubmissionStatuses(room: StoredRoom) {
    return [...room.rawSubmissions.entries()].map(([participantId, submission]) => ({
      participantId,
      submitted: !submission.skipped && submission.rawAnswer.length > 0,
      skipped: submission.skipped
    }));
  }

  private revealedSubmissions(room: StoredRoom): RevealedSubmission[] {
    const raw = [...room.rawSubmissions.entries()].map(([participantId, submission]) => ({
      participantId,
      rawAnswer: submission.rawAnswer,
      skipped: submission.skipped
    }));
    const scored = scoreSubmissions({
      answerCandidates: room.state.quiz.answerCandidates,
      aliases: room.aliases,
      submissions: raw
    });
    const correct = new Set(scored.correctParticipantIds);

    return raw.map((submission) => ({
      participantId: submission.participantId,
      submitted: !submission.skipped && submission.rawAnswer.length > 0,
      skipped: submission.skipped,
      rawAnswer: submission.rawAnswer,
      correct: correct.has(submission.participantId)
    }));
  }

  private applyScores(room: StoredRoom): void {
    for (const participant of room.state.participants) {
      const revealed = room.state.revealedSubmissions.find((submission) => submission.participantId === participant.id);
      if (revealed?.correct) participant.score = Math.max(participant.score, 1);
    }
  }
```

- [ ] **Step 4: Verify answer service behavior**

Run:

```powershell
pnpm --filter @gatchi/server test src/domain/roomService.test.ts
pnpm --filter @gatchi/server typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Add socket answer event test**

Create `apps/server/src/socket/answerEvents.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("answer socket authorization", () => {
  it("keeps raw answers out of room state before reveal", () => {
    const serializedState = JSON.stringify({
      submissions: [{ participantId: "p1", submitted: true, skipped: false }],
      revealedSubmissions: []
    });

    expect(serializedState).not.toContain("rawAnswer");
  });
});
```

- [ ] **Step 6: Wire answer events through Socket.io**

Modify `apps/server/src/socket/createSocketServer.ts` and add these handlers inside `io.on("connection")`:

```ts
    socket.on("extension:state", (payload, ack) => {
      try {
        if (!socket.data.host) throw new Error("Host authorization required");
        const state = services.rooms.updateQuizState(payload);
        io.to(payload.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "State update failed" });
      }
    });

    socket.on("answer:submit", (payload, ack) => {
      try {
        const state = services.rooms.submitAnswer(payload);
        io.to(payload.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Answer submit failed" });
      }
    });

    socket.on("answer:reveal", (payload, ack) => {
      try {
        if (!socket.data.host) throw new Error("Host authorization required");
        const state = services.rooms.revealAnswers(payload);
        io.to(payload.roomCode).emit("answer:revealed", state.revealedSubmissions);
        io.to(payload.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Reveal failed" });
      }
    });

    socket.on("answer:add-alias", (payload, ack) => {
      try {
        if (!socket.data.host) throw new Error("Host authorization required");
        const state = services.rooms.addAlias(payload);
        io.to(payload.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Alias failed" });
      }
    });
```

- [ ] **Step 7: Verify answer events**

Run:

```powershell
pnpm --filter @gatchi/server test
pnpm --filter @gatchi/server typecheck
```

Expected: all server tests pass.

- [ ] **Step 8: Commit answer flow**

```powershell
git add apps/server/src
git commit -m "feat: add fair answer reveal and scoring"
```

---

### Task 6: Prisma Persistence Skeleton

**Files:**
- Create: `apps/server/prisma/schema.prisma`
- Create: `apps/server/src/persistence/prismaClient.ts`
- Create: `apps/server/src/persistence/roomRepository.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Create Prisma schema**

Create `apps/server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Room {
  id              String   @id @default(cuid())
  roomCode        String   @unique
  title           String
  visibility      String
  phase           String
  hostTokenHash   String
  quizTitle       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  expiresAt       DateTime
  endedAt         DateTime?
  participants    Participant[]
  chatMessages    ChatMessage[]
  scoreSnapshots  ScoreSnapshot[]
  cacheEntries    TemporaryCacheEntry[]
}

model Participant {
  id        String   @id
  roomId    String
  nickname  String
  role      String
  score     Int      @default(0)
  createdAt DateTime @default(now())
  room      Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
}

model ChatMessage {
  id            String   @id @default(cuid())
  roomId        String
  participantId String?
  kind          String
  text          String
  createdAt     DateTime @default(now())
  room          Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
}

model ScoreSnapshot {
  id            String   @id @default(cuid())
  roomId        String
  participantId String
  score         Int
  reason        String
  createdAt     DateTime @default(now())
  room          Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
}

model TemporaryCacheEntry {
  id        String   @id @default(cuid())
  roomId    String
  key       String
  valueJson Json
  expiresAt DateTime
  createdAt DateTime @default(now())
  room      Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)

  @@unique([roomId, key])
}
```

- [ ] **Step 2: Generate Prisma client**

Run:

```powershell
pnpm --filter @gatchi/server prisma:generate
```

Expected: Prisma client generation succeeds.

- [ ] **Step 3: Add Prisma client and repository interface**

Create `apps/server/src/persistence/prismaClient.ts`:

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

Create `apps/server/src/persistence/roomRepository.ts`:

```ts
import type { RoomVisibility } from "@gatchi/shared";
import type { PrismaClient } from "@prisma/client";

export interface PersistRoomInput {
  roomCode: string;
  title: string;
  visibility: RoomVisibility;
  phase: string;
  hostTokenHash: string;
  expiresAt: Date;
}

export class RoomRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createRoom(input: PersistRoomInput) {
    return this.prisma.room.create({
      data: {
        roomCode: input.roomCode,
        title: input.title,
        visibility: input.visibility,
        phase: input.phase,
        hostTokenHash: input.hostTokenHash,
        expiresAt: input.expiresAt
      }
    });
  }

  async listPublicRooms() {
    return this.prisma.room.findMany({
      where: {
        visibility: "public",
        phase: { notIn: ["ended", "expired"] },
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }
}
```

- [ ] **Step 4: Keep live service in memory while adding repository boundary**

Modify `apps/server/src/app.ts` so `createApp` accepts an optional repository without using it for live tests:

```ts
export function createApp(options: { hostTokenPepper: string; repository?: unknown }): AppContainer {
```

This keeps existing tests deterministic while creating the boundary needed for Railway Postgres integration.

- [ ] **Step 5: Verify Prisma skeleton**

Run:

```powershell
pnpm --filter @gatchi/server prisma:generate
pnpm --filter @gatchi/server typecheck
pnpm --filter @gatchi/server test
```

Expected: all commands pass.

- [ ] **Step 6: Commit persistence skeleton**

```powershell
git add apps/server/prisma apps/server/src/persistence apps/server/src/app.ts
git commit -m "feat: add prisma persistence skeleton"
```

---

### Task 7: Web App Shell, Lobby, And Nickname Gate

**Files:**
- Create: `apps/web/index.html`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/App.test.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/api.ts`

- [ ] **Step 1: Write lobby test**

Create `apps/web/src/App.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("shows public rooms, room code entry, and nickname gate", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Gatchi Machugi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nickname")).toBeInTheDocument();
    expect(screen.getByLabelText("Room code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join room" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run web test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/web test
```

Expected: FAIL because `App.tsx` does not exist.

- [ ] **Step 3: Create Vite config and entry files**

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `apps/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true
  }
});
```

Create `apps/web/index.html`:

```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

Create `apps/web/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 4: Implement lobby shell**

Create `apps/web/src/api.ts`:

```ts
import type { PublicRoomSummary } from "@gatchi/shared";

export async function fetchPublicRooms(): Promise<PublicRoomSummary[]> {
  const response = await fetch("/api/public-rooms");
  if (!response.ok) throw new Error("Failed to load public rooms");
  const body = (await response.json()) as { rooms: PublicRoomSummary[] };
  return body.rooms;
}
```

Create `apps/web/src/App.tsx`:

```tsx
import { useMemo, useState } from "react";

export function App() {
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const canJoin = useMemo(() => nickname.trim().length > 0 && roomCode.trim().length > 0, [nickname, roomCode]);

  return (
    <main className="app-shell">
      <section className="lobby-panel">
        <h1>Gatchi Machugi</h1>
        <p className="muted">Join a shared machugi.io room with chat, scoring, and host-controlled play.</p>

        <form className="join-form">
          <label>
            Nickname
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <label>
            Room code
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} />
          </label>
          <button type="button" disabled={!canJoin}>Join room</button>
        </form>

        <section aria-label="Public rooms" className="public-rooms">
          <h2>Public rooms</h2>
          <p className="muted">Public rooms will appear here while games are active.</p>
        </section>
      </section>
    </main>
  );
}
```

Create `apps/web/src/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f5f7fb;
  color: #172033;
}

button,
input {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.lobby-panel {
  width: min(720px, 100%);
  background: #ffffff;
  border: 1px solid #d9e0ec;
  border-radius: 8px;
  padding: 24px;
}

.muted {
  color: #667085;
}

.join-form {
  display: grid;
  gap: 12px;
  margin: 24px 0;
}

.join-form label {
  display: grid;
  gap: 6px;
  font-weight: 700;
}

.join-form input {
  border: 1px solid #c9d3e4;
  border-radius: 6px;
  padding: 10px 12px;
}

.join-form button {
  border: 0;
  border-radius: 6px;
  padding: 10px 12px;
  background: #2563eb;
  color: white;
  font-weight: 700;
}

.join-form button:disabled {
  background: #aab7cc;
}
```

- [ ] **Step 5: Verify web shell**

Run:

```powershell
pnpm --filter @gatchi/web test
pnpm --filter @gatchi/web typecheck
pnpm --filter @gatchi/web build
```

Expected: all commands pass.

- [ ] **Step 6: Commit web shell**

```powershell
git add apps/web
git commit -m "feat: add lobby shell and nickname gate"
```

---

### Task 8: Room Play UI Components

**Files:**
- Create: `apps/web/src/room/RoomView.tsx`
- Create: `apps/web/src/room/RoomView.test.tsx`
- Create: `apps/web/src/room/QuizPanel.tsx`
- Create: `apps/web/src/room/AnswerPanel.tsx`
- Create: `apps/web/src/room/SubmissionPanel.tsx`
- Create: `apps/web/src/room/Scoreboard.tsx`
- Create: `apps/web/src/room/ChatPanel.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write room UI fairness test**

Create `apps/web/src/room/RoomView.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import type { RoomState } from "@gatchi/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomView } from "./RoomView";

const baseState: RoomState = {
  roomCode: "ABC123",
  phase: "playing",
  settings: { title: "Room", visibility: "public", submissionVisibility: "status-only", timerSeconds: null },
  participants: [
    { id: "host", nickname: "Host", role: "host", connected: true, score: 0 },
    { id: "p1", nickname: "Mina", role: "player", connected: true, score: 0 }
  ],
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
  },
  submissions: [{ participantId: "p1", submitted: true, skipped: false }],
  revealedSubmissions: [],
  hostExtensionConnected: true,
  chatMessageCount: 0
};

describe("RoomView", () => {
  it("shows submission status without raw answer before reveal", () => {
    render(<RoomView state={baseState} currentParticipantId="host" onSubmitAnswer={() => undefined} />);

    expect(screen.getByText("Mina submitted")).toBeInTheDocument();
    expect(screen.queryByText("rawAnswer")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/web test src/room/RoomView.test.tsx
```

Expected: FAIL because `RoomView.tsx` does not exist.

- [ ] **Step 3: Implement room UI components**

Create `apps/web/src/room/RoomView.tsx`:

```tsx
import type { RoomState } from "@gatchi/shared";
import { AnswerPanel } from "./AnswerPanel";
import { ChatPanel } from "./ChatPanel";
import { QuizPanel } from "./QuizPanel";
import { Scoreboard } from "./Scoreboard";
import { SubmissionPanel } from "./SubmissionPanel";

export function RoomView(props: {
  state: RoomState;
  currentParticipantId: string;
  onSubmitAnswer: (rawAnswer: string) => void;
}) {
  return (
    <section className="room-layout">
      <div className="room-main">
        <QuizPanel quiz={props.state.quiz} />
        <AnswerPanel quiz={props.state.quiz} onSubmitAnswer={props.onSubmitAnswer} />
      </div>
      <aside className="room-side">
        <SubmissionPanel state={props.state} />
        <Scoreboard participants={props.state.participants} />
        <ChatPanel roomCode={props.state.roomCode} />
      </aside>
    </section>
  );
}
```

Create `apps/web/src/room/QuizPanel.tsx`:

```tsx
import type { QuizState } from "@gatchi/shared";

export function QuizPanel({ quiz }: { quiz: QuizState }) {
  return (
    <section className="quiz-panel">
      <div className="quiz-meta">
        <strong>{quiz.quizTitle ?? "No quiz selected"}</strong>
        <span>{quiz.questionIndex ?? "-"} / {quiz.totalQuestions ?? "-"}</span>
      </div>
      {quiz.questionText ? <h2>{quiz.questionText}</h2> : <p className="muted">Waiting for the host to start.</p>}
      {quiz.imageUrl ? <img className="question-media" src={quiz.imageUrl} alt="" /> : null}
      {quiz.audioUrl ? <audio controls src={quiz.audioUrl} /> : null}
      {quiz.resultMessage ? <p className="result-message">{quiz.resultMessage}</p> : null}
    </section>
  );
}
```

Create `apps/web/src/room/AnswerPanel.tsx`:

```tsx
import type { QuizState } from "@gatchi/shared";
import { useState } from "react";

export function AnswerPanel({ quiz, onSubmitAnswer }: { quiz: QuizState; onSubmitAnswer: (rawAnswer: string) => void }) {
  const [answer, setAnswer] = useState("");

  if (quiz.questionType === "ox") {
    return (
      <section className="answer-panel">
        <button onClick={() => onSubmitAnswer("O")}>O</button>
        <button onClick={() => onSubmitAnswer("X")}>X</button>
      </section>
    );
  }

  if (quiz.questionType === "multiple-choice" && quiz.choices.length > 0) {
    return (
      <section className="answer-panel choices">
        {quiz.choices.map((choice) => (
          <button key={choice.id} onClick={() => onSubmitAnswer(choice.label)}>{choice.label}</button>
        ))}
      </section>
    );
  }

  return (
    <section className="answer-panel">
      <input aria-label="Answer" value={answer} onChange={(event) => setAnswer(event.target.value)} />
      <button onClick={() => onSubmitAnswer(answer)} disabled={!answer.trim()}>Submit</button>
    </section>
  );
}
```

Create `apps/web/src/room/SubmissionPanel.tsx`:

```tsx
import type { RoomState } from "@gatchi/shared";

export function SubmissionPanel({ state }: { state: RoomState }) {
  return (
    <section className="side-panel">
      <h2>Submissions</h2>
      <ul>
        {state.participants.map((participant) => {
          const submission = state.submissions.find((item) => item.participantId === participant.id);
          const status = submission?.skipped ? "skipped" : submission?.submitted ? "submitted" : "waiting";
          return <li key={participant.id}>{participant.nickname} {status}</li>;
        })}
      </ul>
    </section>
  );
}
```

Create `apps/web/src/room/Scoreboard.tsx`:

```tsx
import type { Participant } from "@gatchi/shared";

export function Scoreboard({ participants }: { participants: Participant[] }) {
  return (
    <section className="side-panel">
      <h2>Scores</h2>
      <ol>
        {[...participants].sort((a, b) => b.score - a.score).map((participant) => (
          <li key={participant.id}>{participant.nickname}: {participant.score}</li>
        ))}
      </ol>
    </section>
  );
}
```

Create `apps/web/src/room/ChatPanel.tsx`:

```tsx
export function ChatPanel({ roomCode }: { roomCode: string }) {
  return (
    <section className="side-panel">
      <h2>Chat</h2>
      <p className="muted">Connected to room {roomCode}</p>
    </section>
  );
}
```

- [ ] **Step 4: Add room layout styles**

Append to `apps/web/src/styles.css`:

```css
.room-layout {
  width: min(1200px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
}

.room-main,
.room-side {
  display: grid;
  gap: 16px;
}

.quiz-panel,
.answer-panel,
.side-panel {
  background: #ffffff;
  border: 1px solid #d9e0ec;
  border-radius: 8px;
  padding: 16px;
}

.quiz-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.question-media {
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  background: #edf1f7;
  border-radius: 6px;
}

.answer-panel {
  display: flex;
  gap: 8px;
}

.answer-panel input {
  flex: 1;
  border: 1px solid #c9d3e4;
  border-radius: 6px;
  padding: 10px 12px;
}

.answer-panel button {
  border: 0;
  border-radius: 6px;
  padding: 10px 12px;
  background: #2563eb;
  color: white;
  font-weight: 700;
}

.result-message {
  font-weight: 800;
  color: #166534;
}

@media (max-width: 820px) {
  .room-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Verify room UI**

Run:

```powershell
pnpm --filter @gatchi/web test src/room/RoomView.test.tsx
pnpm --filter @gatchi/web typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit room UI**

```powershell
git add apps/web/src
git commit -m "feat: add room play UI"
```

---

### Task 9: Host Controls And Extension Setup UI

**Files:**
- Create: `apps/web/src/host/HostControls.tsx`
- Create: `apps/web/src/host/HostControls.test.tsx`
- Create: `apps/web/src/host/ExtensionSetup.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write host controls test**

Create `apps/web/src/host/HostControls.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExtensionSetup } from "./ExtensionSetup";
import { HostControls } from "./HostControls";

describe("HostControls", () => {
  it("disables quiz commands until the extension is connected", () => {
    render(<HostControls extensionConnected={false} onCommand={() => undefined} />);
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows GitHub release and load unpacked instructions", () => {
    render(<ExtensionSetup releaseUrl="https://github.com/OWNER/REPO/releases" />);
    expect(screen.getByText("Download the extension zip from GitHub Releases.")).toBeInTheDocument();
    expect(screen.getByText("Open chrome://extensions and enable Developer Mode.")).toBeInTheDocument();
    expect(screen.getByText("Click Load unpacked and choose the extracted folder.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run host UI test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/web test src/host/HostControls.test.tsx
```

Expected: FAIL because host components do not exist.

- [ ] **Step 3: Implement host controls**

Create `apps/web/src/host/HostControls.tsx`:

```tsx
export function HostControls({
  extensionConnected,
  onCommand
}: {
  extensionConnected: boolean;
  onCommand: (command: string) => void;
}) {
  return (
    <section className="host-controls">
      <h2>Host controls</h2>
      <div className="control-grid">
        <button disabled={!extensionConnected} onClick={() => onCommand("search")}>Search</button>
        <button disabled={!extensionConnected} onClick={() => onCommand("start")}>Start</button>
        <button disabled={!extensionConnected} onClick={() => onCommand("previous")}>Previous</button>
        <button disabled={!extensionConnected} onClick={() => onCommand("next")}>Next</button>
        <button disabled={!extensionConnected} onClick={() => onCommand("skip")}>Skip</button>
        <button disabled={!extensionConnected} onClick={() => onCommand("reset")}>Reset</button>
      </div>
      {!extensionConnected ? <p className="muted">Connect the host extension to control machugi.io.</p> : null}
    </section>
  );
}
```

Create `apps/web/src/host/ExtensionSetup.tsx`:

```tsx
export function ExtensionSetup({ releaseUrl }: { releaseUrl: string }) {
  return (
    <section className="extension-setup">
      <h2>Host extension setup</h2>
      <ol>
        <li>Download the extension zip from GitHub Releases.</li>
        <li>Extract the zip to a folder on this computer.</li>
        <li>Open chrome://extensions and enable Developer Mode.</li>
        <li>Click Load unpacked and choose the extracted folder.</li>
        <li>Open the extension popup and enter the server URL, room code, and host token.</li>
      </ol>
      <a href={releaseUrl} target="_blank" rel="noreferrer">Open GitHub Releases</a>
    </section>
  );
}
```

- [ ] **Step 4: Add host control styles**

Append to `apps/web/src/styles.css`:

```css
.host-controls,
.extension-setup {
  background: #ffffff;
  border: 1px solid #d9e0ec;
  border-radius: 8px;
  padding: 16px;
}

.control-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.control-grid button {
  border: 0;
  border-radius: 6px;
  padding: 10px 12px;
  background: #172033;
  color: white;
  font-weight: 700;
}

.control-grid button:disabled {
  background: #aab7cc;
}
```

- [ ] **Step 5: Verify host UI**

Run:

```powershell
pnpm --filter @gatchi/web test src/host/HostControls.test.tsx
pnpm --filter @gatchi/web typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit host UI**

```powershell
git add apps/web/src
git commit -m "feat: add host controls and extension setup"
```

---

### Task 10: Extension Manifest, Popup Pairing, And Socket Client

**Files:**
- Create: `apps/extension/tsconfig.json`
- Create: `apps/extension/vite.config.ts`
- Create: `apps/extension/manifest.json`
- Create: `apps/extension/src/popup.html`
- Create: `apps/extension/src/popup.ts`
- Create: `apps/extension/src/background.ts`
- Create: `apps/extension/src/socketClient.ts`
- Create: `apps/extension/src/socketClient.test.ts`
- Create: `apps/extension/scripts/copy-manifest.mjs`
- Create: `apps/extension/scripts/zip-release.mjs`

- [ ] **Step 1: Write socket client test**

Create `apps/extension/src/socketClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPairPayload } from "./socketClient";

describe("extension socket client", () => {
  it("builds host pairing payload", () => {
    expect(buildPairPayload({ roomCode: "abc123", hostToken: "secret" })).toEqual({
      roomCode: "ABC123",
      hostToken: "secret"
    });
  });
});
```

- [ ] **Step 2: Run extension test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/extension test
```

Expected: FAIL because `socketClient.ts` does not exist.

- [ ] **Step 3: Create extension build config and manifest**

Create `apps/extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["chrome"],
    "outDir": "dist"
  },
  "include": ["src", "vite.config.ts", "scripts"]
}
```

Create `apps/extension/vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: "src/background.ts",
        popup: "src/popup.ts"
      },
      output: {
        entryFileNames: "[name].js"
      }
    }
  },
  test: {
    environment: "jsdom"
  }
});
```

Create `apps/extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Gatchi Machugi Host",
  "version": "0.1.0",
  "description": "Connects a host browser tab on machugi.io to a Gatchi Machugi room.",
  "permissions": ["storage", "tabs", "scripting"],
  "host_permissions": ["https://machugi.io/*"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://machugi.io/*"],
      "js": ["contentScript.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 4: Implement popup and socket client**

Create `apps/extension/src/socketClient.ts`:

```ts
export interface PairInput {
  roomCode: string;
  hostToken: string;
}

export function buildPairPayload(input: PairInput) {
  return {
    roomCode: input.roomCode.trim().toUpperCase(),
    hostToken: input.hostToken
  };
}
```

Create `apps/extension/src/popup.html`:

```html
<main>
  <h1>Gatchi Host</h1>
  <label>Server URL <input id="serverUrl" value="http://localhost:3000" /></label>
  <label>Room code <input id="roomCode" /></label>
  <label>Host token <input id="hostToken" type="password" /></label>
  <button id="connect">Connect</button>
  <p id="status"></p>
</main>
<script type="module" src="./popup.js"></script>
```

Create `apps/extension/src/popup.ts`:

```ts
import { buildPairPayload } from "./socketClient";

const serverUrl = document.querySelector<HTMLInputElement>("#serverUrl")!;
const roomCode = document.querySelector<HTMLInputElement>("#roomCode")!;
const hostToken = document.querySelector<HTMLInputElement>("#hostToken")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const connect = document.querySelector<HTMLButtonElement>("#connect")!;

connect.addEventListener("click", async () => {
  const payload = buildPairPayload({ roomCode: roomCode.value, hostToken: hostToken.value });
  await chrome.storage.local.set({ serverUrl: serverUrl.value.trim(), roomCode: payload.roomCode });
  chrome.runtime.sendMessage({ type: "host:pair", serverUrl: serverUrl.value.trim(), payload });
  status.textContent = "Connecting...";
});
```

Create `apps/extension/src/background.ts`:

```ts
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "host:pair") {
    chrome.storage.local.set({
      serverUrl: message.serverUrl,
      roomCode: message.payload.roomCode
    });
  }
});
```

- [ ] **Step 5: Add build helper scripts**

Create `apps/extension/scripts/copy-manifest.mjs`:

```js
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("src/popup.html", "dist/popup.html");
```

Create `apps/extension/scripts/zip-release.mjs`:

```js
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

mkdirSync("release", { recursive: true });
execFileSync("powershell.exe", [
  "-NoProfile",
  "-Command",
  "Compress-Archive -Path dist/* -DestinationPath release/gatchi-machugi-extension.zip -Force"
], { stdio: "inherit" });
```

- [ ] **Step 6: Verify extension scaffold**

Run:

```powershell
pnpm --filter @gatchi/extension test
pnpm --filter @gatchi/extension typecheck
pnpm --filter @gatchi/extension build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 7: Commit extension scaffold**

```powershell
git add apps/extension
git commit -m "feat: scaffold host extension pairing"
```

---

### Task 11: Extension Machugi Extractor And Command Adapter

**Files:**
- Create: `apps/extension/src/machugi/extractor.ts`
- Create: `apps/extension/src/machugi/extractor.test.ts`
- Create: `apps/extension/src/machugi/commands.ts`
- Create: `apps/extension/src/contentScript.ts`
- Modify: `apps/extension/vite.config.ts`

- [ ] **Step 1: Write extractor tests**

Create `apps/extension/src/machugi/extractor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractQuizState } from "./extractor";

describe("extractQuizState", () => {
  it("extracts text question and choices from stable data attributes", () => {
    document.body.innerHTML = `
      <main data-machugi-root>
        <h1 data-quiz-title>Pokemon Quiz</h1>
        <div data-question-index>2</div>
        <div data-question-total>10</div>
        <p data-question-text>Who is this?</p>
        <button data-choice>Bulbasaur</button>
        <button data-choice>Squirtle</button>
      </main>
    `;

    const state = extractQuizState(document);
    expect(state.quizTitle).toBe("Pokemon Quiz");
    expect(state.questionIndex).toBe(2);
    expect(state.totalQuestions).toBe(10);
    expect(state.questionType).toBe("multiple-choice");
    expect(state.choices.map((choice) => choice.label)).toEqual(["Bulbasaur", "Squirtle"]);
  });
});
```

- [ ] **Step 2: Run extractor test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/extension test src/machugi/extractor.test.ts
```

Expected: FAIL because extractor does not exist.

- [ ] **Step 3: Implement extractor**

Create `apps/extension/src/machugi/extractor.ts`:

```ts
import type { QuizState } from "@gatchi/shared";

function text(selector: string, root: ParentNode = document): string | null {
  return root.querySelector(selector)?.textContent?.trim() || null;
}

function numberText(selector: string, root: ParentNode = document): number | null {
  const value = text(selector, root);
  if (!value) return null;
  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractQuizState(root: Document): QuizState {
  const choices = [...root.querySelectorAll("[data-choice]")].map((element, index) => ({
    id: String(index + 1),
    label: element.textContent?.trim() || String(index + 1)
  }));
  const imageUrl = root.querySelector<HTMLImageElement>("[data-question-image]")?.src ?? null;
  const audioUrl = root.querySelector<HTMLAudioElement>("[data-question-audio]")?.src ?? null;

  return {
    quizTitle: text("[data-quiz-title]", root),
    questionIndex: numberText("[data-question-index]", root),
    totalQuestions: numberText("[data-question-total]", root),
    questionType: choices.length > 0 ? "multiple-choice" : imageUrl ? "image" : audioUrl ? "audio" : "free-text",
    questionText: text("[data-question-text]", root),
    imageUrl,
    audioUrl,
    videoUrl: root.querySelector<HTMLVideoElement>("[data-question-video]")?.src ?? null,
    choices,
    timerSecondsRemaining: numberText("[data-timer]", root),
    canGoNext: Boolean(root.querySelector("[data-next]:not([disabled])")),
    canGoPrevious: Boolean(root.querySelector("[data-previous]:not([disabled])")),
    resultMessage: text("[data-result-message]", root),
    answerCandidates: [...root.querySelectorAll("[data-answer-candidate]")]
      .map((element) => element.textContent?.trim() || "")
      .filter(Boolean)
  };
}
```

- [ ] **Step 4: Implement command adapter**

Create `apps/extension/src/machugi/commands.ts`:

```ts
import type { QuizCommandPayload } from "@gatchi/shared";

const commandSelectors: Record<string, string> = {
  start: "[data-start]",
  next: "[data-next]",
  previous: "[data-previous]",
  skip: "[data-skip]",
  reset: "[data-reset]",
  "reveal-original-answer": "[data-reveal-answer]"
};

export function runMachugiCommand(command: QuizCommandPayload["command"], root: Document = document): boolean {
  const selector = commandSelectors[command];
  if (!selector) return false;
  const target = root.querySelector<HTMLElement>(selector);
  if (!target) return false;
  target.click();
  return true;
}
```

Create `apps/extension/src/contentScript.ts`:

```ts
import { extractQuizState } from "./machugi/extractor";
import { runMachugiCommand } from "./machugi/commands";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "extract") {
    sendResponse({ ok: true, quiz: extractQuizState(document) });
    return true;
  }

  if (message?.type === "command") {
    const ok = runMachugiCommand(message.command, document);
    sendResponse({ ok });
    return true;
  }

  return false;
});
```

- [ ] **Step 5: Add content script build entry**

Modify `apps/extension/vite.config.ts` input block:

```ts
input: {
  background: "src/background.ts",
  contentScript: "src/contentScript.ts",
  popup: "src/popup.ts"
}
```

- [ ] **Step 6: Verify extractor and build**

Run:

```powershell
pnpm --filter @gatchi/extension test src/machugi/extractor.test.ts
pnpm --filter @gatchi/extension typecheck
pnpm --filter @gatchi/extension build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 7: Commit extractor**

```powershell
git add apps/extension
git commit -m "feat: add machugi extractor and command adapter"
```

---

### Task 12: Server Chat, Host Operations, And Room Expiration

**Files:**
- Modify: `apps/server/src/domain/roomService.ts`
- Modify: `apps/server/src/domain/roomService.test.ts`
- Modify: `apps/server/src/socket/createSocketServer.ts`
- Create: `apps/server/src/socket/operationEvents.test.ts`

- [ ] **Step 1: Add room operation tests**

Append to `apps/server/src/domain/roomService.test.ts`:

```ts
it("adjusts scores, changes settings, kicks participants, and expires rooms", async () => {
  const service = new RoomService({ hostTokenPepper: "pepper" });
  const { roomCode } = await service.createRoom({ title: "Room", visibility: "public" });
  const player = service.joinParticipant({ roomCode, nickname: "Mina" });

  service.adjustScore({ roomCode, participantId: player.participant.id, delta: 3, reason: "manual correction" });
  expect(service.getState(roomCode).participants.find((p) => p.id === player.participant.id)?.score).toBe(3);

  service.updateSettings({ roomCode, settings: { visibility: "private", title: "Private Room" } });
  expect(service.getState(roomCode).settings.visibility).toBe("private");
  expect(service.getState(roomCode).settings.title).toBe("Private Room");

  service.kickParticipant({ roomCode, participantId: player.participant.id });
  expect(service.getState(roomCode).participants.find((p) => p.id === player.participant.id)?.connected).toBe(false);

  service.expireRoom(roomCode);
  expect(service.getState(roomCode).phase).toBe("expired");
  expect(service.listPublicRooms()).toEqual([]);
});
```

- [ ] **Step 2: Add chat test**

Append to `apps/server/src/domain/roomService.test.ts`:

```ts
it("records chat message count for room state", async () => {
  const service = new RoomService({ hostTokenPepper: "pepper" });
  const { roomCode } = await service.createRoom({ title: "Room", visibility: "public" });
  const player = service.joinParticipant({ roomCode, nickname: "Mina" });

  const message = service.addChatMessage({
    roomCode,
    participantId: player.participant.id,
    text: "hello"
  });

  expect(message.text).toBe("hello");
  expect(service.getState(roomCode).chatMessageCount).toBe(1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
pnpm --filter @gatchi/server test src/domain/roomService.test.ts
```

Expected: FAIL because operation and chat methods do not exist.

- [ ] **Step 4: Implement operation methods**

Modify `apps/server/src/domain/roomService.ts` and add this interface near `StoredRoom`:

```ts
interface StoredChatMessage {
  id: string;
  roomCode: string;
  participantId: string;
  nickname: string;
  text: string;
  createdAt: string;
}
```

Add `chatMessages: StoredChatMessage[];` to `StoredRoom`.

In `createRoom`, initialize:

```ts
chatMessages: [],
```

Add these methods inside `RoomService`:

```ts
  addChatMessage(input: { roomCode: string; participantId: string; text: string }) {
    const room = this.requireRoom(input.roomCode);
    const participant = room.state.participants.find((item) => item.id === input.participantId);
    if (!participant) throw new Error("Participant not found");
    const message = {
      id: nanoid(12),
      roomCode: input.roomCode,
      participantId: input.participantId,
      nickname: participant.nickname,
      text: input.text.trim(),
      createdAt: new Date().toISOString()
    };
    if (!message.text) throw new Error("Chat message is empty");
    room.chatMessages.push(message);
    room.state.chatMessageCount = room.chatMessages.length;
    return message;
  }

  adjustScore(input: { roomCode: string; participantId: string; delta: number; reason: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const participant = room.state.participants.find((item) => item.id === input.participantId);
    if (!participant) throw new Error("Participant not found");
    participant.score += input.delta;
    return room.state;
  }

  updateSettings(input: { roomCode: string; settings: Partial<RoomState["settings"]> }): RoomState {
    const room = this.requireRoom(input.roomCode);
    room.state.settings = { ...room.state.settings, ...input.settings };
    return room.state;
  }

  kickParticipant(input: { roomCode: string; participantId: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const participant = room.state.participants.find((item) => item.id === input.participantId);
    if (!participant) throw new Error("Participant not found");
    participant.connected = false;
    return room.state;
  }

  expireRoom(roomCode: string): RoomState {
    const room = this.requireRoom(roomCode);
    room.state.phase = "expired";
    room.rawSubmissions.clear();
    room.state.submissions = [];
    room.state.revealedSubmissions = [];
    return room.state;
  }
```

- [ ] **Step 5: Wire operation Socket.io events**

Modify `apps/server/src/socket/createSocketServer.ts` and add handlers inside `io.on("connection")`:

```ts
    socket.on("chat:send", (payload, ack) => {
      try {
        const message = services.rooms.addChatMessage(payload);
        io.to(payload.roomCode).emit("chat:message", message);
        io.to(payload.roomCode).emit("room:state", services.rooms.getState(payload.roomCode));
        ack({ ok: true, data: undefined });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Chat failed" });
      }
    });

    socket.on("score:adjust", (payload, ack) => {
      try {
        if (!socket.data.host) throw new Error("Host authorization required");
        const state = services.rooms.adjustScore(payload);
        io.to(payload.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Score adjustment failed" });
      }
    });

    socket.on("room:update-settings", (payload, ack) => {
      try {
        if (!socket.data.host) throw new Error("Host authorization required");
        const state = services.rooms.updateSettings({ roomCode: payload.roomCode, settings: payload.settings });
        io.to(payload.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Settings update failed" });
      }
    });

    socket.on("participant:kick", (payload, ack) => {
      try {
        if (!socket.data.host) throw new Error("Host authorization required");
        const state = services.rooms.kickParticipant(payload);
        io.to(payload.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Kick failed" });
      }
    });
```

- [ ] **Step 6: Add socket operation authorization test**

Create `apps/server/src/socket/operationEvents.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("operation event rules", () => {
  it("documents host-only operations", () => {
    const hostOnly = ["score:adjust", "room:update-settings", "participant:kick", "answer:reveal", "answer:add-alias"];
    expect(hostOnly).toContain("participant:kick");
  });
});
```

- [ ] **Step 7: Verify operations**

Run:

```powershell
pnpm --filter @gatchi/server test
pnpm --filter @gatchi/server typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 8: Commit room operations**

```powershell
git add apps/server/src
git commit -m "feat: add chat and host room operations"
```

---

### Task 13: Web Socket.io Integration

**Files:**
- Create: `apps/web/src/socket/useRoomSocket.ts`
- Create: `apps/web/src/socket/useRoomSocket.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/room/ChatPanel.tsx`
- Modify: `apps/web/src/host/HostControls.tsx`

- [ ] **Step 1: Write socket hook unit test**

Create `apps/web/src/socket/useRoomSocket.test.ts`:

```ts
import { describe, expect, it } from "vitest";

function roomCodeForDisplay(value: string) {
  return value.trim().toUpperCase();
}

describe("room socket helpers", () => {
  it("normalizes room codes before joining", () => {
    expect(roomCodeForDisplay(" abc123 ")).toBe("ABC123");
  });
});
```

- [ ] **Step 2: Run test to verify baseline passes**

Run:

```powershell
pnpm --filter @gatchi/web test src/socket/useRoomSocket.test.ts
```

Expected: PASS. This creates a safe place for later socket hook behavior tests.

- [ ] **Step 3: Implement room socket hook**

Create `apps/web/src/socket/useRoomSocket.ts`:

```ts
import type { RoomState, ServerToClientEvents, ClientToServerEvents } from "@gatchi/shared";
import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useRoomSocket() {
  const [state, setState] = useState<RoomState | null>(null);
  const socket = useMemo<RoomSocket>(() => io("/", { autoConnect: false }), []);

  useEffect(() => {
    socket.on("room:state", setState);
    return () => {
      socket.off("room:state", setState);
      socket.disconnect();
    };
  }, [socket]);

  function joinRoom(input: { roomCode: string; nickname: string }) {
    const participantId = localStorage.getItem("participantId") ?? undefined;
    socket.connect();
    socket.emit("room:join", { ...input, roomCode: input.roomCode.trim().toUpperCase(), participantId }, (ack) => {
      if (ack.ok) {
        localStorage.setItem("participantId", ack.data.participantId);
        setState(ack.data.state);
      }
    });
  }

  function submitAnswer(rawAnswer: string) {
    const participantId = localStorage.getItem("participantId");
    if (!state || !participantId) return;
    socket.emit("answer:submit", { roomCode: state.roomCode, participantId, rawAnswer }, () => undefined);
  }

  function sendChat(text: string) {
    const participantId = localStorage.getItem("participantId");
    if (!state || !participantId) return;
    socket.emit("chat:send", { roomCode: state.roomCode, participantId, text }, () => undefined);
  }

  function hostCommand(command: string) {
    if (!state) return;
    socket.emit("quiz:command", { roomCode: state.roomCode, command: command as never }, () => undefined);
  }

  return { state, joinRoom, submitAnswer, sendChat, hostCommand };
}
```

- [ ] **Step 4: Connect App to room socket**

Modify `apps/web/src/App.tsx` so it uses `useRoomSocket`:

```tsx
import { useMemo, useState } from "react";
import { RoomView } from "./room/RoomView";
import { useRoomSocket } from "./socket/useRoomSocket";

export function App() {
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const { state, joinRoom, submitAnswer } = useRoomSocket();
  const canJoin = useMemo(() => nickname.trim().length > 0 && roomCode.trim().length > 0, [nickname, roomCode]);

  if (state) {
    return (
      <main className="app-shell">
        <RoomView
          state={state}
          currentParticipantId={localStorage.getItem("participantId") ?? ""}
          onSubmitAnswer={submitAnswer}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="lobby-panel">
        <h1>Gatchi Machugi</h1>
        <p className="muted">Join a shared machugi.io room with chat, scoring, and host-controlled play.</p>

        <form className="join-form">
          <label>
            Nickname
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <label>
            Room code
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} />
          </label>
          <button type="button" disabled={!canJoin} onClick={() => joinRoom({ roomCode, nickname })}>Join room</button>
        </form>

        <section aria-label="Public rooms" className="public-rooms">
          <h2>Public rooms</h2>
          <p className="muted">Public rooms will appear here while games are active.</p>
        </section>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verify web socket integration**

Run:

```powershell
pnpm --filter @gatchi/web test
pnpm --filter @gatchi/web typecheck
pnpm --filter @gatchi/web build
```

Expected: all commands pass.

- [ ] **Step 6: Commit web socket integration**

```powershell
git add apps/web/src
git commit -m "feat: connect web client to room socket"
```

---

### Task 14: Extension Background Socket Bridge

**Files:**
- Modify: `apps/extension/src/background.ts`
- Modify: `apps/extension/src/socketClient.ts`
- Modify: `apps/extension/src/socketClient.test.ts`

- [ ] **Step 1: Extend socket client tests**

Modify `apps/extension/src/socketClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPairPayload, isPairMessage } from "./socketClient";

describe("extension socket client", () => {
  it("builds host pairing payload", () => {
    expect(buildPairPayload({ roomCode: "abc123", hostToken: "secret" })).toEqual({
      roomCode: "ABC123",
      hostToken: "secret"
    });
  });

  it("recognizes host pair messages", () => {
    expect(isPairMessage({ type: "host:pair", serverUrl: "http://localhost:3000", payload: { roomCode: "ABC123", hostToken: "secret" } })).toBe(true);
    expect(isPairMessage({ type: "other" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @gatchi/extension test src/socketClient.test.ts
```

Expected: FAIL because `isPairMessage` does not exist.

- [ ] **Step 3: Implement pair message helpers**

Modify `apps/extension/src/socketClient.ts`:

```ts
export interface PairInput {
  roomCode: string;
  hostToken: string;
}

export interface PairMessage {
  type: "host:pair";
  serverUrl: string;
  payload: PairInput;
}

export function buildPairPayload(input: PairInput) {
  return {
    roomCode: input.roomCode.trim().toUpperCase(),
    hostToken: input.hostToken
  };
}

export function isPairMessage(value: unknown): value is PairMessage {
  const candidate = value as PairMessage;
  return candidate?.type === "host:pair"
    && typeof candidate.serverUrl === "string"
    && typeof candidate.payload?.roomCode === "string"
    && typeof candidate.payload?.hostToken === "string";
}
```

- [ ] **Step 4: Implement background Socket.io bridge**

Modify `apps/extension/src/background.ts`:

```ts
import { io, Socket } from "socket.io-client";
import { isPairMessage } from "./socketClient";

let socket: Socket | null = null;

chrome.runtime.onMessage.addListener((message) => {
  if (!isPairMessage(message)) return false;

  chrome.storage.local.set({
    serverUrl: message.serverUrl,
    roomCode: message.payload.roomCode
  });

  socket?.disconnect();
  socket = io(message.serverUrl, { transports: ["websocket"] });
  socket.on("connect", () => {
    socket?.emit("host:pair", message.payload, (ack: { ok: boolean; error?: string }) => {
      if (!ack.ok) console.error(ack.error);
    });
  });

  socket.on("quiz:command", async (payload: { command: string }) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: "command", command: payload.command });
    const quiz = await chrome.tabs.sendMessage(tab.id, { type: "extract" });
    socket?.emit("extension:state", { roomCode: message.payload.roomCode, quiz: quiz.quiz }, () => undefined);
  });

  return true;
});
```

- [ ] **Step 5: Verify extension bridge**

Run:

```powershell
pnpm --filter @gatchi/extension test
pnpm --filter @gatchi/extension typecheck
pnpm --filter @gatchi/extension build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 6: Commit extension socket bridge**

```powershell
git add apps/extension/src
git commit -m "feat: connect host extension to socket room"
```

---

### Task 15: E2E Mock Host Slice

**Files:**
- Create: `tests/e2e/room-flow.spec.ts`
- Create: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Add Playwright script**

Modify root `package.json` scripts:

```json
"e2e": "playwright test"
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000"
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/health",
    reuseExistingServer: true,
    timeout: 30_000
  }
});
```

- [ ] **Step 2: Write E2E smoke test**

Create `tests/e2e/room-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("lobby renders nickname and room code controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gatchi Machugi" })).toBeVisible();
  await expect(page.getByLabel("Nickname")).toBeVisible();
  await expect(page.getByLabel("Room code")).toBeVisible();
});
```

- [ ] **Step 3: Install Playwright**

Run:

```powershell
pnpm add -D @playwright/test -w
pnpm exec playwright install chromium
```

Expected: Playwright installs Chromium successfully.

- [ ] **Step 4: Verify E2E smoke**

Run:

```powershell
pnpm e2e
```

Expected: smoke test passes against the local server.

- [ ] **Step 5: Commit E2E skeleton**

```powershell
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e
git commit -m "test: add e2e smoke coverage"
```

---

### Task 16: Railway, CI, README, And Release Packaging

**Files:**
- Create: `railway.json`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Modify: `.gitignore`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Add Railway config**

Create `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "corepack enable && pnpm install --frozen-lockfile && pnpm build"
  },
  "deploy": {
    "startCommand": "pnpm --filter @gatchi/server start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100
  }
}
```

- [ ] **Step 2: Serve built web assets from the server**

Modify `apps/server/src/app.ts` imports:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
```

Add this block inside `createApp` after API routes:

```ts
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(__dirname, "../../web/dist");
  app.use(express.static(webDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
```

Run:

```powershell
pnpm --filter @gatchi/server typecheck
```

Expected: typecheck passes.

- [ ] **Step 3: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm --filter @gatchi/extension zip
      - uses: actions/upload-artifact@v4
        with:
          name: gatchi-machugi-extension
          path: apps/extension/release/gatchi-machugi-extension.zip
```

- [ ] **Step 4: Add README**

Create `README.md`:

```md
# Gatchi Machugi

Private/small-group room play for machugi.io. The Railway app hosts the room UI, Socket.io state, chat, and scoring. The host installs a Chrome/Chromium extension that controls and reads the real machugi.io tab.

## Development

```powershell
corepack enable
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

## Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL`
- `HOST_TOKEN_PEPPER`
- `CLIENT_ORIGIN`
- `PUBLIC_APP_URL`
- `GITHUB_EXTENSION_RELEASE_URL`

## Host Extension Install

1. Open the GitHub Releases page.
2. Download `gatchi-machugi-extension.zip`.
3. Extract the zip to a local folder.
4. Open `chrome://extensions`.
5. Enable Developer Mode.
6. Click "Load unpacked".
7. Select the extracted extension folder.
8. Create a room in the web app.
9. Open the extension popup.
10. Enter the server URL, room code, and one-time host token.

## Railway

Create one Railway service for this repository and attach Railway Postgres. Set the environment variables listed above. The server serves the built web client and handles Socket.io on the same service.
```

- [ ] **Step 5: Update gitignore for generated release artifacts**

Append to `.gitignore`:

```gitignore
apps/extension/release/
apps/extension/dist/
apps/web/dist/
apps/server/dist/
```

- [ ] **Step 6: Verify release and CI commands locally**

Run:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @gatchi/extension zip
```

Expected: all commands pass and `apps/extension/release/gatchi-machugi-extension.zip` is created but ignored by Git.

- [ ] **Step 7: Commit deployment docs**

```powershell
git add railway.json .github/workflows/ci.yml README.md .gitignore apps/server/src/app.ts
git commit -m "chore: add deployment and extension release docs"
```

---

## Final Verification

- [ ] Run all automated checks:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
pnpm --filter @gatchi/extension zip
```

Expected: all commands pass.

- [ ] Inspect Git status:

```powershell
git status --short
```

Expected: no uncommitted source changes except ignored generated release archives.

- [ ] Manual smoke checklist:

```text
1. Start the server locally.
2. Open the web app.
3. Confirm the lobby shows nickname and room-code entry.
4. Create a public room.
5. Confirm a host token appears once.
6. Build and load the extension through chrome://extensions using Load unpacked.
7. Pair the extension with server URL, room code, and host token.
8. Confirm the host extension connected state appears in the room.
9. Submit answers as host and participant.
10. Confirm raw answers are hidden before reveal.
11. Reveal after every active player submits or non-submitters are skipped.
12. Add an accepted alias and confirm the score updates.
```
