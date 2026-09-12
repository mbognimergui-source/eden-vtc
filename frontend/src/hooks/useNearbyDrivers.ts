import { useState, useCallback } from 'react';
import { client } from '@/lib/client';
import { usePolling } from '@/hooks/usePolling';
import type { NearbyDriverData } from '@/components/RideMap';

interface UseNearbyDriversOptions {
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  enabled?: boolean;
  pollingInterval?: number; // ms, default 10000
}

/**
 * Chauffeurs EDEN VTC réellement en ligne (libres) autour d'un point donné —
 * utilisé pour afficher les chauffeurs disponibles sur la carte AVANT que le
 * passager ne commande une course. Ne fait rien tant que la position n'est
 * pas connue.
 */
export function useNearbyDrivers({
  lat,
  lng,
  radiusKm = 3,
  enabled = true,
  pollingInterval = 10000,
}: UseNearbyDriversOptions) {
  const [drivers, setDrivers] = useState<NearbyDriverData[]>([]);

  const fetchNearbyDrivers = useCallback(async () => {
    if (lat == null || lng == null) return;
    const res = await client.apiCall.invoke({
      url: '/api/v1/dispatch/nearby-drivers',
      method: 'GET',
      data: { lat, lng, radius_km: radiusKm },
    });
    if (res?.data?.drivers) {
      setDrivers(res.data.drivers as NearbyDriverData[]);
    }
  }, [lat, lng, radiusKm]);

  usePolling(fetchNearbyDrivers, {
    interval: pollingInterval,
    enabled: enabled && lat != null && lng != null,
    maxInterval: 60_000,
  });

  return { nearbyDrivers: drivers, total: drivers.length };
}
