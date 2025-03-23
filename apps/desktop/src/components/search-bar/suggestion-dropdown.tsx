import { forwardRef } from "react";

import { SuggestionItem } from "./suggestion-item";
import { MENTION_SECTIONS, MentionSuggestion, MentionType, Suggestion } from "./types";

interface SuggestionDropdownProps {
  suggestions: Suggestion[];
  mentionType: "@" | "#" | null;
  activeSuggestionIndex: number;
  onSelectSuggestion: (suggestion: Suggestion) => void;
  getFlatSuggestionsList: (suggestions: Suggestion[]) => Suggestion[];
  groupedMentionSuggestions: (filteredSuggestions: MentionSuggestion[]) => Record<string, MentionSuggestion[]>;
}

export const SuggestionDropdown = forwardRef<HTMLDivElement, SuggestionDropdownProps>(
  ({
    suggestions,
    mentionType,
    activeSuggestionIndex,
    onSelectSuggestion,
    getFlatSuggestionsList,
    groupedMentionSuggestions,
  }, ref) => {
    if (suggestions.length === 0) {
      return (
        <div
          ref={ref}
          className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          <div className="px-3 py-2 text-sm text-neutral-500">
            No suggestions found
          </div>
        </div>
      );
    }

    const flatList = getFlatSuggestionsList(suggestions);

    const renderMentionSuggestions = () => {
      if (mentionType !== "@") return null;

      const mentionSuggestions = suggestions as MentionSuggestion[];
      const grouped = groupedMentionSuggestions(mentionSuggestions);

      return (
        <>
          {Object.keys(grouped).map((key) => {
            const type = key as MentionType;
            const items = grouped[key];

            if (items.length === 0) return null;

            return (
              <div key={type}>
                <div className="px-3 py-1 text-xs font-medium text-neutral-500 bg-neutral-50">
                  {MENTION_SECTIONS[type]}
                </div>
                {items.map((suggestion) => {
                  const isActive = flatList.indexOf(suggestion) === activeSuggestionIndex;
                  const activeRef = isActive
                    ? {
                      ref: (el: HTMLDivElement) => {
                        if (el && isActive) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      },
                    }
                    : {};

                  return (
                    <SuggestionItem
                      key={suggestion.id}
                      suggestion={suggestion}
                      isActive={isActive}
                      onClick={() => onSelectSuggestion(suggestion)}
                      {...activeRef}
                    />
                  );
                })}
              </div>
            );
          })}
        </>
      );
    };

    const renderTagSuggestions = () => {
      if (mentionType !== "#") return null;

      return (
        <>
          <div className="px-3 py-1 text-xs font-medium text-neutral-500 bg-neutral-50">
            Tags
          </div>
          {suggestions.map((suggestion) => {
            const isActive = flatList.indexOf(suggestion) === activeSuggestionIndex;
            const activeRef = isActive
              ? {
                ref: (el: HTMLDivElement) => {
                  if (el && isActive) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                },
              }
              : {};

            return (
              <SuggestionItem
                key={suggestion.id}
                suggestion={suggestion}
                isActive={isActive}
                onClick={() => onSelectSuggestion(suggestion)}
                {...activeRef}
              />
            );
          })}
        </>
      );
    };

    return (
      <div
        ref={ref}
        className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg max-h-60 overflow-auto"
      >
        {mentionType === "@" ? renderMentionSuggestions() : renderTagSuggestions()}
      </div>
    );
  },
);

SuggestionDropdown.displayName = "SuggestionDropdown";
