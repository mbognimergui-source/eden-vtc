import { useState, useEffect, useCallback, useRef } from 'react';
import { client } from '@/lib/client';
import { toast } from 'sonner';
import { usePolling } from '@/hooks/usePolling';
import { isRateLimitError } from '@/lib/pollingScheduler';

export interface UserAlert {
  id: number;
  alert_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  details: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export interface UserAlertStats {
  total: number;
  unread: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface UseUserAlertsReturn {
  alerts: UserAlert[];
  stats: UserAlertStats;
  loading: boolean;
  unreadCount: number;
  newAlerts: UserAlert[];
  markAsRead: (alertIds: number[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissAlert: (alertId: number) => Promise<void>;
  refresh: () => Promise<void>;
}

// Les alertes de sécurité ne sont pas temps réel : une cadence lente suffit et
// libère du quota pour le suivi de course, qui est prioritaire.
const POLL_INTERVAL = 45000; // 45 secondes
const STORAGE_KEY = 'eden_vtc_last_user_alert_seen';

// Web Audio notification sound
function playAlertSound(severity: string) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (severity === 'critical') {
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } else if (severity === 'high') {
      oscillator.frequency.setValueAtTime(660, ctx.currentTime);
      oscillator.frequency.setValueAtTime(550, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } else {
      oscillator.frequency.setValueAtTime(520, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // Audio not available
  }
}

// Vibration pattern based on severity
function vibrateAlert(severity: string) {
  if (!navigator.vibrate) return;
  if (severity === 'critical') {
    navigator.vibrate([200, 100, 200, 100, 300]);
  } else if (severity === 'high') {
    navigator.vibrate([150, 80, 150]);
  } else {
    navigator.vibrate([100]);
  }
}

// Web Notification
function showWebNotification(alert: UserAlert) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const severityEmoji: Record<string, string> = {
    critical: '🚨',
    high: '⚠️',
    medium: '🔔',
    low: 'ℹ️',
  };

  try {
    new Notification(`${severityEmoji[alert.severity] || '🔔'} ${alert.title}`, {
      body: alert.message,
      icon: '/favicon.ico',
      tag: `user-alert-${alert.id}`,
      requireInteraction: alert.severity === 'critical',
    });
  } catch {
    // Notification not available
  }
}

export function requestAlertNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function useUserAlerts(isAuthenticated: boolean): UseUserAlertsReturn {
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [stats, setStats] = useState<UserAlertStats>({
    total: 0, unread: 0, critical: 0, high: 0, medium: 0, low: 0,
  });
  const [loading, setLoading] = useState(true);
  const [newAlerts, setNewAlerts] = useState<UserAlert[]>([]);
  const lastSeenIdRef = useRef<number>(
    parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
  );

  const fetchAlerts = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/user-alerts/my-alerts',
        method: 'GET',
        data: { limit: 50, include_dismissed: false },
      });

      if (response && Array.isArray(response)) {
        const fetchedAlerts = response as UserAlert[];
        setAlerts(fetchedAlerts);

        // Detect new alerts since last seen
        const lastSeenId = lastSeenIdRef.current;
        const freshAlerts = fetchedAlerts.filter(
          (a) => a.id > lastSeenId && !a.is_read && !a.is_dismissed
        );

        if (freshAlerts.length > 0) {
          setNewAlerts((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            const uniqueNew = freshAlerts.filter((a) => !existingIds.has(a.id));
            return [...uniqueNew, ...prev].slice(0, 20);
          });

          // Notify for the most severe new alert
          const mostSevere = freshAlerts.sort((a, b) => {
            const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
          })[0];

          if (mostSevere) {
            playAlertSound(mostSevere.severity);
            vibrateAlert(mostSevere.severity);
            showWebNotification(mostSevere);

            // Toast notification
            const toastFn = mostSevere.severity === 'critical' ? toast.error
              : mostSevere.severity === 'high' ? toast.warning
              : toast.info;

            toastFn(mostSevere.title, {
              description: mostSevere.message,
              duration: mostSevere.severity === 'critical' ? 10000 : 5000,
            });
          }

          // Update last seen
          const maxId = Math.max(...freshAlerts.map((a) => a.id));
          lastSeenIdRef.current = maxId;
          localStorage.setItem(STORAGE_KEY, String(maxId));
        }
      }
    } catch (err) {
      // Une limitation de débit doit être propagée pour que le sondage
      // applique le délai Retry-After au lieu de réessayer aussitôt.
      if (isRateLimitError(err)) throw err;
      // Silently fail — user may not have alerts endpoint available
      console.debug('[useUserAlerts] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const fetchStats = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/user-alerts/stats',
        method: 'GET',
      });
      if (response) {
        setStats(response as UserAlertStats);
      }
    } catch {
      // Silent
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (alertIds: number[]) => {
    try {
      await client.apiCall.invoke({
        url: '/api/v1/user-alerts/mark-read',
        method: 'POST',
        body: { alert_ids: alertIds },
      });
      setAlerts((prev) =>
        prev.map((a) => (alertIds.includes(a.id) ? { ...a, is_read: true } : a))
      );
      setNewAlerts((prev) => prev.filter((a) => !alertIds.includes(a.id)));
      fetchStats();
    } catch {
      toast.error('Erreur lors du marquage');
    }
  }, [fetchStats]);

  const markAllRead = useCallback(async () => {
    try {
      await client.apiCall.invoke({
        url: '/api/v1/user-alerts/mark-all-read',
        method: 'POST',
      });
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
      setNewAlerts([]);
      fetchStats();
    } catch {
      toast.error('Erreur lors du marquage');
    }
  }, [fetchStats]);

  const dismissAlert = useCallback(async (alertId: number) => {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/user-alerts/dismiss/${alertId}`,
        method: 'POST',
      });
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      setNewAlerts((prev) => prev.filter((a) => a.id !== alertId));
      fetchStats();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }, [fetchStats]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchAlerts(), fetchStats()]);
    } catch {
      // Le sondage automatique réessaiera après le délai d'attente.
      setLoading(false);
    }
  }, [fetchAlerts, fetchStats]);

  // Réinitialisation à la déconnexion
  useEffect(() => {
    if (!isAuthenticated) {
      setAlerts([]);
      setStats({ total: 0, unread: 0, critical: 0, high: 0, medium: 0, low: 0 });
      setLoading(false);
    }
  }, [isAuthenticated]);

  /** Un seul cycle de sondage : statistiques puis liste des alertes. */
  const pollAlerts = useCallback(async () => {
    await fetchStats();
    await fetchAlerts();
  }, [fetchAlerts, fetchStats]);

  usePolling(pollAlerts, {
    interval: POLL_INTERVAL,
    enabled: isAuthenticated,
    maxInterval: 120_000,
  });

  return {
    alerts,
    stats,
    loading,
    unreadCount: stats.unread,
    newAlerts,
    markAsRead,
    markAllRead,
    dismissAlert,
    refresh,
  };
}