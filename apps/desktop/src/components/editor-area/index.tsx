import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useHypr, useOngoingSession, useSession } from "@/contexts";
import { ENHANCE_SYSTEM_TEMPLATE_KEY, ENHANCE_USER_TEMPLATE_KEY } from "@/templates";
import { commands as analyticsCommands } from "@hypr/plugin-analytics";
import { commands as dbCommands } from "@hypr/plugin-db";
import { commands as listenerCommands } from "@hypr/plugin-listener";
import { commands as miscCommands } from "@hypr/plugin-misc";
import { commands as templateCommands } from "@hypr/plugin-template";
import Editor, { TiptapEditor } from "@hypr/tiptap/editor";
import Renderer from "@hypr/tiptap/renderer";
import { cn } from "@hypr/ui/lib/utils";
import { modelProvider, smoothStream, streamText } from "@hypr/utils/ai";
import { NoteHeader } from "./note-header";
import { EnhanceButton } from "./enhance-button";

interface EditorAreaProps {
  editable: boolean;
  sessionId: string;
}

export default function EditorArea({ editable, sessionId }: EditorAreaProps) {
  const [showRaw, setShowRaw] = useState(true);
  const { userId } = useHypr();

  const ongoingSessionTimeline = useOngoingSession((s) => s.timeline);
  const sessionStore = useSession(sessionId, (s) => ({
    session: s.session,
    updateRawNote: s.updateRawNote,
    updateEnhancedNote: s.updateEnhancedNote,
    persistSession: s.persistSession,
  }));

  const editorRef = useRef<{ editor: TiptapEditor | null }>(null);

  const [initialContent, setInitialContent] = useState("");
  const [editorKey, setEditorKey] = useState(sessionStore.session?.id || "default");

  useEffect(() => {
    if (sessionStore.session?.id) {
      setEditorKey(`${sessionStore.session.id}-${showRaw ? "raw" : "enhanced"}-${Date.now()}`);
      
      const content = showRaw
        ? sessionStore.session?.raw_memo_html
        : sessionStore.session?.enhanced_memo_html;
      
      setInitialContent(content ?? "");
    }
  }, [sessionStore.session?.id, showRaw]);

  const enhance = useMutation({
    mutationFn: async () => {
      setInitialContent("");

      const config = await dbCommands.getConfig();
      const provider = await modelProvider();

      const timeline = await listenerCommands.getTimeline({
        last_n_seconds: null,
      });

      const systemMessage = await templateCommands.render(
        ENHANCE_SYSTEM_TEMPLATE_KEY,
        {
          config,
        },
      );

      const userMessage = await templateCommands.render(
        ENHANCE_USER_TEMPLATE_KEY,
        {
          editor: sessionStore.session?.raw_memo_html ?? "",
          timeline: timeline,
        },
      );

      const { text, textStream } = streamText({
        model: provider.languageModel("any"),
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
        experimental_transform: [
          smoothStream({ delayInMs: 100, chunking: "line" }),
        ],
      });

      let acc = "";
      for await (const chunk of textStream) {
        acc += chunk;
        const html = await miscCommands.opinionatedMdToHtml(acc);

        setInitialContent(html);
        sessionStore.updateEnhancedNote(html);
      }

      return text.then(miscCommands.opinionatedMdToHtml);
    },
    onSuccess: () => {
      sessionStore.persistSession();
    },
    onError: (error) => {
      console.error(error);
    },
  });

  const handleChangeNote = useCallback(
    (content: string) => {
      if (showRaw) {
        sessionStore.updateRawNote(content);
      } else {
        sessionStore.updateEnhancedNote(content);
      }

      sessionStore.persistSession(); // TODO
    },
    [showRaw, sessionStore],
  );

  const handleClickEnhance = useCallback(() => {
    analyticsCommands.event({
      event: "enhance_note_clicked",
      distinct_id: userId,
      session_id: sessionId,
    });

    enhance.mutate();
    setShowRaw(false);
  }, [enhance, setShowRaw]);

  const safelyFocusEditor = useCallback(() => {
    if (editorRef.current?.editor && editorRef.current.editor.isEditable) {
      requestAnimationFrame(() => {
        editorRef.current?.editor?.commands.focus();
      });
    }
  }, []);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <NoteHeader
        sessionId={sessionId}
        editable={editable}
        onNavigateToEditor={safelyFocusEditor}
      />

      <div
        id="editor-content-area"
        className={cn([
          "h-full overflow-y-auto",
          enhance.status === "pending" && "tiptap-animate",
          ongoingSessionTimeline?.items?.length && "pb-16",
        ])}
        onClick={(e) => {
          e.stopPropagation();
          safelyFocusEditor();
        }}
      >
        <div>
          {editable
            ? (
              <Editor
                key={editorKey}
                ref={editorRef}
                handleChange={handleChangeNote}
                initialContent={initialContent}
                editable={enhance.status !== "pending"}
              />
            )
            : (
              <Renderer
                key={editorKey}
                ref={editorRef}
                initialContent={initialContent}
              />
            )}
        </div>
      </div>

      <AnimatePresence>
        <motion.div
          className="absolute bottom-4 w-full flex justify-center items-center pointer-events-none z-10"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="pointer-events-auto">
            <EnhanceButton
              handleClick={handleClickEnhance}
              session={sessionStore.session}
              showRaw={showRaw}
              enhanceStatus={enhance.status}
              setShowRaw={setShowRaw}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
