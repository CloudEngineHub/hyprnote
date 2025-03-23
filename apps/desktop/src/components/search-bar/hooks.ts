import { useCallback } from "react";

import { MentionSuggestion, Suggestion } from "./types";

export const useSearchHelpers = () => {
  // Group mention suggestions by type
  const groupedMentionSuggestions = useCallback((filteredSuggestions: MentionSuggestion[]) => {
    const grouped: Record<string, MentionSuggestion[]> = {
      date: [],
      people: [],
      orgs: [],
      notes: [],
      folders: [],
    };

    filteredSuggestions.forEach(suggestion => {
      grouped[suggestion.type].push(suggestion);
    });

    return grouped;
  }, []);

  // Get flat list of suggestions with indices for keyboard navigation
  const getFlatSuggestionsList = useCallback((suggestions: Suggestion[], mentionType: "@" | "#" | null) => {
    if (mentionType === "#") return suggestions;

    const mentionSuggestions = suggestions as MentionSuggestion[];
    const grouped = groupedMentionSuggestions(mentionSuggestions);

    const flatList: MentionSuggestion[] = [];
    Object.keys(grouped).forEach(key => {
      if (grouped[key].length > 0) {
        flatList.push(...grouped[key]);
      }
    });

    return flatList;
  }, [groupedMentionSuggestions]);

  return {
    groupedMentionSuggestions,
    getFlatSuggestionsList,
  };
};
