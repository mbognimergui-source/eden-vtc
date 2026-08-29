import { useState, useEffect, useCallback } from 'react';
import { detectUserLocation, UserLocation, findNearestCity, EDEN_CITIES, getCityInfo } from '@/lib/geolocation';

interface GeolocationState {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
  isAvailable: boolean;
  nearestCity: string | null;
  refresh: () => void;
}

const STORAGE_KEY = 'eden_vtc_user_location';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

function getCachedLocation(): UserLocation | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return null;
    const { location, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return location;
  } catch {
    return null;
  }
}

function setCachedLocation(location: UserLocation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ location, timestamp: Date.now() }));
  } catch {
    // Ignore storage errors
  }
}

export function useGeolocation(): GeolocationState {
  const [location, setLocation] = useState<UserLocation | null>(getCachedLocation());
  const [loading, setLoading] = useState(!getCachedLocation());
  const [error, setError] = useState<string | null>(null);

  const detect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await detectUserLocation();
      setLocation(loc);
      setCachedLocation(loc);
    } catch (e: any) {
      // If geolocation fails, default to Douala
      const fallback: UserLocation = {
        lat: 4.0511,
        lng: 9.7679,
        city: 'Douala',
        country: 'Cameroun',
        region: 'available',
        displayName: 'Douala, Cameroun',
      };
      setLocation(fallback);
      setError(e?.message || 'Impossible de détecter votre position');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!location) {
      detect();
    }
  }, [detect, location]);

  const isAvailable = location ? location.region === 'available' : false;
  const nearestCity = location
    ? (isAvailable ? location.city : findNearestCity(location.lat, location.lng).city)
    : null;

  return {
    location,
    loading,
    error,
    isAvailable,
    nearestCity,
    refresh: detect,
  };
}

/**
 * Get the user's selected/detected city for use in other components
 */
export function useCurrentCity() {
  const { location, isAvailable, nearestCity } = useGeolocation();

  const cityInfo = nearestCity ? getCityInfo(nearestCity) : null;
  const cityCenter = cityInfo
    ? { lat: cityInfo.lat, lng: cityInfo.lng }
    : { lat: 4.0511, lng: 9.7679 };

  return {
    cityName: location?.city || 'Douala',
    country: location?.country || 'Cameroun',
    displayName: location?.displayName || 'Douala, Cameroun',
    cityCenter,
    isAvailable,
    allCities: Object.keys(EDEN_CITIES),
  };
}