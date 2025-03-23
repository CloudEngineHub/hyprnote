import { BuildingIcon, CalendarIcon, FileTextIcon, FolderIcon, HashIcon, SearchIcon, UserIcon } from "lucide-react";
import { ForwardedRef, forwardRef } from "react";

import { cn } from "@hypr/ui/lib/utils";
import { Badge, BADGE_COLORS, MentionType, TagType } from "./types";

interface BadgeProps {
  badge: Badge;
  isActive: boolean;
  onClick: () => void;
}

const renderBadgeIcon = (type: MentionType | TagType) => {
  switch (type) {
    case "date":
      return <CalendarIcon className="h-3 w-3" />;
    case "people":
      return <UserIcon className="h-3 w-3" />;
    case "orgs":
      return <BuildingIcon className="h-3 w-3" />;
    case "notes":
      return <FileTextIcon className="h-3 w-3" />;
    case "folders":
      return <FolderIcon className="h-3 w-3" />;
    case "tag":
      return <HashIcon className="h-3 w-3" />;
    default:
      return <SearchIcon className="h-3 w-3" />;
  }
};

export const SearchBadge = forwardRef(
  ({ badge, isActive, onClick }: BadgeProps, ref: ForwardedRef<HTMLDivElement>) => {
    return (
      <div
        ref={ref}
        className={cn([
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border",
          BADGE_COLORS[badge.type],
          isActive && "ring-2 ring-offset-1 ring-neutral-400",
        ])}
        onClick={onClick}
      >
        <span className="flex items-center gap-1">
          {renderBadgeIcon(badge.type)}
          <span>{badge.name}</span>
        </span>
      </div>
    );
  },
);

SearchBadge.displayName = "SearchBadge";
