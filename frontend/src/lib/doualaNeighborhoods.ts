// Quartiers de Douala utilisés pour proposer des destinations à proximité
// du point de départ. Les coordonnées sont des centroïdes indicatifs (pas
// des adresses exactes) : suffisants pour filtrer/trier par distance à vol
// d'oiseau, mais la position précise est ensuite recalculée via Nominatim
// au moment de l'estimation du prix (cf. geocodeAddress dans BookRide.tsx).

import { haversineDistance } from '@/lib/geolocation';

export interface DoualaNeighborhood {
  name: string;
  lat: number;
  lng: number;
}

export const DOUALA_NEIGHBORHOODS: DoualaNeighborhood[] = [
  { name: 'Akwa', lat: 4.0483, lng: 9.6999 },
  { name: 'Bonanjo', lat: 4.0447, lng: 9.6931 },
  { name: 'Bonapriso', lat: 4.0381, lng: 9.7057 },
  { name: 'Deido', lat: 4.0651, lng: 9.7001 },
  { name: 'Bali', lat: 4.0553, lng: 9.6903 },
  { name: 'New Bell', lat: 4.0483, lng: 9.7124 },
  { name: 'Cité des Palmiers', lat: 4.0381, lng: 9.6854 },
  { name: 'Village', lat: 4.0554, lng: 9.7101 },
  { name: 'Ndogbong', lat: 4.0623, lng: 9.7254 },
  { name: 'Bépanda', lat: 4.0754, lng: 9.7351 },
  { name: 'Makepe', lat: 4.0834, lng: 9.7273 },
  { name: 'Bonamoussadi', lat: 4.0834, lng: 9.7401 },
  { name: 'Ndokoti', lat: 4.0723, lng: 9.7452 },
  { name: 'Kotto', lat: 4.0483, lng: 9.7451 },
  { name: 'Ndogpassi', lat: 4.0553, lng: 9.7551 },
  { name: 'Logbaba', lat: 4.0824, lng: 9.7601 },
  { name: 'Nyalla', lat: 4.0301, lng: 9.7201 },
  { name: 'Bassa', lat: 4.0351, lng: 9.7301 },
  { name: 'Yassa', lat: 4.0201, lng: 9.7401 },
  { name: 'Bonaberi', lat: 4.0754, lng: 9.6654 },
  { name: 'PK8', lat: 4.0704, lng: 9.6503 },
  { name: 'PK10', lat: 4.0754, lng: 9.6303 },
  { name: 'PK12', lat: 4.0784, lng: 9.6203 },
  { name: 'PK14', lat: 4.0804, lng: 9.6103 },
  { name: 'Japoma', lat: 4.1004, lng: 9.7754 },
];

export interface NearbyNeighborhood extends DoualaNeighborhood {
  distanceKm: number;
}

/** Quartiers de Douala à moins de `radiusKm` de (lat, lng), triés du plus proche au plus loin. */
export function nearbyNeighborhoods(lat: number, lng: number, radiusKm: number): NearbyNeighborhood[] {
  return DOUALA_NEIGHBORHOODS
    .map((n) => ({ ...n, distanceKm: haversineDistance(lat, lng, n.lat, n.lng) }))
    .filter((n) => n.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
