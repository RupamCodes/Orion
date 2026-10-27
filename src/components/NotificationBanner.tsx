import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export type NotificationType = 'error' | 'warning' | 'success' | 'info';

export interface NotificationState {
  type: NotificationType;
  message: string;
}

interface NotificationBannerProps {
  type: NotificationType;
  message: string;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  type,
  message,
  onDismiss,
  action,
  className = '',
}) => {
  const config = {
    error: {
      icon: AlertCircle,
      bg: 'bg-rose-500/10 border-rose-500/25 text-rose-300 dark:text-rose-200',
      iconColor: 'text-rose-400',
      role: 'alert',
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-amber-500/10 border-amber-500/25 text-amber-300 dark:text-amber-200',
      iconColor: 'text-amber-400',
      role: 'alert',
    },
    success: {
      icon: CheckCircle,
      bg: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300 dark:text-emerald-200',
      iconColor: 'text-emerald-400',
      role: 'status',
    },
    info: {
      icon: Info,
      bg: 'bg-sky-500/10 border-sky-500/25 text-sky-300 dark:text-sky-200',
      iconColor: 'text-sky-400',
      role: 'status',
    },
  }[type];

  const IconComponent = config.icon;

  return (
    <div
      role={config.role}
      aria-live={type === 'error' || type === 'warning' ? 'assertive' : 'polite'}
      className={`p-2.5 px-3 rounded-xl border text-xs flex items-center justify-between gap-2.5 animate-fade-in ${config.bg} ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <IconComponent className={`w-4 h-4 shrink-0 ${config.iconColor}`} aria-hidden="true" />
        <span className="leading-snug break-words font-medium">{message}</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="px-2 py-0.5 rounded-lg bg-surface-hover hover:bg-surface-border text-inherit font-medium transition-colors text-[11px]"
          >
            {action.label}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="p-1 rounded-lg hover:bg-surface-hover opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
