import { Home } from "lucide-react";

export function MirrorGameEndView(props: {
  message: string;
  isHost: boolean;
  onHome: () => void;
}) {
  return (
    <section className="mirror-game-end" aria-label="게임 종료 화면">
      <div className="game-end-message">
        <h2>퀴즈 종료</h2>
        <p>{props.message}</p>
        {props.isHost ? (
          <div className="mirror-host-actions">
            <button type="button" onClick={props.onHome}>
              <Home size={17} />
              홈 화면
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
