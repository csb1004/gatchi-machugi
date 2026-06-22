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

function supportedCategoryId(categoryId: number): number | null {
  return Number.isInteger(categoryId) && categoryId >= 1 && categoryId <= 10 ? categoryId : null;
}

export function activeCategoryId(url: string | null): number | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const categoryType = parsed.searchParams.get("category_type");
    if (categoryType) return supportedCategoryId(Number(categoryType));

    const match = parsed.pathname.match(/^\/category\/(\d+)\/?$/);
    return match?.[1] ? supportedCategoryId(Number(match[1])) : null;
  } catch {
    return null;
  }
}

export function MirrorCategoryNav(props: {
  currentUrl: string | null;
  homeQuery: string;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  const activeId = activeCategoryId(props.currentUrl);
  const homeQuery = props.homeQuery.trim();

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
              props.onAction(
                id === null
                  ? homeQuery
                    ? { name: "focusHome", query: homeQuery }
                    : { name: "focusHome" }
                  : homeQuery
                    ? { name: "openCategory", categoryId: id, query: homeQuery }
                    : { name: "openCategory", categoryId: id }
              );
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
