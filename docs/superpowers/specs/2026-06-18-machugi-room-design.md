# Machugi Room Play Design

## Summary

Build a private/small-group web app for playing machugi.io quizzes together in rooms. The host uses the web app as the main control surface, while a Chrome/Chromium Manifest V3 extension installed on the host browser reads and controls the real machugi.io tab. All players, including the host, see the quiz in the app's own shared UI format.

The app is not a public quiz-content platform. Quiz content extracted from machugi.io is used only for the active room, stored as temporary room cache, and deleted when the room ends or expires.

## Goals

- Let a host create a room and run a machugi.io quiz with other players.
- Show host and participants the same app-native quiz screen format.
- Support real-time room state, chat, scoreboards, submissions, and host controls.
- Use Socket.io rooms for all live synchronization.
- Use a Chrome/Chromium extension to interact with machugi.io and report quiz state.
- Support automatic scoring with answer normalization and host-provided aliases.
- Deploy the web/server app as a single Railway service backed by Railway Postgres.
- Manage the web app, server, shared types, and extension in one GitHub repository.

## Non-Goals

- No Chrome Web Store distribution in the MVP.
- No public large-scale service positioning in the MVP.
- No permanent server-side cache of machugi.io quiz content.
- No account login system in the MVP.
- No guaranteed full recovery of an active game after server restart.
- No automatic support for every future machugi.io DOM change.

## Architecture

Use a monorepo:

- `apps/web`: Vite React client for lobby, room, host controls, quiz view, chat, scoreboard, and extension setup guidance.
- `apps/server`: Express app with REST APIs, Socket.io, room state, static web serving, and Prisma/Postgres access.
- `apps/extension`: Chrome/Chromium Manifest V3 extension for machugi.io control and DOM extraction.
- `packages/shared`: shared TypeScript types, Socket.io event schemas, room models, quiz state models, and normalization helpers.

Railway runs one app server. The server serves the built web client, exposes REST endpoints, and hosts Socket.io. Railway Postgres stores durable metadata and snapshots. Fast-changing room state stays in server memory and is broadcast through Socket.io rooms.

The host creates a room in the web app, installs/connects the extension, and then controls quiz flow from the web app. The server sends host commands to the extension socket. The extension manipulates the machugi.io tab, extracts current quiz state, and emits state updates back to the server. The server broadcasts normalized room state to host and participant browsers.

## Room Creation And Permissions

When a room is created, the server generates:

- `roomCode`: short participant-facing room code.
- `hostToken`: secret host token shown once after creation.

Participants join with `roomCode` and a nickname. The extension must submit `hostToken` to join the room with host authority. The server stores only an Argon2id hash of `hostToken`, never the plaintext token.

Host-only events must require either:

- a socket already verified as the room host, or
- a validated host session derived from the one-time host token pairing flow.

Host-only events include quiz search, quiz selection, quiz start, next/previous question, skip, revert, original answer submission, answer reveal, room settings updates, participant kick, score adjustment, answer alias registration, timer configuration, round reset, and public/private room changes.

## Lobby And Join Flow

The first screen shows:

- a public room list,
- direct room-code entry,
- room creation,
- extension setup access for hosts.

Public rooms appear in the lobby with room title, current quiz name when available, participant count, state, and visibility. Private rooms do not appear in the public list and are joinable only by room code.

Before entering any room, a user must set a nickname. On join, the client stores a generated `participantId` in local storage. If the browser reconnects, the server uses that id to restore the user's score and submission state where possible. Nickname collisions are handled by automatically appending a numeric suffix, such as `name#2`.

## Extension Distribution And Setup

The extension lives in `apps/extension` and is published through GitHub Releases for MVP use. Each release includes a built extension zip. The zip contains the unpacked extension build folder that the host can select through Chrome's "Load unpacked" flow after extracting it.

Host setup flow:

1. Open the app and create a room.
2. Copy or view the one-time `hostToken`.
3. Open the GitHub release link from the app.
4. Download the extension zip.
5. Unzip it locally.
6. Open `chrome://extensions`.
7. Enable Developer Mode.
8. Click "Load unpacked".
9. Select the unzipped extension folder.
10. Open the extension popup and enter the server URL, `roomCode`, and `hostToken`.

The app's host setup screen and the repository README should both show these instructions. After successful pairing, the web app shows the extension connection state in real time. The extension should not display the plaintext host token again after pairing.

## Quiz Search And Selection

The host searches from the web app. The server emits a `quiz:search` command to the verified extension socket. The extension opens or controls machugi.io search, reads the result list, and returns minimal metadata:

- title,
- thumbnail URL when available,
- short description/tags when available,
- quiz id or URL,
- approximate problem count when available.

The server broadcasts results to the room. The host chooses a quiz in the web app. The server sends `quiz:select` to the extension, and the extension navigates the machugi.io tab.

If search fails, the host can paste a machugi.io quiz URL or id. URL/id fallback is part of the MVP.

## Quiz Control

The host primarily controls the quiz from the app, not from the machugi.io tab. Host controls include:

- search and select quiz,
- configure timer,
- configure problem count/order when machugi.io supports it,
- start round,
- next question,
- previous question or revert,
- skip question,
- submit/reveal original answer,
- reset round,
- end room,
- update room title,
- switch public/private visibility.

The extension translates these commands into machugi.io tab interactions and then emits a fresh extracted state.

## Quiz State Extraction

The extension reports progression state to the server, including:

- quiz title,
- current problem index,
- total problem count when available,
- detected question type,
- problem text,
- image URL,
- audio URL,
- video or media metadata when available,
- choices for O/X or multiple choice,
- timer state,
- original button availability,
- next/previous availability,
- result message such as correct/incorrect,
- original answer candidates when visible.

The extension should avoid sending broad DOM snapshots in production MVP events. Selector logic should be isolated behind a small extraction layer so future machugi.io markup changes are easier to repair.

## Quiz Rendering And Temporary Cache

The app renders extracted content in its own UI format. It does not show machugi.io as an iframe in the room play surface.

Supported display types:

- image question,
- audio question,
- text question,
- O/X answer controls,
- multiple-choice answer controls,
- free-text answer input.

Question type is automatically inferred by the extension. The host can manually override the current question type. If inference fails, the app falls back to free-text input.

The server keeps a room-level temporary cache for extracted quiz content and media metadata. This cache exists only to support active room play, reconnects, and synchronization. It is deleted when the room ends or expires. The MVP does not keep a permanent quiz-content cache for reuse.

## Submissions And Fairness

All players, including the host, submit answers through the app UI. Submission status is visible in a side panel, but answer contents are hidden until answer reveal or scoring begins. The host cannot see participant answer contents before reveal.

The default submission visibility is "submission status only". A stricter room setting may hide submission status from participants. The MVP does not include a mode that reveals answer contents immediately after submission, because that conflicts with the fairness requirement.

The host must submit their own answer before revealing answers. Answer reveal is allowed only after every active player has submitted, or after the host explicitly marks remaining non-submitters as skipped for the current question. Before reveal, no user, including the host, can see submitted answer contents.

## Scoring And Answer Normalization

Scoring uses both:

- original result/answer information extracted by the extension, and
- the app's own scoring normalization layer.

Before comparison, both submitted answers and answer candidates are normalized by:

- removing whitespace,
- trimming leading/trailing whitespace,
- optionally applying case normalization where applicable.

For example, `텅 비드` and `텅비드` are treated as the same answer.

The host can add accepted answers and aliases for the current question after reveal. When a new alias is added, the server re-scores existing submissions immediately and broadcasts the updated result and scoreboard.

The default scoring rule is +1 for each correct answer. Host score adjustments are supported for subjective or ambiguous answers. More advanced scoring, such as fastest-answer bonus, is a later enhancement.

## Chat And System Messages

Each room has real-time chat over Socket.io. Chat messages are persisted to Postgres. System events appear in the same timeline with distinct styling. System events include:

- participant joined,
- participant left,
- host extension connected,
- host extension disconnected,
- quiz selected,
- round started,
- answer revealed,
- score adjusted,
- room settings changed.

## Room Operations

Host operations include:

- kick participant,
- adjust score,
- change current question type,
- add answer alias,
- skip/revert problem,
- set timer,
- set problem count/order when supported,
- reset round,
- change public/private visibility,
- change room title.

Every host operation requires host authorization on the server.

## Data Storage

Postgres stores:

- room metadata,
- public/private room visibility,
- `hostToken` hash,
- participant records,
- chat logs,
- score snapshots,
- room settings,
- temporary cache metadata,
- room lifecycle timestamps.

Rooms expire automatically 12 hours after creation. A room also expires 30 minutes after the host ends it or after the verified host extension disconnects without reconnecting. Expiration deletes temporary quiz-content cache and marks the room unavailable for new joins.

Server memory stores:

- current active room state,
- connected socket ids,
- live submission state,
- current extracted quiz state,
- transient command correlation ids,
- extension connection state.

If the server restarts, live state may be lost. The app should show affected rooms as ended or requiring restart/recovery. Full live recovery is not required for MVP.

## Socket.io Events

Representative event groups:

- `room:create`, `room:join`, `room:leave`, `room:state`
- `host:pair`, `host:connected`, `host:disconnected`
- `quiz:search`, `quiz:search-results`, `quiz:select`
- `quiz:configure`, `quiz:start`, `quiz:next`, `quiz:previous`, `quiz:skip`, `quiz:reset`
- `extension:state`, `extension:error`
- `answer:submit`, `answer:reveal`, `answer:add-alias`
- `score:update`, `score:adjust`
- `chat:send`, `chat:message`, `chat:system`
- `room:update-settings`, `participant:kick`

Final implementation should define typed payloads in `packages/shared` and validate server inputs before applying state changes.

## Error Handling

If the extension is not connected, host controls that require machugi.io interaction are disabled. The room remains joinable and chat still works.

If the extension disconnects mid-game, the server broadcasts a waiting state. Participants see that the room is waiting for the host extension. Host controls are disabled until reconnection.

If extraction fails, the extension emits `extension:error` with a stage and human-readable reason. The app offers retry and fallback controls where possible:

- URL/id paste fallback for search,
- manual question type override,
- free-text answer fallback,
- skip problem,
- restart round.

## Deployment

The MVP deployment target is Railway:

- one app service for Express, Socket.io, and static web serving,
- Railway Postgres for durable metadata,
- environment variables for database URL, token hashing configuration, session secrets, and allowed origins.

The extension is not deployed to Railway. It is built and published as a GitHub Release artifact.

## Testing Plan

Server tests:

- room creation,
- `hostToken` hashing and verification,
- host-only event authorization,
- participant join/reconnect,
- chat persistence,
- submission visibility rules,
- answer normalization,
- alias-based re-scoring,
- manual score adjustment,
- room public list filtering.

Web tests:

- public lobby,
- nickname before room entry,
- room-code join,
- host room creation,
- extension setup instructions,
- extension connection state,
- host controls,
- answer submission,
- submission panel fairness,
- answer reveal,
- scoreboard updates,
- chat updates.

Extension tests:

- popup pairing flow,
- Socket.io connection,
- machugi.io search command,
- quiz selection command,
- quiz state extraction,
- command-to-DOM interaction layer,
- extraction failure events.

End-to-end tests should use a mock host adapter for stable automation of the main room flow. Real machugi.io + extension testing should be a smoke/manual checklist because the external site can change independently.

## Risks And Mitigations

- machugi.io DOM changes can break extraction. Mitigate by isolating selectors and surfacing clear extension errors.
- Re-rendering extracted content in the app can create content-rights risk. Mitigate by limiting use to small/private rooms, temporary cache only, no permanent content storage, and clear non-public MVP framing.
- Host token leakage could grant host control. Mitigate by one-time display, hashed storage, host socket/session verification, and room reset controls.
- Server memory state can be lost on restart. Mitigate by documenting MVP limitation and persisting enough metadata to show a clean recovery state.
- Extension installation is friction. Mitigate with GitHub Release zip, clear in-app instructions, and README setup steps.
