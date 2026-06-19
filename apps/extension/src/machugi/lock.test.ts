import type { RoomState } from "@gatchi/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOriginalSubmissionLock, type OriginalSubmissionLockController } from "./lock";

function roomState(overrides: Partial<RoomState["fairPlay"]>): RoomState {
  return {
    roomCode: "ABC123",
    phase: "playing",
    settings: {
      visibility: "public",
      submissionVisibility: "status-only",
      timerSeconds: null,
      title: "마추기 방"
    },
    participants: [],
    quiz: {
      quizTitle: "Quiz",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "free-text",
      questionText: "Question",
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
    fairPlay: {
      questionKey: "q1",
      requiredParticipantIds: [],
      submittedParticipantIds: [],
      allRequiredSubmitted: false,
      originalSubmitStatus: "locked",
      lockReason: "아직 제출하지 않은 참가자가 있습니다.",
      ...overrides
    },
    hostExtensionConnected: true,
    sourceWindow: {
      status: "connected",
      url: "https://machugi.io/",
      title: "Machugi",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      message: null
    },
    sourceMirror: {
      kind: "playing",
      url: "https://machugi.io/",
      title: "Machugi",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      quiz: {
        quizTitle: "Quiz",
        questionIndex: 1,
        totalQuestions: 10,
        questionType: "free-text",
        questionText: "Question",
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
    },
    chatMessageCount: 0
  };
}

describe("createOriginalSubmissionLock", () => {
  let controller: OriginalSubmissionLockController | null = null;

  afterEach(() => {
    controller?.dispose();
    controller = null;
    document.body.innerHTML = "";
  });

  it("blocks original submit clicks while the room is locked", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <input type="text">
        <button class="NextButton_root">제출</button>
      </div>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.fn();
    const locked = vi.fn();
    const request = vi.fn();
    button.addEventListener("click", click);

    controller = createOriginalSubmissionLock(document, {
      onRequestOriginalSubmit: request,
      onLockedAttempt: locked
    });
    controller.updateRoomState(roomState({ originalSubmitStatus: "locked" }));

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(click).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(locked).toHaveBeenCalledWith("아직 제출하지 않은 참가자가 있습니다.");
  });

  it("requests server authorization instead of letting a ready submit pass through", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <input type="text">
        <button class="NextButton_root">제출</button>
      </div>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const request = vi.fn();

    controller = createOriginalSubmissionLock(document, { onRequestOriginalSubmit: request });
    controller.updateRoomState(roomState({ originalSubmitStatus: "ready", allRequiredSubmitted: true }));

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      roomCode: "ABC123",
      questionKey: "q1"
    });
  });

  it("does not block a result-screen next button that has no answer input", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <article>정답!</article>
        <strong>레그워크 샤르 미하일</strong>
        <button class="NextButton_root" type="button">›</button>
      </div>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.fn();
    const request = vi.fn();
    const locked = vi.fn();
    button.addEventListener("click", click);

    controller = createOriginalSubmissionLock(document, {
      onRequestOriginalSubmit: request,
      onLockedAttempt: locked
    });
    controller.updateRoomState(roomState({ originalSubmitStatus: "locked" }));

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(locked).not.toHaveBeenCalled();
  });

  it("allows a retry after a failed original submission returns from submitting to ready", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <input type="text">
        <button class="NextButton_root">제출</button>
      </div>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const request = vi.fn();

    controller = createOriginalSubmissionLock(document, { onRequestOriginalSubmit: request });
    controller.updateRoomState(roomState({ originalSubmitStatus: "ready", allRequiredSubmitted: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    controller.updateRoomState(roomState({ originalSubmitStatus: "submitting", allRequiredSubmitted: true }));
    controller.updateRoomState(roomState({ originalSubmitStatus: "ready", allRequiredSubmitted: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("allows programmatic original submission while bypassed", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <input type="text">
        <button class="NextButton_root">제출</button>
      </div>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.fn();
    button.addEventListener("click", click);

    controller = createOriginalSubmissionLock(document, { onRequestOriginalSubmit: vi.fn() });
    controller.updateRoomState(roomState({ originalSubmitStatus: "submitting" }));

    controller.runWithOriginalSubmitBypass(() => {
      button.click();
    });

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does not block before an active question is known", () => {
    document.body.innerHTML = `<button class="NextButton_root">시작</button>`;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.fn();
    button.addEventListener("click", click);

    controller = createOriginalSubmissionLock(document, { onRequestOriginalSubmit: vi.fn() });
    controller.updateRoomState(roomState({ questionKey: null, originalSubmitStatus: "idle" }));

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(click).toHaveBeenCalledTimes(1);
  });
});
