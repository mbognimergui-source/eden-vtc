import { useState, useEffect, useCallback } from 'react';

export interface TrafficSegment {
  id: string;
  name: string;
  coords: [number, number][];
  level: 'low' | 'moderate' | 'heavy' | 'severe';
  speed: number; // km/h
  delay: number; // minutes de retard estimé
  updatedAt: Date;
}

export interface TrafficSummary {
  overallLevel: 'low' | 'moderate' | 'heavy' | 'severe';
  averageSpeed: number;
  totalDelay: number;
  peakHours: string;
  recommendation: string;
  segments: TrafficSegment[];
}

// Known traffic corridors in Douala with realistic patterns
const DOUALA_CORRIDORS: Omit<TrafficSegment, 'level' | 'speed' | 'delay' | 'updatedAt'>[] = [
  {
    id: 'bonaberi-bridge',
    name: 'Pont du Wouri (Bonabéri)',
    coords: [[4.0650, 9.7100], [4.0620, 9.7250], [4.0590, 9.7380]],
  },
  {
    id: 'rond-point-deido',
    name: 'Rond-point Deido',
    coords: [[4.0580, 9.7450], [4.0560, 9.7520], [4.0530, 9.7600]],
  },
  {
    id: 'akwa-centre',
    name: 'Boulevard de la Liberté (Akwa)',
    coords: [[4.0480, 9.7680], [4.0450, 9.7720], [4.0420, 9.7760]],
  },
  {
    id: 'bonanjo-port',
    name: 'Avenue du Port (Bonanjo)',
    coords: [[4.0380, 9.7650], [4.0350, 9.7700], [4.0320, 9.7750]],
  },
  {
    id: 'ndokoti-carrefour',
    name: 'Carrefour Ndokoti',
    coords: [[4.0300, 9.7850], [4.0280, 9.7920], [4.0260, 9.7990]],
  },
  {
    id: 'bepanda-omnisport',
    name: 'Bépanda - Omnisport',
    coords: [[4.0200, 9.7600], [4.0180, 9.7680], [4.0150, 9.7750]],
  },
  {
    id: 'makepe-logbessou',
    name: 'Axe Makepe - Logbessou',
    coords: [[4.0700, 9.7500], [4.0720, 9.7580], [4.0750, 9.7650]],
  },
  {
    id: 'yassa-pk14',
    name: 'Route de Yassa (PK14)',
    coords: [[4.0100, 9.8100], [4.0080, 9.8200], [4.0060, 9.8300]],
  },
];

// Traffic patterns based on time of day (Douala specific)
function getTrafficLevel(hour: number, corridorId: string): { level: TrafficSegment['level']; speed: number; delay: number } {
  // Peak hours: 6h-9h (morning) and 16h-19h (evening)
  const isMorningPeak = hour >= 6 && hour <= 9;
  const isEveningPeak = hour >= 16 && hour <= 19;
  const isLunchTime = hour >= 12 && hour <= 14;
  const isNight = hour >= 22 || hour <= 5;

  // Some corridors are more congested than others
  const highTrafficCorridors = ['bonaberi-bridge', 'ndokoti-carrefour', 'rond-point-deido'];
  const isHighTraffic = highTrafficCorridors.includes(corridorId);

  // Add some randomness for realism
  const randomFactor = Math.random() * 0.3;

  if (isNight) {
    return { level: 'low', speed: 45 + Math.random() * 15, delay: 0 };
  }

  if (isMorningPeak || isEveningPeak) {
    if (isHighTraffic) {
      if (randomFactor > 0.2) {
        return { level: 'severe', speed: 5 + Math.random() * 10, delay: 15 + Math.random() * 20 };
      }
      return { level: 'heavy', speed: 10 + Math.random() * 15, delay: 10 + Math.random() * 10 };
    }
    if (randomFactor > 0.15) {
      return { level: 'heavy', speed: 15 + Math.random() * 10, delay: 8 + Math.random() * 7 };
    }
    return { level: 'moderate', speed: 20 + Math.random() * 15, delay: 3 + Math.random() * 5 };
  }

  if (isLunchTime) {
    if (isHighTraffic) {
      return { level: 'moderate', speed: 25 + Math.random() * 10, delay: 3 + Math.random() * 5 };
    }
    return { level: 'low', speed: 35 + Math.random() * 15, delay: 0 };
  }

  // Off-peak
  if (isHighTraffic && randomFactor > 0.25) {
    return { level: 'moderate', speed: 25 + Math.random() * 10, delay: 2 + Math.random() * 3 };
  }
  return { level: 'low', speed: 35 + Math.random() * 20, delay: 0 };
}

function getRecommendation(overallLevel: TrafficSummary['overallLevel'], hour: number): string {
  const isMorningPeak = hour >= 6 && hour <= 9;
  const isEveningPeak = hour >= 16 && hour <= 19;

  switch (overallLevel) {
    case 'severe':
      if (isMorningPeak) return 'Trafic très dense. Privilégiez un départ avant 6h ou après 9h30.';
      if (isEveningPeak) return 'Heure de pointe. Attendez 19h30 ou partez immédiatement.';
      return 'Embouteillages importants. Prévoyez 15-25 min supplémentaires.';
    case 'heavy':
      return 'Trafic chargé sur les axes principaux. Prévoyez 10-15 min supplémentaires.';
    case 'moderate':
      return 'Circulation fluide avec quelques ralentissements. Conditions normales.';
    case 'low':
      return 'Trafic fluide. Conditions idéales pour circuler.';
  }
}

function getPeakHoursText(hour: number): string {
  if (hour >= 6 && hour <= 9) return 'Heure de pointe matinale (6h-9h)';
  if (hour >= 16 && hour <= 19) return 'Heure de pointe du soir (16h-19h)';
  if (hour >= 12 && hour <= 14) return 'Pause déjeuner (12h-14h)';
  if (hour >= 22 || hour <= 5) return 'Période creuse nocturne';
  return 'Période creuse';
}

export function useTrafficData(enabled: boolean = true) {
  const [trafficData, setTrafficData] = useState<TrafficSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchTraffic = useCallback(() => {
    if (!enabled) return;
    setLoading(true);

    // Simulate API call delay
    setTimeout(() => {
      const now = new Date();
      const hour = now.getHours();

      const segments: TrafficSegment[] = DOUALA_CORRIDORS.map((corridor) => {
        const { level, speed, delay } = getTrafficLevel(hour, corridor.id);
        return {
          ...corridor,
          level,
          speed: Math.round(speed),
          delay: Math.round(delay),
          updatedAt: now,
        };
      });

      // Calculate overall
      const levelScores = { low: 0, moderate: 1, heavy: 2, severe: 3 };
      const avgScore = segments.reduce((sum, s) => sum + levelScores[s.level], 0) / segments.length;
      let overallLevel: TrafficSummary['overallLevel'] = 'low';
      if (avgScore >= 2.5) overallLevel = 'severe';
      else if (avgScore >= 1.5) overallLevel = 'heavy';
      else if (avgScore >= 0.7) overallLevel = 'moderate';

      const averageSpeed = Math.round(segments.reduce((sum, s) => sum + s.speed, 0) / segments.length);
      const totalDelay = Math.round(segments.reduce((max, s) => Math.max(max, s.delay), 0));

      setTrafficData({
        overallLevel,
        averageSpeed,
        totalDelay,
        peakHours: getPeakHoursText(hour),
        recommendation: getRecommendation(overallLevel, hour),
        segments,
      });

      setLastUpdate(now);
      setLoading(false);
    }, 500);
  }, [enabled]);

  // Initial fetch and periodic refresh (every 2 minutes)
  useEffect(() => {
    if (!enabled) return;
    fetchTraffic();
    const interval = setInterval(fetchTraffic, 120000);
    return () => clearInterval(interval);
  }, [enabled, fetchTraffic]);

  return { trafficData, loading, lastUpdate, refresh: fetchTraffic };
}