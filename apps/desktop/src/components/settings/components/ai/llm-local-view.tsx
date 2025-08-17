import { useQuery } from "@tanstack/react-query";
import { openPath } from "@tauri-apps/plugin-opener";
import { CloudIcon, DownloadIcon, FolderIcon, HelpCircleIcon } from "lucide-react";
import { useEffect } from "react";

import { useLicense } from "@/hooks/use-license";
import { commands as localLlmCommands, type SupportedModel } from "@hypr/plugin-local-llm";
import { commands as connectorCommands } from "@hypr/plugin-connector";
import { Button } from "@hypr/ui/components/ui/button";
import { cn } from "@hypr/ui/lib/utils";
import { type LLMModel, SharedLLMProps } from "./shared";

interface ExtendedSharedLLMProps extends SharedLLMProps {
  setOpenAccordion: (accordion: "others" | "openai" | "gemini" | "openrouter" | null) => void;
}

export function LLMLocalView({
  customLLMEnabled,
  selectedLLMModel,
  setSelectedLLMModel,
  setCustomLLMEnabledMutation,
  downloadingModels,
  llmModelsState,
  handleModelDownload,
  configureCustomEndpoint,
  setOpenAccordion,
}: ExtendedSharedLLMProps) {
  const { getLicense } = useLicense();
  const isPro = !!getLicense.data?.valid;

  const currentLLMModel = useQuery({
    queryKey: ["current-llm-model"],
    queryFn: () => localLlmCommands.getCurrentModel(),
  });

  const providerSource = useQuery({
    queryKey: ["provider-source"],
    queryFn: () => connectorCommands.getProviderSource(),
  });

  const handleShowFileLocation = async () => {
    localLlmCommands.modelsDir().then((path) => openPath(path));
  };

  useEffect(() => {
    // Auto-select current local model when switching away from remote endpoints
    if (currentLLMModel.data && !customLLMEnabled.data) {
      setSelectedLLMModel(currentLLMModel.data);
    }
  }, [currentLLMModel.data, customLLMEnabled.data, setSelectedLLMModel]);

  // Remove the effect that was forcing HyprCloud selection - it was preventing local model selection

  const handleLocalModelSelection = async (model: LLMModel) => {
    if (model.available && model.downloaded) {
      // Update UI state first for immediate feedback
      setSelectedLLMModel(model.key);
      
      // Then update backend state
      await localLlmCommands.setCurrentModel(model.key as SupportedModel);
      
      // Disable custom LLM (this will route to local model)
      setCustomLLMEnabledMutation.mutate(false);
      setOpenAccordion(null);
      
      // Restart server for local model
      localLlmCommands.restartServer();
    }
  };

  const handleHyprCloudSelection = () => {
    setSelectedLLMModel("hyprcloud");
    // Enable customLLMEnabled for HyprCloud since it's a remote endpoint
    setCustomLLMEnabledMutation.mutate(true);
    setOpenAccordion(null);
    configureCustomEndpoint({
      provider: "hyprcloud",
      api_base: "https://pro.hyprnote.com",
      api_key: "",
      model: "",
    });
  };

  const isHyprCloudSelected = providerSource.data === "hyprcloud" && customLLMEnabled.data;

  // Base button class to remove default styling
  const buttonResetClass = "appearance-none border-0 outline-0 bg-transparent p-0 m-0 font-inherit text-left w-full";

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <div className="space-y-2">
          {/* HyprCloud Option */}
          <div
            className={cn(
              "group relative p-3 rounded-lg border-2 transition-all",
              isPro ? "" : "opacity-50",
              isHyprCloudSelected
                ? "border-solid border-blue-500 bg-blue-50"
                : "border-dashed border-gray-300 hover:border-gray-400 bg-white",
            )}
          >
            <div className="flex items-center justify-between">
              <button
                onClick={handleHyprCloudSelection}
                disabled={!isPro}
                className={cn(
                  buttonResetClass,
                  isPro ? "cursor-pointer" : "cursor-not-allowed",
                  "flex-1 min-w-0 block",
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base text-gray-900 flex items-center gap-2">
                      <CloudIcon className="w-4 h-4" />
                      HyprCloud
                    </h3>
                    <p className="text-sm text-gray-600">
                      Managed LLM endpoint for Pro users. Click blue button to learn more.
                    </p>
                  </div>
                </div>
              </button>
              <a
                href="https://docs.hyprnote.com/pro/cloud"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-600 hover:text-blue-800 transition-colors relative z-10 ml-2"
              >
                <HelpCircleIcon className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Separator */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-gray-50 text-gray-500">or use local models</span>
            </div>
          </div>

          {/* Local Models */}
          {llmModelsState.map((model) => (
            <button
              key={model.key}
              onClick={() => handleLocalModelSelection(model)}
              disabled={!model.available || !model.downloaded}
              className={cn(
                buttonResetClass,
                "group relative p-3 rounded-lg border-2 transition-all flex items-center justify-between",
                selectedLLMModel === model.key && model.available && model.downloaded && !customLLMEnabled.data
                  ? "border-solid border-blue-500 bg-blue-50 cursor-pointer"
                  : model.available && model.downloaded
                  ? "border-dashed border-gray-300 hover:border-gray-400 bg-white cursor-pointer"
                  : "border-dashed border-gray-200 bg-gray-50 cursor-not-allowed",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4">
                  <div className="min-w-0">
                    <h3
                      className={cn(
                        "font-semibold text-base",
                        model.available && model.downloaded ? "text-gray-900" : "text-gray-400",
                      )}
                    >
                      {model.name}
                    </h3>
                    <p
                      className={cn(
                        "text-sm",
                        model.available && model.downloaded ? "text-gray-600" : "text-gray-400",
                      )}
                    >
                      {model.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {!model.available
                  ? (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full whitespace-nowrap">
                      Coming Soon
                    </span>
                  )
                  : model.downloaded
                  ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowFileLocation();
                      }}
                      className="text-xs h-7 px-2 flex items-center gap-1"
                    >
                      <FolderIcon className="w-3 h-3" />
                      Show in Finder
                    </Button>
                  )
                  : downloadingModels.has(model.key)
                  ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="text-xs h-7 px-2 flex items-center gap-1 text-blue-600 border-blue-200"
                    >
                      Downloading...
                    </Button>
                  )
                  : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleModelDownload(model.key);
                      }}
                      className="text-xs h-7 px-2 flex items-center gap-1"
                    >
                      <DownloadIcon className="w-3 h-3" />
                      {model.size}
                    </Button>
                  )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
