import clsx from "clsx";
import {
  BuildingIcon,
  CalendarIcon,
  FileTextIcon,
  FolderIcon,
  HashIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useHyprSearch } from "@/contexts/search";
import Shortcut from "./shortcut";

type MentionType = "date" | "people" | "orgs" | "notes" | "folders";
type TagType = "tag";

type MentionSuggestion = {
  id: string;
  type: MentionType;
  name: string;
};

type TagSuggestion = {
  id: string;
  type: TagType;
  name: string;
};

type Suggestion = MentionSuggestion | TagSuggestion;

type Badge = {
  id: string;
  type: MentionType | TagType;
  name: string;
  prefix: "@" | "#";
};

const MENTION_SECTIONS = {
  date: "Dates",
  people: "People",
  orgs: "Organizations",
  notes: "Notes",
  folders: "Folders",
};

const BADGE_COLORS = {
  date: "bg-blue-100 text-blue-800 border-blue-200",
  people: "bg-purple-100 text-purple-800 border-purple-200",
  orgs: "bg-indigo-100 text-indigo-800 border-indigo-200",
  notes: "bg-green-100 text-green-800 border-green-200",
  folders: "bg-amber-100 text-amber-800 border-amber-200",
  tag: "bg-rose-100 text-rose-800 border-rose-200",
};

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

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [mentionType, setMentionType] = useState<"@" | "#" | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [caretPosition, setCaretPosition] = useState<number>(-1); // -1 means after all badges
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const activeSuggestionRef = useRef<HTMLDivElement>(null);
  const badgeRefs = useRef<(HTMLDivElement | null)[]>([]);

  const mockMentionSuggestions: MentionSuggestion[] = [
    { id: "1", type: "date", name: "Today" },
    { id: "2", type: "date", name: "Yesterday" },
    { id: "3", type: "date", name: "Last week" },
    { id: "4", type: "people", name: "John Doe" },
    { id: "5", type: "people", name: "Jane Smith" },
    { id: "6", type: "orgs", name: "Acme Corp" },
    { id: "7", type: "orgs", name: "Globex" },
    { id: "8", type: "notes", name: "Meeting notes" },
    { id: "9", type: "notes", name: "Project ideas" },
    { id: "10", type: "folders", name: "Work" },
    { id: "11", type: "folders", name: "Personal" },
  ];

  const mockTagSuggestions: TagSuggestion[] = [
    { id: "1", type: "tag", name: "important" },
    { id: "2", type: "tag", name: "todo" },
    { id: "3", type: "tag", name: "idea" },
    { id: "4", type: "tag", name: "meeting" },
    { id: "5", type: "tag", name: "project" },
  ];

  // Initialize badge refs when badges change
  useEffect(() => {
    badgeRefs.current = badges.map(() => null);
  }, [badges.length]);

  // Update searchQuery whenever badges or inputValue changes
  useEffect(() => {
    const query = badges.map(badge => `${badge.prefix}${badge.name}`).join(" ") + 
                 (inputValue ? " " + inputValue : "");
    setSearchQuery(query.trim());
  }, [badges, inputValue, setSearchQuery]);

  const groupedMentionSuggestions = (filteredSuggestions: MentionSuggestion[]) => {
    const grouped: Record<MentionType, MentionSuggestion[]> = {
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
  };

  const getFlatSuggestionsList = (suggestions: Suggestion[]) => {
    if (mentionType === "#") return suggestions;

    const mentionSuggestions = suggestions as MentionSuggestion[];
    const grouped = groupedMentionSuggestions(mentionSuggestions);

    const flatList: MentionSuggestion[] = [];
    Object.keys(grouped).forEach(key => {
      const type = key as MentionType;
      if (grouped[type].length > 0) {
        flatList.push(...grouped[type]);
      }
    });

    return flatList;
  };

  // Scroll active suggestion into view
  useEffect(() => {
    if (activeSuggestionRef.current && suggestionsRef.current) {
      const container = suggestionsRef.current;
      const activeElement = activeSuggestionRef.current;
      
      // Get positions
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      
      // Check if the active element is outside the visible area
      if (activeRect.bottom > containerRect.bottom) {
        // If below the visible area, scroll down
        activeElement.scrollIntoView({ block: 'end', behavior: 'smooth' });
      } else if (activeRect.top < containerRect.top) {
        // If above the visible area, scroll up
        activeElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }
  }, [activeSuggestionIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    const lastAtIndex = value.lastIndexOf("@");
    const lastHashIndex = value.lastIndexOf("#");

    if (lastAtIndex !== -1 && (lastHashIndex === -1 || lastAtIndex > lastHashIndex)) {
      const mentionTextValue = value.slice(lastAtIndex + 1);
      setMentionType("@");

      const filtered = mockMentionSuggestions.filter(
        suggestion => suggestion.name.toLowerCase().includes(mentionTextValue.toLowerCase()),
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setActiveSuggestionIndex(0);
    } else if (lastHashIndex !== -1 && (lastAtIndex === -1 || lastHashIndex > lastAtIndex)) {
      const tagTextValue = value.slice(lastHashIndex + 1);
      setMentionType("#");

      const filtered = mockTagSuggestions.filter(
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
      const flatList = getFlatSuggestionsList(suggestions);

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
      prefix: prefix as "@" | "#"
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
  }, []);

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

  const renderSuggestionItem = (suggestion: Suggestion, index: number) => {
    const flatList = getFlatSuggestionsList(suggestions);
    const isActive = flatList.indexOf(suggestion) === activeSuggestionIndex;

    return (
      <div
        key={suggestion.id}
        ref={isActive ? activeSuggestionRef : null}
        className={clsx([
          "px-3 py-2 text-sm cursor-pointer hover:bg-neutral-100",
          isActive && "bg-neutral-100",
        ])}
        onClick={() => selectSuggestion(suggestion)}
      >
        <div className="flex items-center">
          <span className="mr-2">{renderSuggestionIcon(suggestion)}</span>
          <span>{suggestion.name}</span>
        </div>
      </div>
    );
  };

  const renderBadge = (badge: Badge, index: number) => {
    const isActive = caretPosition === index;
    
    return (
      <div
        key={badge.id}
        ref={el => badgeRefs.current[index] = el}
        className={clsx([
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border",
          BADGE_COLORS[badge.type],
          isActive && "ring-2 ring-offset-1 ring-neutral-400",
        ])}
        onClick={() => handleBadgeClick(index)}
      >
        <span className="flex items-center gap-1">
          {renderBadgeIcon(badge.type)}
          <span>{badge.name}</span>
        </span>
      </div>
    );
  };

  const renderMentionSuggestions = () => {
    if (mentionType !== "@") return null;

    const mentionSuggestions = suggestions as MentionSuggestion[];
    const grouped = groupedMentionSuggestions(mentionSuggestions);

    return (
      <>
        {Object.keys(grouped).map((key) => {
          const type = key as MentionType;
          const items = grouped[type];

          if (items.length === 0) return null;

          return (
            <div key={type}>
              <div className="px-3 py-1 text-xs font-medium text-neutral-500 bg-neutral-50">
                {MENTION_SECTIONS[type]}
              </div>
              {items.map((suggestion, index) => renderSuggestionItem(suggestion, index))}
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
        {suggestions.map((suggestion, index) => renderSuggestionItem(suggestion, index))}
      </>
    );
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
        className={clsx([
          "w-72 hidden sm:flex flex-row items-center gap-2 h-[34px]",
          "text-neutral-500 hover:text-neutral-600",
          "border border-border rounded-md px-2 py-2 bg-transparent hover:bg-white",
          "transition-colors duration-200",
        ])}
        onClick={() => focusSearch()}
      >
        <SearchIcon className="h-4 w-4 text-neutral-500 flex-shrink-0" />
        
        <div className="flex flex-1 items-center gap-1.5 flex-wrap overflow-hidden">
          {badges.map((badge, index) => renderBadge(badge, index))}
          
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
        <div
          ref={suggestionsRef}
          className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {mentionType === "@" ? renderMentionSuggestions() : renderTagSuggestions()}
          {suggestions.length === 0 && (
            <div className="px-3 py-2 text-sm text-neutral-500">
              No suggestions found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
