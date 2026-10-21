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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-zinc-200 text-zinc-800">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Engine & RAG Settings
              </h2>
              <p className="text-xs text-zinc-500">
                100% On-Device Inference • Zero API Keys
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Status */}
          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs">
                {connectionStatus.isAvailable ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Ollama Daemon Connected</span>
                  </>
                ) : (
                  <>
                    <Server className="w-4 h-4 text-zinc-600" />
                    <span>Local RAG Mode</span>
                  </>
                )}
              </div>
              <button
                onClick={checkConnection}
                disabled={isChecking}
                className="px-2 py-0.5 rounded bg-white border border-zinc-200 hover:bg-zinc-100 text-[11px] text-zinc-700 flex items-center gap-1 font-medium"
              >
                <RotateCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                Test
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              {connectionStatus.isAvailable
                ? `Found ${connectionStatus.models.length} local models in Ollama.`
                : `No Ollama daemon detected at ${currentSettings.ollamaUrl}. Orion is running on standalone local RAG mode.`}
            </p>
          </div>

          {/* Host URL */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-800">
              Ollama Host Endpoint
            </label>
            <input
              type="text"
              value={currentSettings.ollamaUrl}
              onChange={(e) => setCurrentSettings({ ...currentSettings, ollamaUrl: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs text-zinc-900 font-mono focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Model Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-800">
              Active LLM Model
            </label>
            {connectionStatus.isAvailable && connectionStatus.models.length > 0 ? (
              <select
                value={currentSettings.selectedModel}
                onChange={(e) => setCurrentSettings({ ...currentSettings, selectedModel: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs text-zinc-900 font-mono focus:outline-none focus:border-zinc-400"
              >
                {connectionStatus.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={currentSettings.selectedModel}
                onChange={(e) => setCurrentSettings({ ...currentSettings, selectedModel: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs text-zinc-900 font-mono focus:outline-none focus:border-zinc-400"
                placeholder="llama3.2:latest, mistral, orion"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-zinc-200 bg-zinc-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white font-medium text-xs shadow-xs"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
