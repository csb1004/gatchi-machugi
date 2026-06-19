# Origin Window Render Design

## Goal

Replace the host iframe-centered flow with a source-window flow.

`machugi.io` opens selected quizzes in a new browser window or tab instead of navigating inside the embedded iframe. Gatchi Machugi should treat that original window as the source of quiz truth and render the actual room experience in our own UI for both host and participants.

The original `machugi.io` window remains useful, but only as the source and judge:

- the extension reads current problem content from it,
- the extension submits the host answer to it only after everyone has submitted in Gatchi Machugi,
- the extension reads the original result and answer candidates from it,
- and the Gatchi Machugi app renders the shared room UI.

## Chosen Approach

Use the Chrome extension to track the active `machugi.io` source window and stream extracted quiz state into the Socket.io room.

The host no longer operates an iframe as the primary room screen. Instead:

1. The host creates or joins a room in Gatchi Machugi.
2. The host extension pairs to the room with the existing room code and host code flow.
3. The host opens `machugi.io` normally.
4. If `machugi.io` opens a quiz in a new window or tab, the extension detects and binds that new source window to the room.
5. The extension extracts question text, media URLs, choices, progress, and result text from the source window.
6. The server broadcasts the extracted state to everyone.
7. The web app renders the question using Gatchi Machugi components for both host and participants.

This keeps the original site available for judging while avoiding the iframe/new-window mismatch.

## Architecture

### Web App

The host workspace changes from "embedded original page" to "source window status plus room UI."

Host users see the same quiz display as participants, with extra controls/status:

- room code,
- extension connected state,
- source window connected state,
- current source URL or quiz title when available,
- submitted count,
- original submission lock state,
- retry/save extension pairing button,
- and a button or instruction to open `machugi.io`.

The iframe is removed from the primary host flow. If kept at all, it is a debug-only fallback and not part of the MVP behavior.

The existing `QuizPanel` becomes the main rendering surface. It should render:

- text questions,
- image questions,
- audio questions,
- video questions,
- O/X questions,
- multiple-choice choices,
- free-text prompts,
- result message,
- and answer candidates after reveal.

### Extension

The extension becomes responsible for source-window discovery.

It should track:

- the Gatchi Machugi app tab that supplied pairing settings,
- the active paired room,
- the current `machugi.io` source tab/window/frame,
- whether the source is on search/list/detail/playing/result screen,
- and whether original submit controls are locked or allowed.

The content script still runs on `machugi.io`, but the background script no longer requires the source page to be inside the app tab. Any valid `machugi.io` tab or popup can become the current source when:

- it sends a ready/state message,
- it is created from another `machugi.io` page,
- it contains an active quiz state,
- or the host explicitly selects it via extension popup if automatic detection is ambiguous.

The extension continues to block original submission and next/advance actions before server authorization.

### Server

The server remains the room source of truth.

It stores current extracted quiz state in `RoomState.quiz`, submission status, fair-play status, and score. It does not persist copied quiz assets or full quiz bodies beyond the active room state.

The server should receive source-window state only from the currently paired extension socket. Superseded extension sockets must not mutate room quiz state, request original submission, or send original results.

## Data Flow

### Pairing

1. Host creates a room.
2. Web app sends pairing settings to the extension bridge.
3. Extension joins the Socket.io room as the host extension.
4. Web app shows extension connected but source window missing until a `machugi.io` source is detected.

### Source Window Binding

1. Host opens `machugi.io`.
2. Host searches/selects a quiz normally.
3. If the quiz opens in a new window/tab, the extension content script in that window reports ready/state.
4. Background script chooses it as the current source window for the paired room.
5. Background forwards extracted state to the server.
6. Server broadcasts `room:state`.
7. Web app renders the problem in Gatchi Machugi UI.

If multiple `machugi.io` tabs are open, active playing/result pages should win over search/list pages. If ambiguity remains, the extension popup can expose a "use this tab" action.

### Question Round

1. Extension detects an active question in the source window and sends quiz state.
2. Server creates a question key and resets submissions.
3. Host and participants answer in Gatchi Machugi.
4. Extension keeps original submit/next blocked in the source window.
5. When all required participants submit, server authorizes original submission.
6. Extension fills and submits the host answer in the source window.
7. Extension reads result message and answer candidates.
8. Server reveals, scores, and broadcasts the result.
9. Host may advance the original source window to the next question.
10. New extracted question state starts the next round.

## UI Behavior

### Host

The host should not need to look at the original source window during normal play, except to open/search/select the quiz.

Primary host screen:

- shared Gatchi Machugi quiz view,
- answer panel,
- submission panel,
- score and chat,
- source window status,
- extension setup status.

The host may keep the original `machugi.io` window on another monitor or behind the app. If source extraction fails, the app should show a clear Korean status and tell the host to bring/open the original quiz window.

### Participants

Participants only see Gatchi Machugi.

They never need the extension and never see the original source window. They see extracted text/media and answer through our UI.

### Extension Popup

The popup should become more useful:

- show connected room code,
- show whether a source `machugi.io` window is bound,
- show the current source URL/title,
- expose "use current machugi.io tab as source" when needed,
- and keep manual host code entry as a fallback, not the primary flow.

## Error Handling

- If no source window is found, show "마추기아이오 원본 창을 열어주세요."
- If multiple possible source windows exist, prefer the one with active question/result state; otherwise ask the host to select via popup.
- If source DOM extraction fails, send an unsupported state instead of stale quiz data.
- If automatic original submission fails, report failure to the server so the room returns to retryable `ready`.
- If result extraction times out, report failure to the server and let the host retry.
- If source window closes, keep the room alive but mark source disconnected; do not expire the room unless the host extension socket disconnects.
- If the host extension disconnects, keep the existing MVP behavior of expiring the room.

## Testing

Automated tests should cover:

- extension binding to a `machugi.io` tab that is not inside the app tab,
- source binding preference for active question/result pages,
- stale source windows not mutating the room after a newer source is bound,
- web host workspace without iframe,
- `QuizPanel` rendering extracted text/image/audio/video/choice states,
- fair-play lock still blocking original controls in the source window,
- retry after original submission failure,
- stale extension socket rejection,
- and Korean source/extension status copy.

Browser/manual verification should include:

- host creates room,
- extension auto-saves pairing,
- host opens `machugi.io`,
- selecting a quiz opens a new original window/tab,
- extension binds the new window,
- host and participant both see the same Gatchi Machugi-rendered problem,
- host cannot reveal original answer early,
- all participants submit,
- extension submits the host answer to original,
- original result is read back,
- scores update,
- and next question starts a new locked round.

## Out Of Scope

- Directly scraping or reverse-engineering private `machugi.io` APIs on the server.
- Persisting quiz bodies/media permanently in Gatchi Machugi.
- Rebuilding `machugi.io` search/list pages fully in our web app.
- Supporting participants without Socket.io room state.
- Removing the original source window entirely.
- Supporting every future `machugi.io` DOM variant without extension updates.

## Implementation Style

The implementation should be done first, then reviewed as a whole, then fixed based on that review. Intermediate reviews should be limited to verification failures or blockers, matching the user's requested workflow.
