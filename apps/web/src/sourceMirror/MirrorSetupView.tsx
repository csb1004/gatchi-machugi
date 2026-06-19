import { Play } from "lucide-react";
import type { MirrorQuizSettings, MirrorQuizSummary, SourceMirrorAction } from "@gatchi/shared";

export function MirrorSetupView(props: {
  quiz: MirrorQuizSummary;
  settings: MirrorQuizSettings;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  return (
    <section className="mirror-setup" aria-label="문제 설정">
      <div className="section-heading">
        <h2>{props.quiz.title}</h2>
        <span>문제 설정</span>
      </div>
      {props.quiz.thumbnailUrl ? <img className="mirror-setup-thumb" src={props.quiz.thumbnailUrl} alt="" /> : null}
      <div className="mirror-setting-row">
        <span>타이머</span>
        <div className="mirror-segmented">
          {props.settings.availableTimers.map((seconds) => (
            <button
              type="button"
              key={seconds}
              disabled={!props.isHost}
              className={props.settings.timerSeconds === seconds ? "active" : ""}
              onClick={() => props.onAction({ name: "setTimer", timerSeconds: seconds })}
            >
              {seconds}초
            </button>
          ))}
        </div>
      </div>
      <div className="mirror-setting-row">
        <span>문항 수</span>
        <div className="mirror-segmented">
          {props.settings.availableQuestionCounts.map((count) => (
            <button
              type="button"
              key={count}
              disabled={!props.isHost}
              className={props.settings.questionCount === count ? "active" : ""}
              onClick={() => props.onAction({ name: "setQuestionCount", questionCount: count })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
      <button className="primary-button" type="button" disabled={!props.isHost} onClick={() => props.onAction({ name: "startQuiz" })}>
        <Play size={18} />
        문제 시작
      </button>
    </section>
  );
}
