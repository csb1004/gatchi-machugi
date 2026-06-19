import { Home, Play } from "lucide-react";
import type { MirrorQuizSettings, MirrorQuizSummary, SourceMirrorAction } from "@gatchi/shared";

export function MirrorSetupView(props: {
  quiz: MirrorQuizSummary;
  settings: MirrorQuizSettings;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  return (
    <section className="mirror-setup" aria-label="문제 설정">
      {props.isHost ? (
        <div className="mirror-host-actions" aria-label="방장 진행 조작">
          <button type="button" onClick={() => props.onAction({ name: "focusHome" })}>
            <Home size={17} />
            홈 화면
          </button>
        </div>
      ) : null}
      <div className="section-heading">
        <h2>{props.quiz.title}</h2>
        <span>문제 설정</span>
      </div>
      {props.quiz.thumbnailUrl ? <img className="mirror-setup-thumb" src={props.quiz.thumbnailUrl} alt="" /> : null}
      {props.quiz.description ? <p className="mirror-setup-description">{props.quiz.description}</p> : null}
      <div className="mirror-setting-row">
        <span>타이머</span>
        <div className="mirror-segmented">
          <button
            type="button"
            disabled={!props.isHost}
            className={props.settings.timerSeconds === null ? "active" : ""}
            onClick={() => props.onAction({ name: "setTimer", timerSeconds: null })}
          >
            타이머 X
          </button>
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
        <span>문제 시작</span>
        <div className="mirror-segmented">
          {props.settings.availableQuestionCounts.map((count) => (
            <button
              type="button"
              key={count}
              disabled={!props.isHost}
              className={props.settings.questionCount === count ? "active" : ""}
              onClick={() => props.onAction({ name: "setQuestionCount", questionCount: count })}
            >
              {count}개 풀기
            </button>
          ))}
        </div>
      </div>
      {props.settings.availableQuestionCounts.length === 0 ? (
        <button className="primary-button" type="button" disabled={!props.isHost} onClick={() => props.onAction({ name: "startQuiz" })}>
          <Play size={18} />
          문제 시작
        </button>
      ) : null}
    </section>
  );
}
