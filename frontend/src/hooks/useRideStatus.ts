import { useState, useRef, useCallback } from 'react';
import { client } from '@/lib/client';
import { useToast } from '@/hooks/use-toast';
import { usePolling, type PollingTaskResult } from '@/hooks/usePolling';

// === Notification helpers ===

/** Request browser notification permission (call early, e.g. on ride confirm) */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/** Play a short notification sound using Web Audio API */
function playNotificationSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const now = ctx.currentTime;
    playTone(587, now, 0.2); // D5
    playTone(880, now + 0.2, 0.3); // A5
    playTone(1175, now + 0.45, 0.4); // D6
  } catch {
    // Audio not available — silent fallback
  }
}

/** Send a browser push notification */
function sendBrowserNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/icon-eden.svg',
        badge: '/icon-eden.svg',
        tag: 'ride-accepted',
      });
    } catch {
      // Notification API not fully supported — silent fallback
    }
  }
}

interface RideStatusData {
  ride_id: number;
  status: string;
  driver_id: number | null;
  vehicle_id: number | null;
  pickup_address: string;
  destination_address: string;
  estimated_price: number | null;
  driver?: {
    id: number;
    first_name: string;
    last_name: string;
    phone: string;
    rating: number;
    vehicle_id: number;
  };
}

interface UseRideStatusOptions {
  rideId: number | null;
  pollingInterval?: number; // ms, default 6000
  onDriverAccepted?: (data: RideStatusData) => void;
}

/**
 * Seuls les statuts « en attente » justifient un sondage rapproché.
 * Dès qu'un chauffeur a répondu (ou que la course est terminée/annulée),
 * le suivi détaillé est pris en charge par la page de tracking GPS.
 */
const PENDING_STATUSES = new Set(['pending', 'searching', 'requested']);

export function useRideStatus(options: UseRideStatusOptions) {
  const { rideId, pollingInterval = 6000, onDriverAccepted } = options;
  const { toast } = useToast();
  const [rideStatus, setRideStatus] = useState<RideStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [driverFound, setDriverFound] = useState(false);
  const prevStatusRef = useRef<string>('');
  const callbackFiredRef = useRef(false);
  const cancelledRef = useRef(false);

  /**
   * Récupère le statut courant.
   * Les erreurs sont propagées volontairement : `usePolling` s'appuie dessus
   * pour appliquer le repli exponentiel et respecter le délai d'attente 429.
   */
  const fetchStatus = useCallback(async (): Promise<PollingTaskResult> => {
    if (!rideId || cancelledRef.current) return { stop: true };

    const res = await client.apiCall.invoke({
      url: `/api/v1/dispatch/ride-status/${rideId}`,
      method: 'GET',
    });

    setLoading(false);

    if (!res?.data) return {};

    const data = res.data as RideStatusData;
    setRideStatus(data);

    const wasPending =
      prevStatusRef.current === '' || PENDING_STATUSES.has(prevStatusRef.current);
    const isAccepted = data.status === 'accepted';

    if (isAccepted && wasPending) {
      setDriverFound(true);

      const driverName = data.driver
        ? `${data.driver.first_name} ${data.driver.last_name}`
        : 'Un chauffeur';
      const driverRating = data.driver?.rating ? `⭐ ${data.driver.rating}/5` : '';

      // 1. Notification in-app
      toast({
        title: '🎉 Chauffeur trouvé !',
        description: `${driverName} arrive vers vous. ${driverRating}`,
      });

      // 2. Vibration (triple impulsion)
      if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);

      // 3. Carillon sonore
      playNotificationSound();

      // 4. Notification navigateur (fonctionne onglet en arrière-plan)
      sendBrowserNotification(
        '🚗 EDEN VTC — Chauffeur trouvé !',
        `${driverName} est en route vers vous. ${driverRating}`
      );

      if (onDriverAccepted && !callbackFiredRef.current) {
        callbackFiredRef.current = true;
        onDriverAccepted(data);
      }
    }

    prevStatusRef.current = data.status;

    // Arrêt du sondage dès qu'un état non « en attente » est atteint.
    // Sans cela, une course déjà acceptée au chargement de la page était
    // interrogée indéfiniment toutes les 3 s, jusqu'au blocage HTTP 429.
    return { stop: !PENDING_STATUSES.has(data.status) };
  }, [rideId, toast, onDriverAccepted]);

  usePolling(fetchStatus, {
    interval: pollingInterval,
    enabled: !!rideId,
    maxInterval: 30_000,
  });

  // Réinitialisation à chaque nouvelle course suivie.
  const trackedRideRef = useRef<number | null>(null);
  if (rideId !== trackedRideRef.current) {
    trackedRideRef.current = rideId;
    cancelledRef.current = false;
    callbackFiredRef.current = false;
    prevStatusRef.current = '';
    if (rideId) setLoading(true);
  }

  /** Rafraîchissement manuel : n'interrompt jamais l'interface en cas d'erreur. */
  const refresh = useCallback(async () => {
    try {
      await fetchStatus();
    } catch {
      // Erreur silencieuse : le sondage automatique reprendra.
    }
  }, [fetchStatus]);

  const cancelRide = useCallback(async () => {
    if (!rideId) return false;

    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/dispatch/cancel-ride/${rideId}`,
        method: 'POST',
      });

      if (res?.data?.success) {
        toast({ title: '🚫 Course annulée' });
        cancelledRef.current = true;
        setRideStatus(null);
        return true;
      }
      return false;
    } catch (err) {
      const detail = (err as { data?: { detail?: string } })?.data?.detail;
      toast({
        title: 'Erreur',
        description: detail || "Impossible d'annuler la course",
        variant: 'destructive',
      });
      return false;
    }
  }, [rideId, toast]);

  return {
    rideStatus,
    loading,
    driverFound,
    cancelRide,
    refresh,
  };
}