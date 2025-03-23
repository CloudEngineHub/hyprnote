import { BuildingIcon, CalendarIcon, FileTextIcon, FolderIcon, HashIcon, SearchIcon, UserIcon } from "lucide-react";
import { ForwardedRef, forwardRef } from "react";

import { cn } from "@hypr/ui/lib/utils";
import { Suggestion } from "./types";

interface SuggestionItemProps {
  suggestion: Suggestion;
  isActive: boolean;
  onClick: () => void;
}

const renderSuggestionIcon = (suggestion: Suggestion) => {
  if ("type" in suggestion) {
    switch (suggestion.type) {
      case "date":
        return <CalendarIcon className="h-4 w-4 text-neutral-500" />;
      case "people":
        return <UserIcon className="h-4 w-4 text-neutral-500" />;
      case "orgs":
        return <BuildingIcon className="h-4 w-4 text-neutral-500" />;
      case "notes":
        return <FileTextIcon className="h-4 w-4 text-neutral-500" />;
      case "folders":
        return <FolderIcon className="h-4 w-4 text-neutral-500" />;
      case "tag":
        return <HashIcon className="h-4 w-4 text-neutral-500" />;
      default:
        return <SearchIcon className="h-4 w-4 text-neutral-500" />;
    }
  }

  return <SearchIcon className="h-4 w-4 text-neutral-500" />;
};

export const SuggestionItem = forwardRef(
  ({ suggestion, isActive, onClick }: SuggestionItemProps, ref: ForwardedRef<HTMLDivElement>) => {
    return (
      <div
        ref={ref}
        className={cn([
          "px-3 py-2 text-sm cursor-pointer hover:bg-neutral-100",
          isActive && "bg-neutral-100",
        ])}
        onClick={onClick}
      >
        <div className="flex items-center">
          <span className="mr-2">{renderSuggestionIcon(suggestion)}</span>
          <span>{suggestion.name}</span>
        </div>
      </div>
    );
  },
);

SuggestionItem.displayName = "SuggestionItem";
