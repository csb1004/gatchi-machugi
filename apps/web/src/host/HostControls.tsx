import { ChevronLeft, ChevronRight, RotateCcw, Search, SkipForward, SquarePlay } from "lucide-react";
import type { QuizCommandName } from "@gatchi/shared";

const controls: Array<{ command: QuizCommandName; label: string; icon: typeof Search }> = [
  { command: "configure", label: "검색", icon: Search },
  { command: "start", label: "시작", icon: SquarePlay },
  { command: "previous", label: "이전", icon: ChevronLeft },
  { command: "next", label: "다음", icon: ChevronRight },
  { command: "skip", label: "건너뛰기", icon: SkipForward },
  { command: "reset", label: "초기화", icon: RotateCcw }
];

export function HostControls({
  extensionConnected,
  onCommand
}: {
  extensionConnected: boolean;
  onCommand: (command: QuizCommandName) => void;
}) {
  return (
    <section className="host-controls" aria-label="방장 컨트롤">
      <div className="section-heading">
        <h2>방장 컨트롤</h2>
        <span>{extensionConnected ? "연결됨" : "연결 안 됨"}</span>
      </div>
      <div className="control-grid">
        {controls.map((control) => {
          const Icon = control.icon;
          return (
            <button
              type="button"
              key={control.command}
              disabled={!extensionConnected}
              onClick={() => onCommand(control.command)}
            >
              <Icon size={17} />
              {control.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
