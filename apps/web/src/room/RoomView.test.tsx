import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { RoomState } from "@gatchi/shared";
import { describe, expect, it, vi } from "vitest";
import { RoomView } from "./RoomView";

const baseState: RoomState = {
  roomCode: "ABC123",
  phase: "playing",
  settings: { title: "마추기 방", visibility: "public", submissionVisibility: "status-only", timerSeconds: null },
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
  fairPlay: {
    questionKey: "q1",
    requiredParticipantIds: ["host", "p1"],
    submittedParticipantIds: ["p1"],
    allRequiredSubmitted: false,
    originalSubmitStatus: "locked",
    lockReason: "모든 참가자가 제출해야 원본 정답 제출이 가능합니다."
  },
  sourceWindow: {
    status: "connected",
    url: "https://machugi.io/",
    title: "Machugi",
    lastSeenAt: "2026-06-19T00:00:00.000Z",
    message: null
  },
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
  hostExtensionConnected: true,
  chatMessageCount: 0
};

describe("RoomView", () => {
  it("shows submission status without raw answer before reveal", () => {
    render(<RoomView state={baseState} currentParticipantId="host" onSubmitAnswer={() => undefined} onSourceAction={() => undefined} />);

    expect(screen.getByText("원본 창 연결됨")).toBeInTheDocument();
    expect(screen.getByText("Mina 제출함")).toBeInTheDocument();
    expect(screen.queryByText("rawAnswer")).not.toBeInTheDocument();
    expect(screen.queryByText("blue archive")).not.toBeInTheDocument();
  });

  it("shows the current participant's own result after reveal", () => {
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "revealed",
          quiz: {
            ...baseState.quiz,
            resultMessage: "오답!",
            answerCandidates: ["디안시"]
          },
          revealedSubmissions: [
            { participantId: "host", submitted: true, skipped: false, rawAnswer: "디안시", correct: true },
            { participantId: "p1", submitted: true, skipped: false, rawAnswer: "팅비드", correct: false }
          ]
        }}
        currentParticipantId="p1"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
      />
    );

    expect(screen.getByText("내 결과")).toBeInTheDocument();
    expect(screen.getByText("오답")).toBeInTheDocument();
    expect(screen.getByText("내 답: 팅비드")).toBeInTheDocument();
    expect(screen.getByText("정답: 디안시")).toBeInTheDocument();
  });

  it("labels skipped personal results as not entered", () => {
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "revealed",
          quiz: {
            ...baseState.quiz,
            resultMessage: "정답!",
            answerCandidates: ["디안시"]
          },
          revealedSubmissions: [
            { participantId: "host", submitted: true, skipped: false, rawAnswer: "디안시", correct: true },
            { participantId: "p1", submitted: false, skipped: true, rawAnswer: "", correct: false }
          ]
        }}
        currentParticipantId="p1"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
      />
    );

    expect(screen.getByText("미제출")).toBeInTheDocument();
    expect(screen.getByText("내 답: 입력하지 않음")).toBeInTheDocument();
  });

  it("lets the host add an accepted answer after reveal", () => {
    const onAddAlias = vi.fn();
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "revealed",
          quiz: {
            ...baseState.quiz,
            resultMessage: "정답!",
            answerCandidates: ["레그워크 샤르 미하일"]
          },
          submissions: [
            { participantId: "host", submitted: true, skipped: false },
            { participantId: "p1", submitted: true, skipped: false }
          ],
          revealedSubmissions: [
            { participantId: "host", submitted: true, skipped: false, rawAnswer: "미샤", correct: true },
            { participantId: "p1", submitted: true, skipped: false, rawAnswer: "미샤", correct: true }
          ]
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
        onAddAlias={onAddAlias}
      />
    );

    fireEvent.change(screen.getByLabelText("추가 정답"), { target: { value: "미하일" } });
    fireEvent.click(screen.getByRole("button", { name: "정답 추가" }));

    expect(onAddAlias).toHaveBeenCalledWith("미하일");
  });

  it("lets the current participant revise a submitted answer while others are still pending", () => {
    const onSubmitAnswer = vi.fn();
    render(
      <RoomView
        state={{
          ...baseState,
          submissions: [{ participantId: "host", submitted: true, skipped: false }],
          fairPlay: {
            ...baseState.fairPlay,
            submittedParticipantIds: ["host"],
            allRequiredSubmitted: false,
            originalSubmitStatus: "locked"
          }
        }}
        currentParticipantId="host"
        onSubmitAnswer={onSubmitAnswer}
        onSourceAction={() => undefined}
      />
    );

    const input = screen.getByRole("textbox", { name: "답변" });
    fireEvent.change(input, { target: { value: "수정 답" } });
    fireEvent.click(screen.getByRole("button", { name: "수정" }));

    expect(input).not.toBeDisabled();
    expect(onSubmitAnswer).toHaveBeenCalledWith("수정 답");
  });

  it("locks submitted answers once every required participant has submitted", () => {
    render(
      <RoomView
        state={{
          ...baseState,
          submissions: [
            { participantId: "host", submitted: true, skipped: false },
            { participantId: "p1", submitted: true, skipped: false }
          ],
          fairPlay: {
            ...baseState.fairPlay,
            submittedParticipantIds: ["host", "p1"],
            allRequiredSubmitted: true,
            originalSubmitStatus: "ready"
          }
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
      />
    );

    expect(screen.getByRole("textbox", { name: "답변" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "제출 완료" })).toBeDisabled();
  });

  it("does not show the room code as the empty chat placeholder", () => {
    render(
      <RoomView
        state={{ ...baseState, roomCode: "FY3D3R" }}
        currentParticipantId="host"
        chatMessages={[]}
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
      />
    );

    const chat = screen.getByRole("region", { name: "채팅" });
    expect(within(chat).queryByText("FY3D3R")).not.toBeInTheDocument();
    expect(within(chat).getByText("아직 채팅 메시지가 없습니다.")).toBeInTheDocument();
  });

  it("offers a room leave action from the title bar", () => {
    const onLeaveRoom = vi.fn();
    render(
      <RoomView
        state={baseState}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
        onLeaveRoom={onLeaveRoom}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "방 나가기" }));

    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });

  it("lets the host advance a revealed question with Enter", () => {
    const onSourceAction = vi.fn();
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "revealed",
          quiz: {
            ...baseState.quiz,
            canGoNext: true,
            resultMessage: "정답!",
            answerCandidates: ["디안시"]
          },
          sourceMirror: {
            kind: "result",
            url: "https://machugi.io/quiz/123/play",
            title: "Pokemon",
            lastSeenAt: "2026-06-19T00:00:00.000Z",
            quiz: {
              ...baseState.quiz,
              canGoNext: true,
              resultMessage: "정답!",
              answerCandidates: ["디안시"]
            }
          },
          revealedSubmissions: [{ participantId: "host", submitted: true, skipped: false, rawAnswer: "디안시", correct: true }]
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={onSourceAction}
      />
    );

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onSourceAction).toHaveBeenCalledWith({ name: "next" });
  });

  it("does not advance with Enter while the host is typing an extra accepted answer", () => {
    const onSourceAction = vi.fn();
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "revealed",
          quiz: {
            ...baseState.quiz,
            canGoNext: true,
            resultMessage: "정답!",
            answerCandidates: ["디안시"]
          },
          sourceMirror: {
            kind: "result",
            url: "https://machugi.io/quiz/123/play",
            title: "Pokemon",
            lastSeenAt: "2026-06-19T00:00:00.000Z",
            quiz: {
              ...baseState.quiz,
              canGoNext: true,
              resultMessage: "정답!",
              answerCandidates: ["디안시"]
            }
          },
          revealedSubmissions: [{ participantId: "host", submitted: true, skipped: false, rawAnswer: "디안시", correct: true }]
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={onSourceAction}
        onAddAlias={() => undefined}
      />
    );

    fireEvent.keyDown(screen.getByLabelText("추가 정답"), { key: "Enter" });

    expect(onSourceAction).not.toHaveBeenCalledWith({ name: "next" });
  });
});
