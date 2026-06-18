import type { Participant } from "@gatchi/shared";

export function Scoreboard({ participants }: { participants: Participant[] }) {
  return (
    <section className="side-panel" aria-label="Scoreboard">
      <div className="section-heading">
        <h2>Scoreboard</h2>
      </div>
      <div className="score-list">
        {[...participants]
          .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))
          .map((participant) => (
            <div className="score-row" key={participant.id}>
              <span>{participant.nickname}</span>
              <strong>{participant.score}</strong>
            </div>
          ))}
      </div>
    </section>
  );
}
