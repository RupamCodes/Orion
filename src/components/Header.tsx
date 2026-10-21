'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';

interface HeaderProps {
  sourcesCount: number;
  selectedSourcesCount: number;
  isOllamaConnected: boolean;
  selectedModel: string;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  sourcesCount,
  selectedSourcesCount,
  onOpenSettings
}) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="h-12 border-b border-surface-border bg-surface-panel px-5 flex items-center justify-between sticky top-0 z-40 transition-colors">
      {/* Pure Clean Wordmark */}
      <div className="flex items-center gap-2 select-none">
        <span className="text-sm font-semibold tracking-tight font-sans">
          Orion
        </span>
        {sourcesCount > 0 && (
          <span className="text-[11px] font-mono opacity-60">
            ({selectedSourcesCount} active)
          </span>
        )}
      </div>

      {/* Settings & Theme */}
      <div className="flex items-center gap-2">
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-md hover:bg-surface-hover text-inherit opacity-70 hover:opacity-100 transition-colors"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md hover:bg-surface-hover text-inherit opacity-70 hover:opacity-100 transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
