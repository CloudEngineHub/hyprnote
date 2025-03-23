import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useHyprSearch } from "@/contexts/search";
import { cn } from "@hypr/ui/lib/utils";
import Shortcut from "../shortcut";
import { SearchBadge } from "./badge";
import { useSearchHelpers } from "./hooks";
import { SuggestionDropdown } from "./suggestion-dropdown";
import { Badge, MOCK_MENTION_SUGGESTIONS, MOCK_TAG_SUGGESTIONS, Suggestion } from "./types";

export function SearchBar() {
  const {
    searchInputRef,
    focusSearch,
    clearSearch,
    setSearchQuery,
  } = useHyprSearch((s) => ({
    searchInputRef: s.searchInputRef,
    focusSearch: s.focusSearch,
    clearSearch: s.clearSearch,
    setSearchQuery: s.setQuery,
  }));

  const { groupedMentionSuggestions, getFlatSuggestionsList } = useSearchHelpers();

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [mentionType, setMentionType] = useState<"@" | "#" | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [caretPosition, setCaretPosition] = useState<number>(-1); // -1 means after all badges

  const suggestionsRef = useRef<HTMLDivElement>(null);
  const badgeRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Initialize badge refs when badges change
  useEffect(() => {
    badgeRefs.current = badges.map(() => null);
  }, [badges.length]);

  // Update searchQuery whenever badges or inputValue changes
  useEffect(() => {
    const query = badges.map(badge => `${badge.prefix}${badge.name}`).join(" ")
      + (inputValue ? " " + inputValue : "");
    setSearchQuery(query.trim());
  }, [badges, inputValue, setSearchQuery]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current
        && !suggestionsRef.current.contains(e.target as Node)
        && searchInputRef?.current
        && !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchInputRef]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    const lastAtIndex = value.lastIndexOf("@");
    const lastHashIndex = value.lastIndexOf("#");

    if (lastAtIndex !== -1 && (lastHashIndex === -1 || lastAtIndex > lastHashIndex)) {
      const mentionTextValue = value.slice(lastAtIndex + 1);
      setMentionType("@");

      const filtered = MOCK_MENTION_SUGGESTIONS.filter(
        suggestion => suggestion.name.toLowerCase().includes(mentionTextValue.toLowerCase()),
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setActiveSuggestionIndex(0);
    } else if (lastHashIndex !== -1 && (lastAtIndex === -1 || lastHashIndex > lastAtIndex)) {
      const tagTextValue = value.slice(lastHashIndex + 1);
      setMentionType("#");

      const filtered = MOCK_TAG_SUGGESTIONS.filter(
        suggestion => suggestion.name.toLowerCase().includes(tagTextValue.toLowerCase()),
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setActiveSuggestionIndex(0);
    } else {
      setShowSuggestions(false);
      setMentionType(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle navigation between badges
    if (badges.length > 0) {
      switch (e.key) {
        case "ArrowLeft":
          if (e.currentTarget.selectionStart === 0 && caretPosition > -1) {
            e.preventDefault();
            setCaretPosition(caretPosition - 1);
          } else if (e.currentTarget.selectionStart === 0 && caretPosition === -1) {
            e.preventDefault();
            setCaretPosition(badges.length - 1);
          }
          break;
        case "ArrowRight":
          if (caretPosition < badges.length - 1) {
            e.preventDefault();
            setCaretPosition(caretPosition + 1);
          } else if (caretPosition === badges.length - 1) {
            e.preventDefault();
            setCaretPosition(-1);
            // Focus input and set cursor at beginning
            if (searchInputRef?.current) {
              searchInputRef.current.focus();
              searchInputRef.current.selectionStart = 0;
              searchInputRef.current.selectionEnd = 0;
            }
          }
          break;
        case "Backspace":
          // If caret is at a badge position, remove that badge
          if (caretPosition >= 0 && caretPosition < badges.length) {
            e.preventDefault();
            const newBadges = [...badges];
            newBadges.splice(caretPosition, 1);
            setBadges(newBadges);

            // Adjust caret position
            if (caretPosition >= newBadges.length) {
              setCaretPosition(-1); // Move to input
            }
          } else if (inputValue === "" && badges.length > 0 && caretPosition === -1) {
            e.preventDefault();
            // Remove the last badge when backspace is pressed on empty input
            setBadges(prev => prev.slice(0, -1));
          }
          break;
        case "Delete":
          // If caret is at a badge position, remove that badge
          if (caretPosition >= 0 && caretPosition < badges.length) {
            e.preventDefault();
            const newBadges = [...badges];
            newBadges.splice(caretPosition, 1);
            setBadges(newBadges);

            // Keep caret position unless we removed the last badge
            if (caretPosition >= newBadges.length) {
              setCaretPosition(-1); // Move to input
            }
          }
          break;
      }
    }

    // Handle suggestions navigation
    if (showSuggestions) {
      const flatList = getFlatSuggestionsList(suggestions, mentionType);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveSuggestionIndex(prev => prev < flatList.length - 1 ? prev + 1 : prev);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveSuggestionIndex(prev => prev > 0 ? prev - 1 : 0);
          break;
        case "Enter":
          e.preventDefault();
          if (flatList.length > 0) {
            selectSuggestion(flatList[activeSuggestionIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowSuggestions(false);
          break;
        default:
          break;
      }
    }
  };

  const selectSuggestion = (suggestion: Suggestion) => {
    if (!searchInputRef?.current) return;

    const prefix = mentionType === "@" ? "@" : "#";

    // Create a new badge
    const newBadge: Badge = {
      id: suggestion.id,
      type: suggestion.type,
      name: suggestion.name,
      prefix: prefix as "@" | "#",
    };

    // Add the badge to the list
    setBadges(prev => [...prev, newBadge]);

    // Clear the input and hide suggestions
    setInputValue("");
    setShowSuggestions(false);
    setCaretPosition(-1); // Set caret to input after adding badge

    // Focus the input
    setTimeout(() => {
      if (searchInputRef?.current) {
        searchInputRef.current.focus();
      }
    }, 0);
  };

  const handleBadgeClick = (index: number) => {
    setCaretPosition(index);
    if (searchInputRef?.current) {
      searchInputRef.current.focus();
    }
  };

  // Reset caret position when clicking on input
  const handleInputClick = () => {
    setCaretPosition(-1);
  };

  const clearAll = () => {
    setBadges([]);
    setInputValue("");
    setCaretPosition(-1);
    clearSearch();
  };

  return (
    <div className="relative">
      <div
        className={cn([
          "w-72 hidden sm:flex flex-row items-center gap-2 h-[34px]",
          "text-neutral-500 hover:text-neutral-600",
          "border border-border rounded-md px-2 py-2 bg-transparent hover:bg-white",
          "transition-colors duration-200",
        ])}
        onClick={() => focusSearch()}
      >
        <SearchIcon className="h-4 w-4 text-neutral-500 flex-shrink-0" />

        <div className="flex flex-1 items-center gap-1.5 flex-wrap overflow-hidden">
          {badges.map((badge, index) => (
            <SearchBadge
              key={badge.id}
              badge={badge}
              isActive={caretPosition === index}
              onClick={() => handleBadgeClick(index)}
              ref={(el) => {
                badgeRefs.current[index] = el;
              }}
            />
          ))}

          <input
            ref={searchInputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onClick={handleInputClick}
            placeholder={badges.length === 0 ? "Search... (@ for mentions, # for tags)" : ""}
            className="flex-1 min-w-[50px] bg-transparent outline-none text-xs"
          />
        </div>

        {(badges.length > 0 || inputValue) && (
          <XIcon
            onClick={clearAll}
            className="h-4 w-4 text-neutral-400 hover:text-neutral-600 flex-shrink-0"
          />
        )}

        {!badges.length && !inputValue && <Shortcut macDisplay="⌘K" windowsDisplay="Ctrl+K" />}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <SuggestionDropdown
          ref={suggestionsRef}
          suggestions={suggestions}
          mentionType={mentionType}
          activeSuggestionIndex={activeSuggestionIndex}
          onSelectSuggestion={selectSuggestion}
          getFlatSuggestionsList={(suggestions) => getFlatSuggestionsList(suggestions, mentionType)}
          groupedMentionSuggestions={groupedMentionSuggestions}
        />
      )}
    </div>
  );
}
