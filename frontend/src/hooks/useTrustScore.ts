import { useState, useEffect } from 'react';
import { client } from '@/lib/client';

export interface TrustScore {
  score: number;
  grade: string;
  factors: string[];
}

/**
 * EDEN Trust Score : charge le score de confiance d'un chauffeur (note,
 * expérience, fiabilité). Se déclenche une fois driverId connu — pas de
 * sondage, le score ne varie pas dans l'échelle de temps d'une course.
 */
export function useTrustScore(driverId: number | null | undefined) {
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!driverId) {
      setTrustScore(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await client.apiCall.invoke({
          url: `/api/v1/dispatch/trust-score/${driverId}`,
          method: 'GET',
        });
        if (!cancelled && res?.data) {
          setTrustScore(res.data as TrustScore);
        }
      } catch (e) {
        console.error('Failed to load trust score', e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [driverId]);

  return { trustScore, loading };
}
