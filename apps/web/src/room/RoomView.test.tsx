import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

    const personalResult = screen.getByRole("region", { name: "내 결과" });
    expect(within(personalResult).getByText("내 결과")).toBeInTheDocument();
    expect(within(personalResult).getByText("오답")).toBeInTheDocument();
    expect(within(personalResult).getByText("내 답: 팅비드")).toBeInTheDocument();
    expect(within(personalResult).getByText("정답: 디안시")).toBeInTheDocument();
  });

  it("shows incorrect revealed answers to every participant and highlights the viewer's own answer", () => {
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "revealed",
          participants: [
            ...baseState.participants,
            { id: "p2", nickname: "Yuna", role: "player", connected: true, score: 0 }
          ],
          quiz: {
            ...baseState.quiz,
            resultMessage: "정답!",
            answerCandidates: ["피카츄"]
          },
          revealedSubmissions: [
            { participantId: "host", submitted: true, skipped: false, rawAnswer: "피카츄", correct: true },
            { participantId: "p1", submitted: true, skipped: false, rawAnswer: "라이츄", correct: false },
            { participantId: "p2", submitted: true, skipped: false, rawAnswer: "피카츄", correct: true }
          ]
        }}
        currentParticipantId="p2"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
      />
    );

    const publicResults = screen.getByRole("region", { name: "공개 결과" });
    expect(within(publicResults).getByText("오답 공개")).toBeInTheDocument();
    expect(within(publicResults).getByText("Mina")).toBeInTheDocument();
    expect(within(publicResults).getByText("라이츄")).toBeInTheDocument();
    expect(within(publicResults).queryByText("Host")).not.toBeInTheDocument();

    const myAnswer = within(publicResults).getByLabelText("내 답 결과");
    expect(myAnswer).toHaveClass("correct");
    expect(within(myAnswer).getByText("내 답")).toBeInTheDocument();
    expect(within(myAnswer).getByText("정답")).toBeInTheDocument();
    expect(within(myAnswer).getByText("피카츄")).toBeInTheDocument();
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

    const personalResult = screen.getByRole("region", { name: "내 결과" });
    expect(within(personalResult).getByText("미제출")).toBeInTheDocument();
    expect(within(personalResult).getByText("내 답: 입력하지 않음")).toBeInTheDocument();
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

  it("hides the answer form once every required participant has submitted", () => {
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

    expect(screen.queryByRole("form", { name: "답변" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "답변" })).not.toBeInTheDocument();
  });

  it("hides the answer form when all submitted is the only lock cause", () => {
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
            originalSubmitStatus: "locked"
          }
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
      />
    );

    expect(document.querySelector(".answer-panel")).not.toBeInTheDocument();
  });

  it("hides the answer form when the mirrored original screen already shows a result", () => {
    render(
      <RoomView
        state={{
          ...baseState,
          sourceMirror: {
            kind: "playing",
            url: "https://machugi.io/quiz/KAEfboenNZKAyJ3unQZH",
            title: "5 second song quiz",
            lastSeenAt: "2026-06-21T00:00:01.000Z",
            quiz: {
              ...baseState.quiz,
              quizTitle: "5 second song quiz",
              questionType: "audio",
              audioUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0.5&end=0",
              resultMessage: "Incorrect!",
              answerCandidates: ["Ice Cream"],
              canGoNext: true
            }
          }
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
      />
    );

    expect(document.querySelector(".answer-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "?듬?" })).not.toBeInTheDocument();
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

  it("lets the host advance with Enter when the mirrored result can go next", () => {
    const onSourceAction = vi.fn();
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "revealed",
          quiz: {
            ...baseState.quiz,
            canGoNext: false,
            resultMessage: "?ㅻ떟!",
            answerCandidates: ["Ice Cream"]
          },
          sourceMirror: {
            kind: "result",
            url: "https://machugi.io/quiz/KAEfboenNZKAyJ3unQZH",
            title: "5 second song quiz",
            lastSeenAt: "2026-06-21T00:00:00.000Z",
            quiz: {
              ...baseState.quiz,
              questionType: "audio",
              audioUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0.5&end=0",
              canGoNext: true,
              resultMessage: "?ㅻ떟!",
              answerCandidates: ["Ice Cream"]
            }
          },
          revealedSubmissions: [{ participantId: "host", submitted: true, skipped: false, rawAnswer: "Blackpink", correct: false }]
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={onSourceAction}
      />
    );

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onSourceAction).toHaveBeenCalledWith({ name: "next" });
  });

  it("lets the host advance with Enter when a mirrored result is visible before reveal state catches up", () => {
    const onSourceAction = vi.fn();
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "playing",
          quiz: {
            ...baseState.quiz,
            canGoNext: false,
            resultMessage: null,
            answerCandidates: []
          },
          sourceMirror: {
            kind: "result",
            url: "https://machugi.io/quiz/KAEfboenNZKAyJ3unQZH",
            title: "5 second song quiz",
            lastSeenAt: "2026-06-21T00:00:00.000Z",
            quiz: {
              ...baseState.quiz,
              questionType: "audio",
              audioUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0.5&end=0",
              canGoNext: true,
              resultMessage: "오답!",
              answerCandidates: ["Ready Set Go"]
            }
          }
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={onSourceAction}
      />
    );

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onSourceAction).toHaveBeenCalledWith({ name: "next" });
  });

  it("focuses the room surface when a visible result can advance", async () => {
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "playing",
          quiz: {
            ...baseState.quiz,
            canGoNext: false,
            resultMessage: null,
            answerCandidates: []
          },
          sourceMirror: {
            kind: "result",
            url: "https://machugi.io/quiz/KAEfboenNZKAyJ3unQZH",
            title: "5 second song quiz",
            lastSeenAt: "2026-06-21T00:00:00.000Z",
            quiz: {
              ...baseState.quiz,
              questionType: "audio",
              audioUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0.5&end=0",
              canGoNext: true,
              resultMessage: "오답!",
              answerCandidates: ["Ready Set Go"]
            }
          }
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={() => undefined}
      />
    );

    await waitFor(() => expect(document.querySelector(".room-layout")).toHaveFocus());
  });

  it("lets the host advance when Enter is dispatched from the window", () => {
    const onSourceAction = vi.fn();
    render(
      <RoomView
        state={{
          ...baseState,
          phase: "playing",
          quiz: {
            ...baseState.quiz,
            canGoNext: false,
            resultMessage: null,
            answerCandidates: []
          },
          sourceMirror: {
            kind: "result",
            url: "https://machugi.io/quiz/KAEfboenNZKAyJ3unQZH",
            title: "5 second song quiz",
            lastSeenAt: "2026-06-21T00:00:00.000Z",
            quiz: {
              ...baseState.quiz,
              questionType: "audio",
              audioUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0.5&end=0",
              canGoNext: true,
              resultMessage: "오답!",
              answerCandidates: ["Ready Set Go"]
            }
          }
        }}
        currentParticipantId="host"
        onSubmitAnswer={() => undefined}
        onSourceAction={onSourceAction}
      />
    );

    fireEvent.keyDown(window, { key: "Enter" });

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
