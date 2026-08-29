import { useState, useEffect, useRef, useCallback } from 'react';
import { client } from '@/lib/client';
import { useToast } from '@/hooks/use-toast';
import { usePolling } from '@/hooks/usePolling';

export interface AvailableRide {
  id: number;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  destination_address: string;
  destination_lat: number | null;
  destination_lng: number | null;
  distance_km: number | null;
  duration_min: number | null;
  estimated_price: number | null;
  payment_method: string;
  is_scheduled: boolean;
  scheduled_at: string | null;
  co2_saved: number | null;
  eta_minutes: number;
  distance_to_pickup_km: number;
  created_at: string | null;
}

interface UseRideDispatchOptions {
  enabled?: boolean;
  pollingInterval?: number; // ms, default 5000
}

export function useRideDispatch(options: UseRideDispatchOptions = {}) {
  const { enabled = true, pollingInterval = 5000 } = options;
  const { toast } = useToast();
  const [availableRides, setAvailableRides] = useState<AvailableRide[]>([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [driverPosition, setDriverPosition] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const prevCountRef = useRef(0);
  // La position sert au sondage sans en être une dépendance : sinon la callback
  // était recréée à chaque relevé GPS, ce qui relançait un cycle de requêtes.
  const positionRef = useRef<{ lat: number; lng: number } | null>(null);

  // Get driver's current position
  const updatePosition = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        positionRef.current = next;
        setDriverPosition(next);
      },
      () => {
        // Position de repli (centre de Douala)
        if (!positionRef.current) {
          const fallback = { lat: 4.0511, lng: 9.7679 };
          positionRef.current = fallback;
          setDriverPosition(fallback);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  /**
   * Récupère les courses disponibles autour du chauffeur.
   * Les erreurs sont propagées : `usePolling` gère le repli et le délai 429.
   */
  const fetchAvailableRides = useCallback(async () => {
    const pos = positionRef.current;
    if (!pos) return;

    try {
      setLoading(true);
      const res = await client.apiCall.invoke({
        url: '/api/v1/dispatch/available-rides',
        method: 'GET',
        params: { driver_lat: pos.lat, driver_lng: pos.lng },
      });

      if (res?.data?.rides) {
        const newRides = res.data.rides as AvailableRide[];

        // Notifier l'apparition de nouvelles courses
        if (newRides.length > prevCountRef.current && prevCountRef.current > 0) {
          const newCount = newRides.length - prevCountRef.current;
          toast({
            title: `🚗 ${newCount} nouvelle${newCount > 1 ? 's' : ''} course${
              newCount > 1 ? 's' : ''
            } disponible${newCount > 1 ? 's' : ''}`,
            description: `${newRides[0].pickup_address} → ${newRides[0].destination_address}`,
          });
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }

        prevCountRef.current = newRides.length;
        setAvailableRides(newRides);
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /** Rafraîchissement manuel tolérant aux erreurs (bouton, après acceptation). */
  const refresh = useCallback(async () => {
    try {
      await fetchAvailableRides();
    } catch {
      // Silencieux : le sondage automatique réessaiera.
    }
  }, [fetchAvailableRides]);

  // Accept a ride
  const acceptRide = useCallback(
    async (rideId: number) => {
      setAccepting(true);
      try {
        const res = await client.apiCall.invoke({
          url: '/api/v1/dispatch/accept-ride',
          method: 'POST',
          data: { ride_id: rideId },
        });

        if (res?.data?.success) {
          toast({
            title: '✅ Course acceptée !',
            description: `Rendez-vous à : ${res.data.pickup?.address}`,
          });
          setAvailableRides((prev) => prev.filter((r) => r.id !== rideId));
          prevCountRef.current = Math.max(0, prevCountRef.current - 1);
          return res.data;
        }

        toast({
          title: '❌ Course indisponible',
          description: 'Cette course a déjà été acceptée par un autre chauffeur.',
          variant: 'destructive',
        });
        await refresh();
        return null;
      } catch (err) {
        const detail = (err as { data?: { detail?: string }; message?: string })?.data
          ?.detail;
        const message =
          detail || (err as { message?: string })?.message || "Erreur lors de l'acceptation";
        toast({ title: '❌ Erreur', description: message, variant: 'destructive' });
        await refresh();
        return null;
      } finally {
        setAccepting(false);
      }
    },
    [refresh, toast]
  );

  // Relevé de position GPS (local, ne consomme pas de quota API)
  useEffect(() => {
    if (!enabled) return;
    updatePosition();
    const posInterval = setInterval(updatePosition, 15000);
    return () => clearInterval(posInterval);
  }, [enabled, updatePosition]);

  usePolling(fetchAvailableRides, {
    interval: pollingInterval,
    enabled: enabled && !!driverPosition,
    maxInterval: 30_000,
  });

  return {
    availableRides,
    loading,
    accepting,
    driverPosition,
    acceptRide,
    refresh,
  };
}