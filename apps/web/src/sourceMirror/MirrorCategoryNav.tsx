import {
  BookOpen,
  Clapperboard,
  Dumbbell,
  Gamepad2,
  Grid3X3,
  Laugh,
  MessageCircle,
  Music2,
  Tv,
  UserRound,
  Utensils,
  type LucideIcon
} from "lucide-react";
import type { SourceMirrorAction } from "@gatchi/shared";

type Category = {
  id: number | null;
  label: string;
  Icon: LucideIcon;
};

const categories: Category[] = [
  { id: null, label: "전체", Icon: Grid3X3 },
  { id: 1, label: "게임", Icon: Gamepad2 },
  { id: 2, label: "음악", Icon: Music2 },
  { id: 3, label: "문화", Icon: Clapperboard },
  { id: 4, label: "방송", Icon: Tv },
  { id: 5, label: "상식", Icon: BookOpen },
  { id: 6, label: "만화", Icon: MessageCircle },
  { id: 7, label: "음식", Icon: Utensils },
  { id: 8, label: "인물", Icon: UserRound },
  { id: 9, label: "스포츠", Icon: Dumbbell },
  { id: 10, label: "병맛", Icon: Laugh }
];

function activeCategoryId(url: string | null): number | null {
  if (!url) return null;

  try {
    const match = new URL(url).pathname.match(/^\/category\/(\d+)\/?$/);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export function MirrorCategoryNav(props: {
  currentUrl: string | null;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  const activeId = activeCategoryId(props.currentUrl);

  return (
    <nav className="mirror-category-nav" aria-label="마추기 카테고리">
      {categories.map(({ id, label, Icon }) => {
        const isActive = activeId === id;
        return (
          <button
            className={isActive ? "active" : undefined}
            type="button"
            key={label}
            disabled={!props.isHost}
            aria-pressed={isActive}
            onClick={() => {
              props.onAction(id === null ? { name: "focusHome" } : { name: "openCategory", categoryId: id });
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
