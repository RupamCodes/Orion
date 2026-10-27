'use client';

import React, { useState, useEffect } from 'react';
import { LocalModelSettings } from '../lib/types';
import { checkOllamaConnection } from '../lib/local-rag';
import { 
  ShieldCheck, 
  Sliders, 
  X, 
  RotateCw, 
  Server
} from 'lucide-react';

interface ModelSettingsModalProps {
  settings: LocalModelSettings;
  onUpdateSettings: (settings: LocalModelSettings) => void;
  onClose: () => void;
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose
}) => {
  const [currentSettings, setCurrentSettings] = useState<LocalModelSettings>(settings);
  const [isChecking, setIsChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ isAvailable: boolean; models: string[] }>({
    isAvailable: false,
    models: []
  });

  const checkConnection = async () => {
    setIsChecking(true);
    const result = await checkOllamaConnection(currentSettings.ollamaUrl);
    setConnectionStatus(result);
    if (result.isAvailable && result.models.length > 0 && !result.models.includes(currentSettings.selectedModel)) {
      setCurrentSettings(prev => ({ ...prev, selectedModel: result.models[0] }));
    }
    setIsChecking(false);
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const handleSave = () => {
    onUpdateSettings(currentSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-surface-panel border border-surface-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-inherit">
        {/* Header */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-panel">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-surface-base border border-surface-border text-inherit">
              <Sliders className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-inherit">
                Engine & RAG Settings
              </h2>
              <p className="text-xs opacity-60">
                100% On-Device Inference • Zero API Keys
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-surface-base hover:bg-surface-hover border border-surface-border text-inherit opacity-70 hover:opacity-100 transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Status Box */}
          <div className="p-3.5 rounded-xl border border-surface-border bg-surface-base text-inherit">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs">
                {connectionStatus.isAvailable ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Ollama Daemon Connected</span>
                  </>
                ) : (
                  <>
                    <Server className="w-4 h-4 text-amber-500" />
                    <span>Local RAG Mode</span>
                  </>
                )}
              </div>
              <button
                onClick={checkConnection}
                disabled={isChecking}
                className="px-2.5 py-1 rounded-lg bg-surface-panel border border-surface-border hover:bg-surface-hover text-[11px] text-inherit opacity-80 hover:opacity-100 flex items-center gap-1 font-medium transition-colors"
              >
                <RotateCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                Test
              </button>
            </div>
            <p className="text-[11px] opacity-60 leading-relaxed">
              {connectionStatus.isAvailable
                ? `Found ${connectionStatus.models.length} local models in Ollama.`
                : `No Ollama daemon detected at ${currentSettings.ollamaUrl}. Orion is running on standalone local RAG mode.`}
            </p>
          </div>

          {/* Host URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-inherit opacity-90">
              Ollama Host Endpoint
            </label>
            <input
              type="text"
              value={currentSettings.ollamaUrl}
              onChange={(e) => setCurrentSettings({ ...currentSettings, ollamaUrl: e.target.value })}
              className="w-full bg-surface-base border border-surface-border rounded-xl px-3 py-2 text-xs text-inherit font-mono focus:outline-none focus:border-surface-borderHover"
            />
          </div>

          {/* Model Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-inherit opacity-90">
              Active LLM Model
            </label>
            {connectionStatus.isAvailable && connectionStatus.models.length > 0 ? (
              <select
                value={currentSettings.selectedModel}
                onChange={(e) => setCurrentSettings({ ...currentSettings, selectedModel: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded-xl px-3 py-2 text-xs text-inherit font-mono focus:outline-none focus:border-surface-borderHover"
              >
                {connectionStatus.models.map((model) => (
                  <option key={model} value={model} className="bg-surface-panel text-inherit">
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={currentSettings.selectedModel}
                onChange={(e) => setCurrentSettings({ ...currentSettings, selectedModel: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded-xl px-3 py-2 text-xs text-inherit font-mono focus:outline-none focus:border-surface-borderHover"
                placeholder="llama3.2:latest, mistral, orion"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-surface-border bg-surface-panel flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-xs hover:bg-surface-hover text-inherit opacity-70 hover:opacity-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-black dark:hover:bg-zinc-100 font-medium text-xs transition-colors shadow-sm"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
