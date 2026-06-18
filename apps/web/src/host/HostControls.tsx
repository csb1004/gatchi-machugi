import { ChevronLeft, ChevronRight, RotateCcw, Search, SkipForward, SquarePlay } from "lucide-react";
import type { QuizCommandName } from "@gatchi/shared";

const controls: Array<{ command: QuizCommandName; label: string; icon: typeof Search }> = [
  { command: "configure", label: "Search", icon: Search },
  { command: "start", label: "Start", icon: SquarePlay },
  { command: "previous", label: "Previous", icon: ChevronLeft },
  { command: "next", label: "Next", icon: ChevronRight },
  { command: "skip", label: "Skip", icon: SkipForward },
  { command: "reset", label: "Reset", icon: RotateCcw }
];

export function HostControls({
  extensionConnected,
  onCommand
}: {
  extensionConnected: boolean;
  onCommand: (command: QuizCommandName) => void;
}) {
  return (
    <section className="host-controls" aria-label="Host controls">
      <div className="section-heading">
        <h2>Host controls</h2>
        <span>{extensionConnected ? "Online" : "Offline"}</span>
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
