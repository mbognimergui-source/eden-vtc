import { useState, useCallback, useRef } from 'react';
import { client } from '@/lib/client';
import { usePolling } from '@/hooks/usePolling';
import { isRateLimitError } from '@/lib/pollingScheduler';

export interface SecurityAlert {
  id: number;
  alert_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  source_ip: string | null;
  target_path: string | null;
  description: string;
  details: string | null;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AlertStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unresolved: number;
  last24h: number;
  lastHour: number;
}

interface UseSecurityAlertsReturn {
  alerts: SecurityAlert[];
  stats: AlertStats;
  loading: boolean;
  error: string | null;
  unreadCount: number;
  newAlerts: SecurityAlert[];
  resolveAlert: (id: number, resolvedBy: string) => Promise<void>;
  dismissNewAlerts: () => void;
  refresh: () => Promise<void>;
}

// Panneau administrateur uniquement : une minute de latence est acceptable.
const POLL_INTERVAL = 60000; // 60 secondes
const STORAGE_KEY = 'eden_vtc_last_alert_seen';

export function useSecurityAlerts(): UseSecurityAlertsReturn {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newAlerts, setNewAlerts] = useState<SecurityAlert[]>([]);
  const lastSeenIdRef = useRef<number>(
    parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
  );

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await client.entities.security_alerts.query({
        query: {},
        sort: '-created_at',
        limit: 100,
      });

      if (response?.items) {
        const fetchedAlerts = response.items as SecurityAlert[];
        setAlerts(fetchedAlerts);

        // Detect new alerts since last seen
        const lastSeenId = lastSeenIdRef.current;
        const freshAlerts = fetchedAlerts.filter(
          (a) => a.id > lastSeenId && !a.is_resolved
        );

        if (freshAlerts.length > 0) {
          setNewAlerts((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            const uniqueNew = freshAlerts.filter((a) => !existingIds.has(a.id));
            return [...uniqueNew, ...prev].slice(0, 20);
          });
        }

        setError(null);
      }
    } catch (err) {
      if (isRateLimitError(err)) {
        // Limitation temporaire : ce n'est pas une panne, on informe sobrement
        // et on propage pour que le sondage patiente le délai demandé.
        setError('Trop de requêtes — actualisation dans quelques instants…');
        setLoading(false);
        throw err;
      }
      console.error('Failed to fetch security alerts:', err);
      setError('Impossible de charger les alertes de sécurité');
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveAlert = useCallback(async (id: number, resolvedBy: string) => {
    try {
      await client.entities.security_alerts.update({
        id: String(id),
        data: {
          is_resolved: true,
          resolved_by: resolvedBy,
          resolved_at: new Date().toISOString(),
        },
      });

      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, is_resolved: true, resolved_by: resolvedBy, resolved_at: new Date().toISOString() }
            : a
        )
      );

      setNewAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to resolve alert:', err);
      throw err;
    }
  }, []);

  const dismissNewAlerts = useCallback(() => {
    if (alerts.length > 0) {
      const maxId = Math.max(...alerts.map((a) => a.id));
      lastSeenIdRef.current = maxId;
      localStorage.setItem(STORAGE_KEY, String(maxId));
    }
    setNewAlerts([]);
  }, [alerts]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await fetchAlerts();
    } catch {
      // Erreur déjà reflétée dans l'état ; le sondage reprendra.
    }
  }, [fetchAlerts]);

  // Calculate stats
  const stats: AlertStats = {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    high: alerts.filter((a) => a.severity === 'high').length,
    medium: alerts.filter((a) => a.severity === 'medium').length,
    low: alerts.filter((a) => a.severity === 'low').length,
    unresolved: alerts.filter((a) => !a.is_resolved).length,
    last24h: alerts.filter((a) => {
      const created = new Date(a.created_at).getTime();
      return Date.now() - created < 24 * 60 * 60 * 1000;
    }).length,
    lastHour: alerts.filter((a) => {
      const created = new Date(a.created_at).getTime();
      return Date.now() - created < 60 * 60 * 1000;
    }).length,
  };

  const unreadCount = newAlerts.length;

  // Sondage coordonné : respecte le délai Retry-After en cas de HTTP 429
  usePolling(fetchAlerts, {
    interval: POLL_INTERVAL,
    maxInterval: 120_000,
  });

  return {
    alerts,
    stats,
    loading,
    error,
    unreadCount,
    newAlerts,
    resolveAlert,
    dismissNewAlerts,
    refresh,
  };
}