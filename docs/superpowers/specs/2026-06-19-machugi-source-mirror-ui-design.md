# Machugi Source Mirror UI Design

## Summary

Build the next MVP slice as a source mirror UI.

The room screen should not feel like a small control panel that happens to drive a separate `machugi.io` tab. Instead, the main Gatchi Machugi play surface should become a custom UI version of the original `machugi.io` flow:

1. search,
2. search results,
3. quiz selection,
4. basic quiz settings,
5. quiz play,
6. result/reveal.

The real `machugi.io` tab still exists behind the scenes. The host extension reads that tab, turns the current source page into typed mirror state, and performs DOM actions when the host uses the Gatchi Machugi UI. Participants receive the same mirror state through the Socket.io room and follow the host view in real time.

## Goals

- Replace the host-facing command panel with a real app-native mirror screen for the main flow.
- Let the host search, choose a quiz, configure basic options, and start play from Gatchi Machugi.
- Keep the original `machugi.io` tab as the source of truth for page navigation, quiz judging, and answer/result extraction.
- Keep the current fairness model: everyone, including the host, answers in Gatchi Machugi before original submission/reveal.
- Keep Socket.io rooms as the only live synchronization layer.
- Store only active-room transient mirror state; do not create a permanent quiz-content cache.
- Preserve fallback paths when the external site markup cannot be controlled reliably.

## Non-Goals

- Do not attempt a pixel-perfect clone of every `machugi.io` screen in this MVP.
- Do not scrape private APIs from the server.
- Do not remove the original source tab; it remains required for judging and DOM control.
- Do not support every future `machugi.io` markup change without extension updates.
- Do not build account, publishing, or public quiz archive features.
- Do not make the old host command panel the primary UX. It may remain only as a debug or fallback surface if useful.

## Chosen Approach

Use a phased app-native mirror UI.

The extension becomes two things:

- a source page extractor that turns the current `machugi.io` page into structured mirror state,
- and a source action runner that applies host actions from Gatchi Machugi back to the original page.

The server stores the latest mirror state for the room and broadcasts it to every browser in the Socket.io room. The web app renders that state as the main room screen. Host browsers can send mirror actions; participant browsers render the same state but cannot mutate the source.

This approach gives the user the desired experience while keeping the source and judge on the original site. It is more brittle than the previous quiz-only extraction because search/results/settings screens also depend on `machugi.io` DOM structure, so the design isolates selectors and includes explicit fallback/error states.

## UX Design

### Host Screen

The host room screen has one primary mirror surface.

It should show:

- room code and connection status,
- extension connected/disconnected state,
- original source tab connected/disconnected state,
- the current source page rendered in Gatchi Machugi UI,
- chat, scoreboard, and submission status as existing room side surfaces.

The main mirror surface changes by state:

- Search view: Korean search input and search action.
- Search results view: app-native list/grid of quiz cards read from the original site.
- Quiz detail/settings view: selected quiz metadata plus basic settings that the extension can map to the original page.
- Playing view: the existing app-native quiz display, submission, fairness lock, and reveal flow.
- Error/fallback view: clear Korean instructions and a button to open/focus the original tab.

The host should normally not need to operate the separate original tab after the source is connected, except when fallback tells them the current page is unsupported.

### Participant Screen

Participants see the same mirror surface but with host-only controls disabled or hidden.

They can:

- watch search/results/selection/settings as the host moves through them,
- submit answers only during the playing state,
- see submission status, result, score, and chat through the existing room UI.

They cannot:

- search,
- select a quiz,
- change source settings,
- advance the original source,
- reveal answers,
- or run any host-only mirror action.

### Korean UI Copy

New visible UI should be Korean by default. Representative labels:

- `검색`
- `검색어를 입력하세요`
- `퀴즈 선택`
- `문제 설정`
- `타이머`
- `문항 수`
- `문제 시작`
- `원본 탭과 동기화 중`
- `원본 탭을 찾을 수 없습니다`
- `원본 사이트 구조가 바뀌어 이 화면을 읽을 수 없습니다`

## Data Model

Add a shared mirror state model in `packages/shared`.

Representative shape:

```ts
type SourceMirrorState =
  | { kind: "disconnected"; reason?: string }
  | { kind: "loading"; action?: string }
  | { kind: "home"; url: string; query?: string }
  | { kind: "searchResults"; url: string; query: string; results: MirrorQuizResult[] }
  | { kind: "quizDetail"; url: string; quiz: MirrorQuizSummary; settings: MirrorQuizSettings }
  | { kind: "playing"; url: string; quiz: QuizState }
  | { kind: "result"; url: string; quiz: QuizState }
  | { kind: "unsupported"; url: string; reason: string }
  | { kind: "error"; url?: string; message: string };
```

`QuizState` remains the model for active question rendering. The new mirror model wraps the non-playing source pages and reuses `QuizState` when the source page is already in a playable question/result state.

Representative supporting types:

```ts
type MirrorQuizResult = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  href?: string | null;
  meta?: string[];
};

type MirrorQuizSettings = {
  timerSeconds?: number | null;
  questionCount?: number | null;
  availableTimers?: number[];
  availableQuestionCounts?: number[];
};
```

Every mirror state should include enough stable information for the web UI to render without broad DOM snapshots.

## Actions

Add typed mirror actions that host web clients can send and verified host extensions can execute.

Representative actions:

- `focusHome`
- `search` with query
- `selectResult` with result id or href
- `setTimer`
- `setQuestionCount`
- `startQuiz`
- `next`
- `previous`
- `skip`
- `refreshSource`
- `focusOriginalTab`

Action flow:

1. Host web client emits a host-only mirror action.
2. Server verifies the socket is host-authorized.
3. Server forwards the action only to the current verified host extension socket.
4. Extension runs the DOM action on the currently bound source tab.
5. Extension immediately extracts fresh mirror state.
6. Server broadcasts the updated room state.

Actions should carry a correlation id so the web UI can show pending state and clear it when fresh mirror state arrives or failure is reported.

## Extension Extraction

The extension should add a source mirror extractor next to the existing quiz extractor.

Extraction responsibilities:

- detect whether the current page is home/search/results/detail/settings/playing/result/unsupported,
- read the current search query when available,
- read visible search result cards,
- read selected quiz title/thumbnail/basic metadata when available,
- read basic settings controls when available,
- delegate playing/result extraction to the current `extractQuizState`,
- return `unsupported` instead of stale data when the page is not recognized.

Selectors must be isolated in a small module. The code should avoid sending raw HTML or full DOM snapshots to the server.

## Extension Action Runner

The action runner should map mirror actions to DOM operations:

- navigate or focus the source tab for `focusHome`,
- set the search input value and submit for `search`,
- click a known result card for `selectResult`,
- click or set timer/question count controls for settings actions,
- click the original start button for `startQuiz`,
- reuse existing next/previous/skip/original-submit safety controls where possible.

If an action cannot be applied, the extension must emit a structured failure instead of silently doing nothing. The web UI should show a Korean fallback message and keep the latest known state.

## Server Responsibilities

The server remains the room authority.

It should:

- store latest `sourceMirrorState` in active room memory,
- reject mirror state and action result events from stale extension sockets,
- validate host-only mirror actions before forwarding,
- broadcast mirror state through existing `room:state`,
- keep quiz submission, scoring, chat, and participant state unchanged,
- keep the host extension disconnect behavior from the current MVP.

The server should not fetch or crawl `machugi.io` directly.

## Web Responsibilities

The web app should replace the current host command panel with a `SourceMirrorView` style surface.

Suggested component boundaries:

- `SourceMirrorView`: state router and top-level status/error handling.
- `MirrorSearchView`: search/home UI.
- `MirrorResultsView`: result card list.
- `MirrorQuizSetupView`: selected quiz and basic settings.
- `MirrorPlayingView`: wraps existing quiz/submission UI.
- `MirrorUnsupportedView`: source problem and fallback actions.

The host version wires controls to mirror actions. The participant version renders the same state read-only.

The previous host command panel can be removed from the primary layout. If kept, hide it behind an explicit fallback/debug affordance rather than showing it as the main product UI.

## Fairness And Submission Flow

The source mirror UI must preserve the existing fair-play lock.

During active questions:

1. Host and participants answer in Gatchi Machugi.
2. Submitted status is visible, but answer contents remain hidden before reveal.
3. The host cannot see the original result until every active participant, including the host, has submitted or been skipped.
4. Only then does the server authorize the extension to submit the host answer to the original site.
5. The extension reads the original result and answer candidates.
6. The server scores and reveals through the existing room state.

The host selecting/searching/configuring a quiz through the mirror UI must not bypass this question-level lock.

## Error Handling

Expected fallback states:

- extension not connected,
- source tab not connected,
- source page unsupported,
- search input not found,
- search results not recognized,
- selected quiz opened a new tab and binding is pending,
- setting control not found,
- original action failed,
- extraction timed out,
- original result could not be read.

Fallback UI should prefer one clear next action:

- retry extraction,
- focus/open original tab,
- use current tab as source from the extension popup,
- or continue with manual/free-text quiz flow where appropriate.

## Testing

Automated tests should cover:

- shared mirror state/action schemas,
- server authorization for host-only mirror actions,
- stale extension socket rejection for mirror events,
- web rendering for each mirror state,
- host controls enabled only for verified host sessions,
- participant mirror view read-only behavior,
- extension extractor behavior against fixture HTML for search/results/detail/playing states,
- action runner success/failure paths,
- fallback rendering for unsupported/error states,
- existing fair-play submission and scoring tests still passing.

Manual verification should include:

1. host creates room,
2. extension connects,
3. source tab opens,
4. host searches from Gatchi Machugi,
5. search results appear in Gatchi Machugi,
6. host selects a result,
7. source tab follows the same selection,
8. host configures timer/question count where supported,
9. host starts the quiz,
10. host and participant see the same app-native question,
11. all players submit,
12. extension submits to original only after everyone submits,
13. original result is read back,
14. score updates,
15. next question continues through the same mirror surface.

## Rollout Plan

Implementation should proceed in slices:

1. Add shared mirror state/action types.
2. Add server mirror state/action plumbing.
3. Add extension mirror extractor for home/search/results.
4. Add extension action runner for search/select.
5. Add web mirror search/results UI.
6. Add quiz detail/settings extraction and UI.
7. Connect playing/result state to the existing quiz flow.
8. Add fallback/error UI.
9. Run focused tests and then a final whole-change review.

This matches the requested workflow: implement first, do an important final review, then fix review findings.

## Risks

- `machugi.io` markup changes may break extraction or action mapping.
- Some controls may be rendered through dynamic client state that is difficult to infer from static selectors.
- Quiz selection may open or replace windows/tabs in ways that require careful source binding.
- A beautiful app-native UI can imply ownership of quiz content, so the product should keep active-room-only handling and private/small-group framing.

## Mitigations

- Keep selectors isolated.
- Emit structured unsupported/error states instead of stale state.
- Add fixture-based extension tests for known page shapes.
- Keep source tab focus/open fallback available.
- Avoid permanent quiz-content persistence.
- Keep the source tab as the judge for final correctness.
