import { useEffect, useRef, useState } from 'react';
import { fetchNearbyPlaces } from '@/lib/overpassPlaces';
import { nearbyNeighborhoods } from '@/lib/neighborhoods';

export interface NearbyDestination {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

interface UseNearbyDestinationsOptions {
  lat?: number | null;
  lng?: number | null;
  radiusKm: number;
}

/**
 * Quartiers/localités proposés comme destination, à moins de `radiusKm` du
 * point donné — n'importe où (pas seulement les villes pour lesquelles EDEN
 * VTC a une liste préétablie) : la source principale est OpenStreetMap via
 * Overpass, avec la petite liste maison (Douala, Yaoundé) en repli si la
 * requête réseau échoue ou ne trouve rien.
 */
export function useNearbyDestinations({ lat, lng, radiusKm }: UseNearbyDestinationsOptions) {
  const [destinations, setDestinations] = useState<NearbyDestination[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (lat == null || lng == null) {
      setDestinations([]);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    fetchNearbyPlaces(lat, lng, radiusKm)
      .then((places) => {
        if (requestIdRef.current !== requestId) return; // requête obsolète
        setDestinations(places.length > 0 ? places : nearbyNeighborhoods(lat, lng, radiusKm));
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setDestinations(nearbyNeighborhoods(lat, lng, radiusKm));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [lat, lng, radiusKm]);

  return { destinations, loading };
}
