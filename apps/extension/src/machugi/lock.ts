import type { OriginalSubmitRequestPayload, OriginalSubmitStatus, RoomState } from "@gatchi/shared";

const blockedStatuses = new Set<OriginalSubmitStatus>(["locked", "ready", "submitting"]);
const submitTextPattern = /제출|확인|정답|입력|submit|answer/i;
const defaultLockMessage = "모든 참가자가 제출할 때까지 원본 제출이 잠겨 있습니다.";

export interface OriginalSubmissionLockController {
  updateRoomState(state: RoomState): void;
  runWithOriginalSubmitBypass<T>(action: () => T): T;
  dispose(): void;
}

export interface OriginalSubmissionLockOptions {
  onRequestOriginalSubmit: (payload: OriginalSubmitRequestPayload) => void;
  onLockedAttempt?: (message: string) => void;
}

function closestButton(target: EventTarget | null): HTMLButtonElement | null {
  return target instanceof Element ? target.closest("button") : null;
}

function hasAnswerInput(root: ParentNode): boolean {
  return Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).some((input) => {
    if (input instanceof HTMLTextAreaElement) return true;
    const type = input.type.toLowerCase();
    return type !== "hidden" && type !== "search" && type !== "button" && type !== "submit";
  });
}

function isOriginalSubmitButton(button: HTMLButtonElement): boolean {
  const form = button.closest("form");
  if (form && hasAnswerInput(form)) return true;

  const label = `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`;
  const className = button.className;

  return button.type === "submit" || submitTextPattern.test(label) || className.includes("NextButton_root");
}

function isOriginalSubmitEvent(event: Event): boolean {
  if (event.type === "submit") {
    return event.target instanceof HTMLFormElement && hasAnswerInput(event.target);
  }

  const button = closestButton(event.target);
  return button ? isOriginalSubmitButton(button) : false;
}

export function createOriginalSubmissionLock(
  root: Document,
  { onRequestOriginalSubmit, onLockedAttempt }: OriginalSubmissionLockOptions
): OriginalSubmissionLockController {
  let roomState: RoomState | null = null;
  let bypassDepth = 0;
  let requestedQuestionKey: string | null = null;

  const listener = (event: Event) => {
    if (bypassDepth > 0 || !roomState?.fairPlay.questionKey || !blockedStatuses.has(roomState.fairPlay.originalSubmitStatus)) return;
    if (!isOriginalSubmitEvent(event)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (roomState.fairPlay.originalSubmitStatus === "ready") {
      if (requestedQuestionKey === roomState.fairPlay.questionKey) return;
      requestedQuestionKey = roomState.fairPlay.questionKey;
      onRequestOriginalSubmit({
        roomCode: roomState.roomCode,
        questionKey: roomState.fairPlay.questionKey
      });
      return;
    }

    onLockedAttempt?.(roomState.fairPlay.lockReason ?? defaultLockMessage);
  };

  root.addEventListener("click", listener, true);
  root.addEventListener("submit", listener, true);

  return {
    updateRoomState(state) {
      if (
        roomState?.fairPlay.questionKey !== state.fairPlay.questionKey ||
        roomState.fairPlay.originalSubmitStatus !== state.fairPlay.originalSubmitStatus ||
        state.fairPlay.originalSubmitStatus !== "ready"
      ) {
        requestedQuestionKey = null;
      }

      roomState = state;
    },
    runWithOriginalSubmitBypass(action) {
      bypassDepth += 1;
      try {
        return action();
      } finally {
        bypassDepth -= 1;
      }
    },
    dispose() {
      root.removeEventListener("click", listener, true);
      root.removeEventListener("submit", listener, true);
    }
  };
}
