// Quartiers/localités à proximité d'un point, pour n'importe où en Afrique
// (ou ailleurs) — pas seulement les villes pour lesquelles EDEN VTC a une
// liste préétablie. S'appuie sur Overpass API (OpenStreetMap), qui référence
// les lieux nommés (place=suburb/neighbourhood/quarter/town/village) partout
// où la donnée OSM existe, ce qui couvre la grande majorité des villes
// africaines sans avoir à maintenir une liste par ville.
//
// Les instances publiques Overpass répondent parfois une erreur transitoire
// ("server too busy") ou sont indisponibles quelques heures : plusieurs
// miroirs sont essayés à tour de rôle. En dernier recours (tous indisponibles),
// l'appelant doit prévoir un repli (cf. lib/neighborhoods.ts pour Douala et
// Yaoundé) plutôt que de bloquer la réservation.

import { haversineDistance } from '@/lib/geolocation';

// Plusieurs instances publiques, essayées dans l'ordre : l'une ou l'autre
// peut être temporairement indisponible (quota, maintenance) sans que ce
// soit visible à l'avance.
const OVERPASS_URLS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const REQUEST_TIMEOUT_MS = 8000;
const PLACE_TYPES = ['suburb', 'neighbourhood', 'quarter', 'city_block', 'town', 'village'];

export interface NearbyPlace {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  tags?: { name?: string };
}

function buildQuery(lat: number, lng: number, radiusM: number, limit: number): string {
  const placeFilter = PLACE_TYPES.join('|');
  return `[out:json][timeout:${Math.ceil(REQUEST_TIMEOUT_MS / 1000)}];` +
    `(node["place"~"^(${placeFilter})$"](around:${radiusM},${lat},${lng}););` +
    `out body ${limit * 3};`;
}

async function fetchFrom(url: string, lat: number, lng: number, radiusKm: number, limit: number): Promise<NearbyPlace[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: buildQuery(lat, lng, Math.round(radiusKm * 1000), limit),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`overpass_http_${res.status}`);

    const data = await res.json();
    const elements: OverpassElement[] = data?.elements || [];

    const seen = new Set<string>();
    const places: NearbyPlace[] = [];
    for (const el of elements) {
      const name = el.tags?.name;
      if (!name || el.lat == null || el.lon == null || seen.has(name)) continue;
      seen.add(name);
      places.push({ name, lat: el.lat, lng: el.lon, distanceKm: haversineDistance(lat, lng, el.lat, el.lon) });
    }

    return places.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Quartiers/localités OSM à moins de `radiusKm` de (lat, lng), triés du plus
 * proche au plus loin. Essaie chaque instance publique Overpass à tour de
 * rôle (l'une ou l'autre peut être temporairement indisponible) ; renvoie []
 * (jamais d'exception) si toutes échouent, pour que l'appelant puisse
 * basculer sur son repli.
 */
export async function fetchNearbyPlaces(lat: number, lng: number, radiusKm: number, limit = 30): Promise<NearbyPlace[]> {
  for (const url of OVERPASS_URLS) {
    try {
      return await fetchFrom(url, lat, lng, radiusKm, limit);
    } catch {
      // Essaie l'instance suivante.
    }
  }
  return [];
}
