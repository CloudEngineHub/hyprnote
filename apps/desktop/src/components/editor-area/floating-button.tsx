import { RefreshCwIcon, TypeOutlineIcon, XIcon, ZapIcon, PlusIcon } from "lucide-react";
import { useEffect, useState, useRef } from "react";

import { useEnhancePendingState } from "@/hooks/enhance-pending";
import { Session, Template } from "@hypr/plugin-db";
import { SplashLoader as EnhanceWIP } from "@hypr/ui/components/ui/splash";
import { Popover, PopoverContent, PopoverTrigger } from "@hypr/ui/components/ui/popover";
import { cn } from "@hypr/ui/lib/utils";
import { useOngoingSession, useSession } from "@hypr/utils/contexts";
import { commands as windowsCommands } from "@hypr/plugin-windows";

interface FloatingButtonProps {
  session: Session;
  handleEnhance: () => void;
  handleEnhanceWithTemplate: (templateId: string) => void;
  templates: Template[];
  isError: boolean;
}

export function FloatingButton({
  session,
  handleEnhance,
  handleEnhanceWithTemplate,
  templates,
  isError,
}: FloatingButtonProps) {
  const [showRaw, setShowRaw] = useSession(session.id, (s) => [
    s.showRaw,
    s.setShowRaw,
  ]);
  const cancelEnhance = useOngoingSession((s) => s.cancelEnhance);
  const isEnhancePending = useEnhancePendingState(session.id);
  const [isHovered, setIsHovered] = useState(false);
  const [showRefreshIcon, setShowRefreshIcon] = useState(true);
  const [showTemplatePopover, setShowTemplatePopover] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeout on cleanup
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isHovered) {
      setShowRefreshIcon(true);
    }
  }, [isHovered]);

  const handleRawView = () => {
    setShowRaw(true);
  };

  const handleEnhanceOrReset = () => {
    if (showRaw) {
      setShowRaw(false);
      setShowRefreshIcon(false);
      setShowTemplatePopover(false);
      return;
    }

    if (isEnhancePending) {
      cancelEnhance();
    } else {
      handleEnhance();
    }
  };

  const showPopover = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (!showRaw && !isEnhancePending && showRefreshIcon) {
      setShowTemplatePopover(true);
    }
  };

  const hidePopover = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTemplatePopover(false);
    }, 100);
  };

  // Simple template selection - just call parent function
  const handleTemplateSelect = (templateId: string) => {
    setShowTemplatePopover(false);
    handleEnhanceWithTemplate(templateId);
  };

  // Helper function to extract emoji and clean name
  const extractEmojiAndName = (title: string) => {
    const emojiMatch = title.match(/^(\p{Emoji})\s*/u);
    if (emojiMatch) {
      return {
        emoji: emojiMatch[1],
        name: title.replace(/^(\p{Emoji})\s*/u, '').trim()
      };
    }
    
    // Fallback emoji based on keywords if no emoji in title
    const lowercaseTitle = title.toLowerCase();
    let fallbackEmoji = "📄";
    if (lowercaseTitle.includes("meeting")) fallbackEmoji = "💼";
    if (lowercaseTitle.includes("interview")) fallbackEmoji = "👔";
    if (lowercaseTitle.includes("standup")) fallbackEmoji = "☀️";
    if (lowercaseTitle.includes("review")) fallbackEmoji = "📝";
    
    return {
      emoji: fallbackEmoji,
      name: title
    };
  };

  const handleAddTemplate = async () => {
    setShowTemplatePopover(false);
    try {
      // Open settings window
      await windowsCommands.windowShow({ type: "settings" });
      // Navigate to templates tab
      await windowsCommands.windowNavigate({ type: "settings" }, "/app/settings?tab=templates");
    } catch (error) {
      console.error("Failed to open settings/templates:", error);
    }
  };

  if (isError) {
    const errorRetryButtonClasses = cn(
      "rounded-xl border",
      "border-border px-4 py-2.5 transition-all ease-in-out",
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      "hover:scale-105 transition-transform duration-200",
    );

    return (
      <button
        onClick={handleEnhance}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={errorRetryButtonClasses}
      >
        <RunOrRerun showRefresh={isHovered} />
      </button>
    );
  }

  if (!session.enhanced_memo_html && !isEnhancePending) {
    return null;
  }

  const rawButtonClasses = cn(
    "rounded-l-xl border-l border-y",
    "border-border px-4 py-2.5 transition-all ease-in-out",
    showRaw
      ? "bg-primary text-primary-foreground border-black hover:bg-neutral-800"
      : "bg-background text-neutral-400 hover:bg-neutral-100",
  );

  const enhanceButtonClasses = cn(
    "rounded-r-xl border-r border-y",
    "border border-border px-4 py-2.5 transition-all ease-in-out",
    showRaw
      ? "bg-background text-neutral-400 hover:bg-neutral-100"
      : "bg-primary text-primary-foreground border-black hover:bg-neutral-800",
  );

  const showRefresh = !showRaw && (isHovered || showTemplatePopover) && showRefreshIcon;

  return (
    <div className="flex w-fit flex-row items-center group hover:scale-105 transition-transform duration-200">
      <button
        disabled={isEnhancePending}
        onClick={handleRawView}
        className={rawButtonClasses}
      >
        <TypeOutlineIcon size={20} />
      </button>

      <Popover open={showTemplatePopover && !showRaw && !isEnhancePending} onOpenChange={setShowTemplatePopover}>
        <PopoverTrigger asChild>
          <button
            onMouseEnter={() => {
              setIsHovered(true);
              showPopover();
            }}
            onMouseLeave={() => {
              setIsHovered(false);
              hidePopover();
            }}
            onClick={handleEnhanceOrReset}
            className={enhanceButtonClasses}
          >
            {isEnhancePending
              ? isHovered
                ? <XIcon size={20} />
                : <EnhanceWIP size={20} strokeWidth={2} />
              : <RunOrRerun showRefresh={showRefresh} />}
          </button>
        </PopoverTrigger>
        
        <PopoverContent 
          side="top" 
          align="center" 
          className="w-48 p-0" 
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={showPopover}
          onMouseLeave={hidePopover}
        >
          <div className="max-h-44 overflow-y-auto p-2 space-y-1">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-neutral-50 cursor-pointer text-xs text-neutral-400 hover:text-neutral-600"
              onClick={handleAddTemplate}
            >
              <PlusIcon className="w-3 h-3" />
              <span className="truncate">Add Template</span>
            </div>
            
            {/* Separator */}
            <div className="my-1 border-t border-neutral-200"></div>
            
            {/* Auto option */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-neutral-100 cursor-pointer text-sm"
              onClick={() => handleTemplateSelect("auto")}
            >
              <span className="text-sm">⚡</span>
              <span className="truncate">Hyprnote Default</span>
            </div>
            
            {/* Show separator and custom templates only if custom templates exist */}
            {templates.length > 0 && (
              <>
                <div className="my-1 border-t border-neutral-200"></div>
                {templates.map((template) => {
                  const { emoji, name } = extractEmojiAndName(template.title || "");
                  
                  return (
                    <div
                      key={template.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-neutral-100 cursor-pointer text-sm"
                      onClick={() => handleTemplateSelect(template.id)}
                    >
                      <span className="text-sm">{emoji}</span>
                      <span className="truncate">{name}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function RunOrRerun({ showRefresh }: { showRefresh: boolean }) {
  return (
    <div className="relative h-5 w-5">
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          showRefresh ? "opacity-100" : "opacity-0",
        )}
      >
        <RefreshCwIcon size={20} />
      </div>
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          showRefresh ? "opacity-0" : "opacity-100",
        )}
      >
        <ZapIcon size={20} />
      </div>
    </div>
  );
}
