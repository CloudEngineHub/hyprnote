export type MentionType = "date" | "people" | "orgs" | "notes" | "folders";
export type TagType = "tag";

export type MentionSuggestion = {
  id: string;
  type: MentionType;
  name: string;
};

export type TagSuggestion = {
  id: string;
  type: TagType;
  name: string;
};

export type Suggestion = MentionSuggestion | TagSuggestion;

export type Badge = {
  id: string;
  type: MentionType | TagType;
  name: string;
  prefix: "@" | "#";
};

export const MENTION_SECTIONS = {
  date: "Dates",
  people: "People",
  orgs: "Organizations",
  notes: "Notes",
  folders: "Folders",
};

export const BADGE_COLORS = {
  date: "bg-blue-100 text-blue-800 border-blue-200",
  people: "bg-purple-100 text-purple-800 border-purple-200",
  orgs: "bg-indigo-100 text-indigo-800 border-indigo-200",
  notes: "bg-green-100 text-green-800 border-green-200",
  folders: "bg-amber-100 text-amber-800 border-amber-200",
  tag: "bg-rose-100 text-rose-800 border-rose-200",
};

// Mock data for suggestions - in a real app, this would come from a database
export const MOCK_MENTION_SUGGESTIONS: MentionSuggestion[] = [
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

export const MOCK_TAG_SUGGESTIONS: TagSuggestion[] = [
  { id: "1", type: "tag", name: "important" },
  { id: "2", type: "tag", name: "todo" },
  { id: "3", type: "tag", name: "idea" },
  { id: "4", type: "tag", name: "meeting" },
  { id: "5", type: "tag", name: "project" },
];
