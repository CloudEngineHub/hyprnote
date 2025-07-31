import { message } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import { useLicense } from "@/hooks/use-license";
import { commands as analyticsCommands } from "@hypr/plugin-analytics";
import { commands as connectorCommands } from "@hypr/plugin-connector";
import { commands as dbCommands } from "@hypr/plugin-db";
import { commands as miscCommands } from "@hypr/plugin-misc";
import { commands as templateCommands } from "@hypr/plugin-template";
import { modelProvider, streamText } from "@hypr/utils/ai";
import { useSessions } from "@hypr/utils/contexts";

import type { ActiveEntityInfo, Message } from "../types/chat-types";
import { parseMarkdownBlocks } from "../utils/markdown-parser";

interface UseChatLogicProps {
  sessionId: string | null;
  userId: string | null;
  activeEntity: ActiveEntityInfo | null;
  messages: Message[];
  inputValue: string;
  hasChatStarted: boolean;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setInputValue: (value: string) => void;
  setHasChatStarted: (started: boolean) => void;
  getChatGroupId: () => Promise<string>;
  sessionData: any;
  chatInputRef: React.RefObject<HTMLTextAreaElement>;
}

export function useChatLogic({
  sessionId,
  userId,
  activeEntity,
  messages,
  inputValue,
  hasChatStarted,
  setMessages,
  setInputValue,
  setHasChatStarted,
  getChatGroupId,
  sessionData,
  chatInputRef,
}: UseChatLogicProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const sessions = useSessions((state) => state.sessions);
  const { getLicense } = useLicense();

  const handleApplyMarkdown = async (markdownContent: string) => {
    if (!sessionId) {
      console.error("No session ID available");
      return;
    }

    const sessionStore = sessions[sessionId];
    if (!sessionStore) {
      console.error("Session not found in store");
      return;
    }

    try {
      const html = await miscCommands.opinionatedMdToHtml(markdownContent);

      sessionStore.getState().updateEnhancedNote(html);

      console.log("Applied markdown content to enhanced note");
    } catch (error) {
      console.error("Failed to apply markdown content:", error);
    }
  };

  const prepareMessageHistory = async (messages: Message[], currentUserMessage?: string, mentionedNotes?: Array<{ id: string; type: string; label: string }>) => {
    const refetchResult = await sessionData.refetch();
    let freshSessionData = refetchResult.data;

    const { type } = await connectorCommands.getLlmConnection();

    const participants = sessionId ? await dbCommands.sessionListParticipants(sessionId) : [];

    const calendarEvent = sessionId ? await dbCommands.sessionGetEvent(sessionId) : null;

    const currentDateTime = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const eventInfo = calendarEvent
      ? `${calendarEvent.name} (${calendarEvent.start_date} - ${calendarEvent.end_date})${
        calendarEvent.note ? ` - ${calendarEvent.note}` : ""
      }`
      : "";

    const systemContent = await templateCommands.render("ai_chat.system", {
      session: freshSessionData,
      words: JSON.stringify(freshSessionData?.words || []),
      title: freshSessionData?.title,
      enhancedContent: freshSessionData?.enhancedContent,
      rawContent: freshSessionData?.rawContent,
      preMeetingContent: freshSessionData?.preMeetingContent,
      type: type,
      date: currentDateTime,
      participants: participants,
      event: eventInfo,
    });

    console.log("systemContent", systemContent);

    const conversationHistory: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system" as const, content: systemContent },
    ];

    messages.forEach(message => {
      conversationHistory.push({
        role: message.isUser ? ("user" as const) : ("assistant" as const),
        content: message.content,
      });
    });

    currentUserMessage += "[[From here is an automatically appended content from the mentioned notes, not what the user wrote. Use this only as a reference for more context. Your focus should always be the current meeting user is viewing]]" + "\n\n";

    if (mentionedNotes && mentionedNotes.length > 0) {
      // Fetch note content for each mentioned note
      const noteContents: string[] = [];
      
      for (const mention of mentionedNotes) {
        try {
          const sessionData = await dbCommands.getSession({ id: mention.id });
          
          if (sessionData) {
            let noteContent = "";
            
            if (sessionData.enhanced_memo_html && sessionData.enhanced_memo_html.trim() !== "") {
              noteContent = sessionData.enhanced_memo_html;
            } else if (sessionData.raw_memo_html && sessionData.raw_memo_html.trim() !== "") {
              noteContent = sessionData.raw_memo_html;
            } else {
              continue;
            }
            
            // Add note content with header
            noteContents.push(`\n\n--- Content from "${mention.label}" ---\n${noteContent}`);
          } else {
            console.log(`Could not fetch session data for "${mention.label}" (ID: ${mention.id})`);
          }
        } catch (error) {
          console.error(`Error fetching content for "${mention.label}":`, error);
        }
      }
      
      // Append all note contents to the current user message
      if (noteContents.length > 0) {
        currentUserMessage = currentUserMessage + noteContents.join("");
      }
    }

    console.log("appended currentUserMessage", currentUserMessage);

    if (currentUserMessage) {
      conversationHistory.push({
        role: "user" as const,
        content: currentUserMessage, // This now includes the mentioned note content
      });
    }

    return conversationHistory;
  };

  const processUserMessage = async (
    content: string, 
    analyticsEvent: string, 
    mentionedNotes?: Array<{ id: string; type: string; label: string }>
  ) => {
   
    if (!content.trim() || isGenerating) {
      return;
    }

    if (messages.length >= 6 && !getLicense.data?.valid) {
      if (userId) {
        await analyticsCommands.event({
          event: "pro_license_required_chat",
          distinct_id: userId,
        });
      }
      await message("3 messages are allowed per conversation for free users.", {
        title: "Pro License Required",
        kind: "info",
      });
      return;
    }

    if (userId) {
      await analyticsCommands.event({
        event: analyticsEvent,
        distinct_id: userId,
      });
    }

    if (!hasChatStarted && activeEntity) {
      setHasChatStarted(true);
    }

    setIsGenerating(true);

    const groupId = await getChatGroupId();

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    await dbCommands.upsertChatMessage({
      id: userMessage.id,
      group_id: groupId,
      created_at: userMessage.timestamp.toISOString(),
      role: "User",
      content: userMessage.content.trim(),
    });

    try {
      const provider = await modelProvider();
      const model = provider.languageModel("defaultModel");

      const aiMessageId = (Date.now() + 1).toString();
      const aiMessage: Message = {
        id: aiMessageId,
        content: "Generating...",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      const { textStream } = streamText({
        model,
        messages: await prepareMessageHistory(messages, content, mentionedNotes),
      });

      let aiResponse = "";

      for await (const chunk of textStream) {
        aiResponse += chunk;

        const parts = parseMarkdownBlocks(aiResponse);

        setMessages((prev) =>
          prev.map(msg =>
            msg.id === aiMessageId
              ? {
                ...msg,
                content: aiResponse,
                parts: parts,
              }
              : msg
          )
        );
      }

      await dbCommands.upsertChatMessage({
        id: aiMessageId,
        group_id: groupId,
        created_at: new Date().toISOString(),
        role: "Assistant",
        content: aiResponse.trim(),
      });

      setIsGenerating(false);
    } catch (error) {
      console.error("AI error:", error);

      setIsGenerating(false);

      const errorMessageId = (Date.now() + 1).toString();
      const aiMessage: Message = {
        id: errorMessageId,
        content: "Sorry, I encountered an error. Please try again.",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      await dbCommands.upsertChatMessage({
        id: errorMessageId,
        group_id: groupId,
        created_at: new Date().toISOString(),
        role: "Assistant",
        content: "Sorry, I encountered an error. Please try again.",
      });
    }
  };

  const handleSubmit = async (mentionedNotes?: Array<{ id: string; type: string; label: string }>) => {
    await processUserMessage(inputValue, "chat_message_sent", mentionedNotes);
  };

  const handleQuickAction = async (prompt: string) => {
    await processUserMessage(prompt, "chat_quickaction_sent");

    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return {
    isGenerating,
    handleSubmit,
    handleQuickAction,
    handleApplyMarkdown,
    handleKeyDown,
  };
}
