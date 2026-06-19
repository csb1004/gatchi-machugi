# Iframe Host Lock Design

## Goal

Add a host experience where the host can operate the original `machugi.io` site inside the Gatchi Machugi room screen, while the existing extension enforces fair play.

The host should be able to use the original search, quiz list, quiz detail, and play UI. During an active question, the extension must prevent the host from submitting to `machugi.io` or advancing to the next question until every required player, including the host, has submitted in Gatchi Machugi.

## Chosen Approach

Use a host-only `machugi.io` iframe inside the web app, controlled and observed by the existing Chrome extension.

- The web app renders a host-only iframe pointing at `https://machugi.io/`.
- The extension injects a content script into both the Gatchi Machugi web app frame and every `machugi.io` frame by using `all_frames`.
- The extension background script acts as the bridge between:
  - the Gatchi Machugi room app,
  - the `machugi.io` iframe content script,
  - and the Socket.io room server.
- Participants do not receive the original iframe. They continue to see the mirrored quiz state in the Gatchi Machugi UI.

This keeps the host's search and quiz selection experience close to the original site while avoiding the unreliable cross-origin iframe control that the web app cannot perform directly.

## Architecture

### Web App

The room screen changes for host users:

- Replace the current command-heavy host controls with a host workspace.
- The host workspace contains:
  - a `machugi.io` iframe,
  - extension connection status,
  - room code,
  - submission status,
  - fair-play lock state,
  - and a minimal fallback/setup panel when the extension is missing.
- The existing participant room layout keeps the mirrored quiz, answer panel, submission panel, chat, and score UI.

The web app must not attempt to read or control the iframe DOM directly. It only talks to the extension bridge.

### Extension

The extension gains a frame-aware bridge:

- A web-app bridge content script runs on the Gatchi Machugi app origin.
- A `machugi.io` content script runs inside the iframe and top-level `machugi.io` tabs.
- The background script tracks which tab/frame owns the current host room.
- The background script forwards extracted quiz state to Socket.io.
- The background script forwards fair-play commands from the server or web app to the correct `machugi.io` frame.

The extension popup remains a setup/status surface. It should not require the user to manually copy a hidden host token.

### Server

The server remains the source of truth for room membership, submissions, score, and phase.

It adds or tightens state needed for fair-play locking:

- who is required to submit for the current question,
- whether all required submissions are complete,
- whether the host is allowed to submit to original `machugi.io`,
- and whether the original result has already been opened.

Host-only events continue to require a verified host session.

## Fair-Play Lock

When the extension detects an active question, it enters locked mode.

Locked mode blocks:

- original `machugi.io` answer submit buttons,
- Enter-key text submission,
- O/X or multiple-choice direct submit actions if those immediately reveal the result,
- next/skip buttons,
- and any obvious keyboard shortcut that advances the quiz.

The host submits their answer through Gatchi Machugi, not through the original site. This keeps the host from seeing the original answer early.

After all required players have submitted:

1. The server marks original submission as allowed.
2. The host UI enables "submit to original".
3. The extension fills the host answer into the original `machugi.io` UI when possible.
4. The extension clicks the original submit action.
5. The extension reads result text and answer candidates from the original result screen.
6. The server reveals and scores the round.
7. The extension allows the next-question action.

If automatic fill is not reliable for a question type, the extension keeps the original submit controls blocked and shows a clear instruction that the host must use the extension overlay/action, not the underlying original controls.

## Data Flow

### Pairing

1. Host creates or enters a room in the web app.
2. Web app stores room pairing information for the extension bridge.
3. Extension reads the pairing information from the web app bridge.
4. Extension joins the Socket.io room as host.
5. Extension binds the visible `machugi.io` iframe frame to that room.

### Quiz Selection

1. Host searches and selects quizzes inside the iframe.
2. `machugi.io` content script observes route and DOM changes.
3. Extension extracts page/quiz state.
4. Extension sends state to the server.
5. Server broadcasts room state.
6. Participants see mirrored state in the app.

### Question Round

1. Extension detects an active question and sends question state.
2. Server resets submissions for that question.
3. Extension locks original submit and next controls.
4. Players and host submit through Gatchi Machugi.
5. Server checks all required submissions.
6. Server authorizes original submission.
7. Extension submits the host answer to original `machugi.io`.
8. Extension reads original result and answer candidates.
9. Server scores and reveals.
10. Extension unlocks next.

## UI Behavior

### Host

The host sees the original site in a large iframe. The room UI around it should be minimal and Korean-first:

- room code,
- extension status,
- participant/submission count,
- current lock state,
- and setup instructions only when needed.

The old remote-control button grid should be removed from the primary host flow. A hidden or compact debug fallback may remain during MVP development, but it should not be the normal UI.

### Participants

Participants do not interact with the original iframe.

They see:

- mirrored question content,
- their own answer input,
- submission status,
- chat,
- score,
- and revealed results only after the server releases them.

### Extension Overlay

The extension may show a small overlay inside the `machugi.io` iframe when needed:

- locked until everyone submits,
- submitted count,
- submit to original,
- next allowed,
- connection problem,
- or unsupported page/question type.

The overlay should avoid covering the main question content.

## Error Handling

- If `machugi.io` cannot be framed, fall back to opening a real `machugi.io` tab and use the same extension locking model there.
- If the extension is missing, the host workspace shows setup instructions and disables fair-play play.
- If the extension cannot identify the active iframe, show a Korean "machugi.io screen not found" message and provide a retry.
- If automatic original submission fails, keep the lock active and show a host action that retries or explains the unsupported case.
- If the host disconnects, the room expires using the existing host-disconnect behavior.
- If `machugi.io` changes DOM selectors, extraction should degrade to an unsupported state instead of silently scoring incorrectly.

## Testing

Automated tests should cover:

- frame-aware extension message routing,
- iframe host workspace rendering,
- lock-state server transitions,
- prevention of original submit/next while locked,
- unlock only after all required submissions,
- extraction of result text and answer candidates,
- fallback when iframe rendering is unavailable,
- and Korean setup/status copy.

Browser verification should include:

- host creating a room,
- extension pairing without manual hidden token entry,
- `machugi.io` loading inside the host iframe,
- search and quiz selection inside the iframe,
- a live question mirrored to a participant browser,
- host submit blocked before all players submit,
- original submission allowed after all players submit,
- original result read back into Gatchi Machugi,
- and next question locked until reveal is complete.

## Out of Scope For This Change

- Rebuilding the entire `machugi.io` search/list UI in Gatchi Machugi.
- Requiring participants to install the extension.
- Real-time video/screen sharing.
- Full support for every unknown future `machugi.io` quiz page variant.
- Public production hardening beyond the Railway single-server MVP model already chosen.
