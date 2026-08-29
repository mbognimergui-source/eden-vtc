import { useState, useRef, useCallback } from 'react';
import { createClient } from '@metagptx/web-sdk';
import { usePolling } from '@/hooks/usePolling';
import { isRateLimitError } from '@/lib/pollingScheduler';

const client = createClient();

export interface VehiclePosition {
  vehicle_id: number;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  accuracy: number;
  status: string;
  ride_id: number | null;
  driver_id: number | null;
  updated_at: string | null;
}

interface UseVehicleTrackingOptions {
  vehicleId?: number;
  rideId?: number;
  pollingInterval?: number; // en millisecondes (défaut: 5000ms = 5s)
  enabled?: boolean;
}

interface UseVehicleTrackingResult {
  position: VehiclePosition | null;
  previousPosition: VehiclePosition | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  lastUpdate: Date | null;
  refresh: () => Promise<void>;
}

/**
 * Hook pour suivre la position GPS en temps réel d'un véhicule de la flotte EDEN VTC.
 *
 * Le sondage passe par `usePolling` : en cas de HTTP 429 le délai `Retry-After`
 * du serveur est respecté et tous les autres sondages de l'application
 * patientent également, au lieu de continuer à saturer le backend.
 */
export function useVehicleTracking({
  vehicleId,
  rideId,
  pollingInterval = 5000,
  enabled = true,
}: UseVehicleTrackingOptions): UseVehicleTrackingResult {
  const [position, setPosition] = useState<VehiclePosition | null>(null);
  const [previousPosition, setPreviousPosition] = useState<VehiclePosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const failCountRef = useRef(0);

  const fetchPosition = useCallback(async () => {
    if (!vehicleId && !rideId) return;

    const url = rideId
      ? `/api/v1/gps/ride-position/${rideId}`
      : `/api/v1/gps/vehicle-position/${vehicleId}`;

    try {
      const response = await client.apiCall.invoke({ url, method: 'GET' });

      if (response?.data) {
        // On conserve la position antérieure via l'updater d'état afin de ne
        // pas recréer cette callback à chaque rafraîchissement.
        setPosition((prev) => {
          setPreviousPosition(prev);
          return response.data as VehiclePosition;
        });
        setIsConnected(true);
        setLastUpdate(new Date());
        setError(null);
        failCountRef.current = 0;
      }
    } catch (err) {
      if (isRateLimitError(err)) {
        // Limitation temporaire : ce n'est pas une perte de signal GPS.
        // On propage pour laisser usePolling appliquer le délai d'attente.
        throw err;
      }

      failCountRef.current += 1;
      // Après 3 échecs consécutifs, marquer comme déconnecté
      if (failCountRef.current >= 3) {
        setIsConnected(false);
        setError(
          'Signal GPS perdu. Le véhicule est peut-être dans une zone sans couverture réseau.'
        );
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [vehicleId, rideId]);

  usePolling(fetchPosition, {
    interval: pollingInterval,
    enabled: enabled && (!!vehicleId || !!rideId),
    maxInterval: 30_000,
  });

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchPosition();
    } catch {
      // Erreur déjà reflétée dans l'état ; le sondage automatique reprendra.
    }
  }, [fetchPosition]);

  return {
    position,
    previousPosition,
    isLoading,
    error,
    isConnected,
    lastUpdate,
    refresh,
  };
}