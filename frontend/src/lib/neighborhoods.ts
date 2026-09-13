// Quartiers utilisés pour proposer des destinations à proximité du point de
// départ, ville par ville (cf. backend/services/service_areas.py pour la
// liste des villes desservies). Les coordonnées sont des centroïdes
// indicatifs (pas des adresses exactes) : suffisants pour filtrer/trier par
// distance à vol d'oiseau, mais la position précise est ensuite recalculée
// via Nominatim au moment de l'estimation du prix (cf. geocodeAddress dans
// BookRide.tsx).
//
// Une seule liste combinée : le filtre par rayon (nearbyNeighborhoods) élimine
// naturellement les quartiers d'une ville trop loin du point de départ, donc
// pas besoin de savoir explicitement dans quelle ville se trouve l'utilisateur.
// Seules Douala et Yaoundé sont couvertes pour l'instant ; les autres villes
// desservies n'ont simplement pas encore de quartiers suggérés.

import { haversineDistance } from '@/lib/geolocation';

export interface Neighborhood {
  name: string;
  city: string;
  lat: number;
  lng: number;
}

const DOUALA_NEIGHBORHOODS: Neighborhood[] = [
  { name: 'Akwa', city: 'Douala', lat: 4.0483, lng: 9.6999 },
  { name: 'Bonanjo', city: 'Douala', lat: 4.0447, lng: 9.6931 },
  { name: 'Bonapriso', city: 'Douala', lat: 4.0381, lng: 9.7057 },
  { name: 'Deido', city: 'Douala', lat: 4.0651, lng: 9.7001 },
  { name: 'Bali', city: 'Douala', lat: 4.0553, lng: 9.6903 },
  { name: 'New Bell', city: 'Douala', lat: 4.0483, lng: 9.7124 },
  { name: 'Cité des Palmiers', city: 'Douala', lat: 4.0381, lng: 9.6854 },
  { name: 'Village', city: 'Douala', lat: 4.0554, lng: 9.7101 },
  { name: 'Ndogbong', city: 'Douala', lat: 4.0623, lng: 9.7254 },
  { name: 'Bépanda', city: 'Douala', lat: 4.0754, lng: 9.7351 },
  { name: 'Makepe', city: 'Douala', lat: 4.0834, lng: 9.7273 },
  { name: 'Bonamoussadi', city: 'Douala', lat: 4.0834, lng: 9.7401 },
  { name: 'Ndokoti', city: 'Douala', lat: 4.0723, lng: 9.7452 },
  { name: 'Kotto', city: 'Douala', lat: 4.0483, lng: 9.7451 },
  { name: 'Ndogpassi', city: 'Douala', lat: 4.0553, lng: 9.7551 },
  { name: 'Logbaba', city: 'Douala', lat: 4.0824, lng: 9.7601 },
  { name: 'Nyalla', city: 'Douala', lat: 4.0301, lng: 9.7201 },
  { name: 'Bassa', city: 'Douala', lat: 4.0351, lng: 9.7301 },
  { name: 'Yassa', city: 'Douala', lat: 4.0201, lng: 9.7401 },
  { name: 'Bonaberi', city: 'Douala', lat: 4.0754, lng: 9.6654 },
  { name: 'PK8', city: 'Douala', lat: 4.0704, lng: 9.6503 },
  { name: 'PK10', city: 'Douala', lat: 4.0754, lng: 9.6303 },
  { name: 'PK12', city: 'Douala', lat: 4.0784, lng: 9.6203 },
  { name: 'PK14', city: 'Douala', lat: 4.0804, lng: 9.6103 },
  { name: 'Japoma', city: 'Douala', lat: 4.1004, lng: 9.7754 },
];

const YAOUNDE_NEIGHBORHOODS: Neighborhood[] = [
  { name: 'Bastos', city: 'Yaoundé', lat: 3.8836, lng: 11.5100 },
  { name: 'Centre-ville', city: 'Yaoundé', lat: 3.8667, lng: 11.5167 },
  { name: 'Mvog-Mbi', city: 'Yaoundé', lat: 3.8611, lng: 11.5153 },
  { name: 'Mvog-Ada', city: 'Yaoundé', lat: 3.8556, lng: 11.5083 },
  { name: 'Elig-Essono', city: 'Yaoundé', lat: 3.8722, lng: 11.5111 },
  { name: 'Nlongkak', city: 'Yaoundé', lat: 3.8806, lng: 11.5194 },
  { name: 'Essos', city: 'Yaoundé', lat: 3.8722, lng: 11.5306 },
  { name: 'Mokolo', city: 'Yaoundé', lat: 3.8694, lng: 11.5083 },
  { name: 'Melen', city: 'Yaoundé', lat: 3.8600, lng: 11.4900 },
  { name: 'Ngoa-Ekelle', city: 'Yaoundé', lat: 3.8583, lng: 11.5028 },
  { name: 'Nsam', city: 'Yaoundé', lat: 3.8417, lng: 11.4917 },
  { name: 'Emana', city: 'Yaoundé', lat: 3.9139, lng: 11.5222 },
  { name: 'Etoudi', city: 'Yaoundé', lat: 3.9083, lng: 11.5083 },
  { name: 'Ekounou', city: 'Yaoundé', lat: 3.8611, lng: 11.5389 },
  { name: 'Biyem-Assi', city: 'Yaoundé', lat: 3.8417, lng: 11.4833 },
  { name: 'Odza', city: 'Yaoundé', lat: 3.8028, lng: 11.5333 },
  { name: 'Nkolbisson', city: 'Yaoundé', lat: 3.8722, lng: 11.4472 },
  { name: 'Mimboman', city: 'Yaoundé', lat: 3.8556, lng: 11.5472 },
  { name: 'Tsinga', city: 'Yaoundé', lat: 3.8833, lng: 11.4972 },
  { name: 'Efoulan', city: 'Yaoundé', lat: 3.8306, lng: 11.4972 },
  { name: 'Ngousso', city: 'Yaoundé', lat: 3.8944, lng: 11.5417 },
  { name: 'Anguissa', city: 'Yaoundé', lat: 3.8917, lng: 11.4972 },
];

export const NEIGHBORHOODS: Neighborhood[] = [...DOUALA_NEIGHBORHOODS, ...YAOUNDE_NEIGHBORHOODS];

export interface NearbyNeighborhood extends Neighborhood {
  distanceKm: number;
}

/** Quartiers à moins de `radiusKm` de (lat, lng), triés du plus proche au plus loin. */
export function nearbyNeighborhoods(lat: number, lng: number, radiusKm: number): NearbyNeighborhood[] {
  return NEIGHBORHOODS
    .map((n) => ({ ...n, distanceKm: haversineDistance(lat, lng, n.lat, n.lng) }))
    .filter((n) => n.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
