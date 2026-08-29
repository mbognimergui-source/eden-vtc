import { useState, useEffect, useCallback, useRef } from 'react';
import { client } from '@/lib/client';
import { usePolling } from '@/hooks/usePolling';
import { isRateLimitError } from '@/lib/pollingScheduler';

export interface CashAlert {
  id: number;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  amount: number | null;
  ride_id: number | null;
  passenger_id: number | null;
  details: Record<string, unknown> | null;
  is_read: boolean;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string | null;
}

export interface AlertStats {
  unread: number;
  today: number;
  critical_unresolved: number;
}

export function useCashAlerts(pollingInterval = 60000) {
  const [alerts, setAlerts] = useState<CashAlert[]>([]);
  const [stats, setStats] = useState<AlertStats>({ unread: 0, today: 0, critical_unresolved: 0 });
  const [loading, setLoading] = useState(true);
  const prevUnreadRef = useRef(0);
  const [newAlertDetected, setNewAlertDetected] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const [alertsRes, statsRes] = await Promise.all([
        client.apiCall.invoke({ url: '/api/v1/cash-alerts/alerts', method: 'GET', params: { limit: 30 } }),
        client.apiCall.invoke({ url: '/api/v1/cash-alerts/stats', method: 'GET' }),
      ]);

      if (alertsRes?.data?.alerts) {
        setAlerts(alertsRes.data.alerts);
      }
      if (statsRes?.data) {
        const newStats = statsRes.data as AlertStats;
        // Détecter nouvelles alertes
        if (newStats.unread > prevUnreadRef.current && prevUnreadRef.current > 0) {
          setNewAlertDetected(true);
          // Notification navigateur
          if ('Notification' in window && Notification.permission === 'granted') {
            const latestAlert = alertsRes?.data?.alerts?.[0];
            if (latestAlert && !latestAlert.is_read) {
              new Notification('🔔 Alerte Caisse EDEN VTC', {
                body: latestAlert.message,
                icon: '/favicon.ico',
                tag: `cash-alert-${latestAlert.id}`,
              });
            }
          }
          // Vibration
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }
          setTimeout(() => setNewAlertDetected(false), 5000);
        }
        prevUnreadRef.current = newStats.unread;
        setStats(newStats);
      }
    } catch (err) {
      // Propager la limitation de débit pour laisser le sondage patienter.
      if (isRateLimitError(err)) throw err;
      console.error('Error fetching cash alerts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (alertId: number) => {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/cash-alerts/alerts/${alertId}/read`,
        method: 'POST',
      });
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a));
      setStats(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
    } catch (err) {
      console.error('Error marking alert read:', err);
    }
  }, []);

  const resolveAlert = useCallback(async (alertId: number) => {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/cash-alerts/alerts/${alertId}/resolve`,
        method: 'POST',
        data: { resolved_by: 'admin' },
      });
      setAlerts(prev => prev.map(a =>
        a.id === alertId ? { ...a, is_read: true, is_resolved: true } : a
      ));
      setStats(prev => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1),
        critical_unresolved: prev.critical_unresolved > 0 ? prev.critical_unresolved - 1 : 0,
      }));
    } catch (err) {
      console.error('Error resolving alert:', err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await client.apiCall.invoke({
        url: '/api/v1/cash-alerts/alerts/read-all',
        method: 'POST',
      });
      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
      setStats(prev => ({ ...prev, unread: 0 }));
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  }, []);

  // Demander permission notifications
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Sondage coordonné : respecte le délai Retry-After en cas de HTTP 429
  usePolling(fetchAlerts, {
    interval: pollingInterval,
    maxInterval: 120_000,
  });

  return {
    alerts,
    stats,
    loading,
    newAlertDetected,
    markAsRead,
    resolveAlert,
    markAllRead,
    refresh: fetchAlerts,
  };
}