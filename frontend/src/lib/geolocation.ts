// Geolocation service for detecting user's city across Africa
// Uses browser Geolocation API + reverse geocoding via Nominatim (OpenStreetMap)
// Enhanced with backend IP triangulation service for improved accuracy

import { client } from '@/lib/client';

export interface UserLocation {
  lat: number;
  lng: number;
  city: string;
  country: string;
  region: string;
  displayName: string;
}

// Major African cities where EDEN VTC operates (expandable)
export const EDEN_CITIES: Record<string, { lat: number; lng: number; country: string; currency: string; timezone: string }> = {
  'Douala': { lat: 4.0511, lng: 9.7679, country: 'Cameroun', currency: 'XAF', timezone: 'Africa/Douala' },
  'Yaoundé': { lat: 3.8480, lng: 11.5021, country: 'Cameroun', currency: 'XAF', timezone: 'Africa/Douala' },
  'Abidjan': { lat: 5.3600, lng: -4.0083, country: "Côte d'Ivoire", currency: 'XOF', timezone: 'Africa/Abidjan' },
  'Dakar': { lat: 14.7167, lng: -17.4677, country: 'Sénégal', currency: 'XOF', timezone: 'Africa/Dakar' },
  'Libreville': { lat: 0.4162, lng: 9.4673, country: 'Gabon', currency: 'XAF', timezone: 'Africa/Libreville' },
  'Brazzaville': { lat: -4.2634, lng: 15.2429, country: 'Congo', currency: 'XAF', timezone: 'Africa/Brazzaville' },
  'Kinshasa': { lat: -4.4419, lng: 15.2663, country: 'RD Congo', currency: 'CDF', timezone: 'Africa/Kinshasa' },
  'Lomé': { lat: 6.1725, lng: 1.2314, country: 'Togo', currency: 'XOF', timezone: 'Africa/Lome' },
  'Cotonou': { lat: 6.3703, lng: 2.3912, country: 'Bénin', currency: 'XOF', timezone: 'Africa/Porto-Novo' },
  'Bamako': { lat: 12.6392, lng: -8.0029, country: 'Mali', currency: 'XOF', timezone: 'Africa/Bamako' },
  'Ouagadougou': { lat: 12.3714, lng: -1.5197, country: 'Burkina Faso', currency: 'XOF', timezone: 'Africa/Ouagadougou' },
  'Niamey': { lat: 13.5137, lng: 2.1098, country: 'Niger', currency: 'XOF', timezone: 'Africa/Niamey' },
  'Conakry': { lat: 9.6412, lng: -13.5784, country: 'Guinée', currency: 'GNF', timezone: 'Africa/Conakry' },
  'Bangui': { lat: 4.3947, lng: 18.5582, country: 'Centrafrique', currency: 'XAF', timezone: 'Africa/Bangui' },
  'Ndjamena': { lat: 12.1348, lng: 15.0557, country: 'Tchad', currency: 'XAF', timezone: 'Africa/Ndjamena' },
  'Accra': { lat: 5.6037, lng: -0.1870, country: 'Ghana', currency: 'GHS', timezone: 'Africa/Accra' },
  'Lagos': { lat: 6.5244, lng: 3.3792, country: 'Nigeria', currency: 'NGN', timezone: 'Africa/Lagos' },
  'Nairobi': { lat: -1.2921, lng: 36.8219, country: 'Kenya', currency: 'KES', timezone: 'Africa/Nairobi' },
  'Kampala': { lat: 0.3476, lng: 32.5825, country: 'Ouganda', currency: 'UGX', timezone: 'Africa/Kampala' },
  'Kigali': { lat: -1.9403, lng: 29.8739, country: 'Rwanda', currency: 'RWF', timezone: 'Africa/Kigali' },
  'Dar es Salaam': { lat: -6.7924, lng: 39.2083, country: 'Tanzanie', currency: 'TZS', timezone: 'Africa/Dar_es_Salaam' },
  'Luanda': { lat: -8.8390, lng: 13.2894, country: 'Angola', currency: 'AOA', timezone: 'Africa/Luanda' },
  'Casablanca': { lat: 33.5731, lng: -7.5898, country: 'Maroc', currency: 'MAD', timezone: 'Africa/Casablanca' },
  'Tunis': { lat: 36.8065, lng: 10.1815, country: 'Tunisie', currency: 'TND', timezone: 'Africa/Tunis' },
  'Alger': { lat: 36.7538, lng: 3.0588, country: 'Algérie', currency: 'DZD', timezone: 'Africa/Algiers' },
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Get current position using browser Geolocation API
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Géolocalisation non supportée par ce navigateur'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000, // Cache 5 min
    });
  });
}

/**
 * Reverse geocode coordinates to city name using Nominatim
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; country: string; displayName: string }> {
  try {
    const res = await fetch(
      `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json&accept-language=fr&zoom=10`,
      { headers: { 'User-Agent': 'EDEN-VTC-App/1.0' } }
    );
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    const address = data.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.state || 'Ville inconnue';
    const country = address.country || 'Pays inconnu';
    return { city, country, displayName: `${city}, ${country}` };
  } catch {
    // Fallback: find nearest known city
    return findNearestCity(lat, lng);
  }
}

/**
 * Find the nearest EDEN VTC city from coordinates
 */
export function findNearestCity(lat: number, lng: number): { city: string; country: string; displayName: string } {
  let nearest = { city: 'Douala', country: 'Cameroun', displayName: 'Douala, Cameroun' };
  let minDist = Infinity;

  for (const [cityName, info] of Object.entries(EDEN_CITIES)) {
    const dist = haversineDistance(lat, lng, info.lat, info.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = { city: cityName, country: info.country, displayName: `${cityName}, ${info.country}` };
    }
  }
  return nearest;
}

/**
 * Check if EDEN VTC is available in the detected city
 */
export function isEdenAvailable(city: string): boolean {
  return Object.keys(EDEN_CITIES).some(
    c => c.toLowerCase() === city.toLowerCase()
  );
}

/**
 * Get city info (currency, timezone, etc.)
 */
export function getCityInfo(city: string) {
  const entry = Object.entries(EDEN_CITIES).find(
    ([c]) => c.toLowerCase() === city.toLowerCase()
  );
  return entry ? { name: entry[0], ...entry[1] } : null;
}

/**
 * Haversine distance between two points in km
 */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * IP Geolocation result with triangulation metadata
 */
export interface IPGeolocationResult {
  lat: number;
  lng: number;
  city: string;
  country: string;
  accuracy_km: number;
  confidence: number;
  sources_used: number;
  method: 'triangulated' | 'single' | 'fallback';
}

/**
 * Enhanced IP geolocation using backend triangulation service.
 * The backend queries 4 IP services simultaneously and combines results
 * using weighted averaging and outlier elimination for better precision.
 * 
 * Falls back to direct client-side IP services if backend is unavailable.
 */
export async function detectLocationByIP(): Promise<IPGeolocationResult> {
  // Strategy 1: Use backend triangulation service (most accurate — server-side, 4 services)
  try {
    const res = await client.apiCall.invoke({
      url: '/api/v1/geolocation/locate',
      method: 'POST',
      data: {},
    });
    if (res?.data && res.data.lat && res.data.lng) {
      return {
        lat: res.data.lat,
        lng: res.data.lng,
        city: res.data.city || 'Ville inconnue',
        country: res.data.country || 'Pays inconnu',
        accuracy_km: res.data.accuracy_km || 25,
        confidence: res.data.confidence || 0.7,
        sources_used: res.data.sources_used || 1,
        method: res.data.method || 'single',
      };
    }
  } catch {
    // Backend unavailable, fallback to client-side services
  }

  // Strategy 2: Client-side fallback — query multiple services directly
  const results: Array<{ lat: number; lng: number; city: string; country: string; confidence: number }> = [];

  // Service A: ip-api.com
  try {
    const res = await fetch('http://ip-api.com/json/?fields=lat,lon,city,country&lang=fr', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.lat && data.lon) {
        results.push({ lat: data.lat, lng: data.lon, city: data.city || '', country: data.country || '', confidence: 0.7 });
      }
    }
  } catch { /* skip */ }

  // Service B: ipapi.co
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude && !data.error) {
        results.push({ lat: data.latitude, lng: data.longitude, city: data.city || '', country: data.country_name || '', confidence: 0.75 });
      }
    }
  } catch { /* skip */ }

  // Service C: ipwho.is
  try {
    const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        results.push({ lat: data.latitude, lng: data.longitude, city: data.city || '', country: data.country || '', confidence: 0.65 });
      }
    }
  } catch { /* skip */ }

  if (results.length === 0) {
    // Ultimate fallback: Douala center
    return { lat: 4.0511, lng: 9.7679, city: 'Douala', country: 'Cameroun', accuracy_km: 100, confidence: 0.1, sources_used: 0, method: 'fallback' };
  }

  if (results.length === 1) {
    const r = results[0];
    return { lat: r.lat, lng: r.lng, city: r.city, country: r.country, accuracy_km: 25, confidence: r.confidence, sources_used: 1, method: 'single' };
  }

  // Client-side triangulation: weighted average
  const totalWeight = results.reduce((sum, r) => sum + r.confidence, 0);
  const wLat = results.reduce((sum, r) => sum + r.lat * r.confidence, 0) / totalWeight;
  const wLng = results.reduce((sum, r) => sum + r.lng * r.confidence, 0) / totalWeight;

  // Use city from most confident source
  const bestSource = results.reduce((best, r) => r.confidence > best.confidence ? r : best, results[0]);

  // Calculate spread for accuracy estimate
  const maxSpread = Math.max(...results.map(r => haversineDistance(wLat, wLng, r.lat, r.lng)));
  const accuracy = maxSpread < 10 ? 10 : maxSpread < 25 ? 20 : 35;
  const confidence = maxSpread < 5 ? 0.85 : maxSpread < 15 ? 0.7 : 0.55;

  return {
    lat: Math.round(wLat * 1000000) / 1000000,
    lng: Math.round(wLng * 1000000) / 1000000,
    city: bestSource.city || 'Ville inconnue',
    country: bestSource.country || 'Pays inconnu',
    accuracy_km: accuracy,
    confidence,
    sources_used: results.length,
    method: 'triangulated',
  };
}

/**
 * Full geolocation flow: get position → reverse geocode → check availability
 * Falls back to IP-based geolocation if GPS is denied/unavailable
 */
export async function detectUserLocation(): Promise<UserLocation> {
  let lat: number;
  let lng: number;
  let source: 'gps' | 'ip' = 'gps';

  try {
    const position = await getCurrentPosition();
    lat = position.coords.latitude;
    lng = position.coords.longitude;
  } catch {
    // GPS failed (denied, timeout, or unavailable) — fallback to IP geolocation
    source = 'ip';
    const ipLocation = await detectLocationByIP();
    lat = ipLocation.lat;
    lng = ipLocation.lng;
  }

  const { city, country, displayName } = await reverseGeocode(lat, lng);
  const cityInfo = getCityInfo(city);

  return {
    lat,
    lng,
    city: cityInfo ? cityInfo.name : city,
    country,
    region: cityInfo ? 'available' : 'unavailable',
    displayName: cityInfo ? `${cityInfo.name}, ${country}` : displayName,
  };
}

/**
 * Get current position with IP fallback — for use in components that need coords even when GPS is denied.
 * Returns source info, accuracy level, confidence score, and triangulation method.
 */
export async function getPositionWithFallback(): Promise<{
  lat: number;
  lng: number;
  source: 'gps' | 'ip';
  accuracy: 'high' | 'approximate';
  accuracy_km: number;
  confidence: number;
  method: string;
  sources_used: number;
}> {
  try {
    const position = await getCurrentPosition();
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      source: 'gps',
      accuracy: 'high',
      accuracy_km: position.coords.accuracy ? position.coords.accuracy / 1000 : 0.05,
      confidence: 0.98,
      method: 'gps',
      sources_used: 1,
    };
  } catch {
    const ipLoc = await detectLocationByIP();
    return {
      lat: ipLoc.lat,
      lng: ipLoc.lng,
      source: 'ip',
      accuracy: 'approximate',
      accuracy_km: ipLoc.accuracy_km,
      confidence: ipLoc.confidence,
      method: ipLoc.method,
      sources_used: ipLoc.sources_used,
    };
  }
}