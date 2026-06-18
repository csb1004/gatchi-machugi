import type { RoomState } from "@gatchi/shared";

export function SubmissionPanel({ state }: { state: RoomState }) {
  const submissionsByParticipant = new Map(state.submissions.map((submission) => [submission.participantId, submission]));

  return (
    <section className="side-panel" aria-label="Submissions">
      <div className="section-heading">
        <h2>Submissions</h2>
        <span>{state.submissions.length} done</span>
      </div>
      <div className="status-list">
        {state.participants.map((participant) => {
          const submission = submissionsByParticipant.get(participant.id);
          const status = submission?.skipped ? "skipped" : submission?.submitted ? "submitted" : "waiting";

          return (
            <div className="status-row" key={participant.id}>
              <span>{participant.nickname}</span>
              <strong>{participant.nickname} {status}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
