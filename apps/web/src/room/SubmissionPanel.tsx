import type { RoomState } from "@gatchi/shared";

export function SubmissionPanel({ state }: { state: RoomState }) {
  const submissionsByParticipant = new Map(state.submissions.map((submission) => [submission.participantId, submission]));

  return (
    <section className="side-panel" aria-label="제출 현황">
      <div className="section-heading">
        <h2>제출 현황</h2>
        <span>{state.submissions.length}명 제출</span>
      </div>
      <div className="status-list">
        {state.participants.map((participant) => {
          const submission = submissionsByParticipant.get(participant.id);
          const status = submission?.skipped ? "건너뜀" : submission?.submitted ? "제출됨" : "대기 중";

          return (
            <div className="status-row" key={participant.id}>
              <span>{participant.nickname}</span>
              <strong>
                {participant.nickname} {status}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
