import { useState, useEffect } from 'react';
import { client } from '@/lib/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import { EDEN_CITIES } from '@/lib/geolocation';

export interface CountryTariff {
  id: number;
  country_code: string;
  country_name: string;
  currency_code: string;
  currency_symbol: string;
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  minimum_fare: number;
  airport_surcharge: number;
  night_multiplier: number;
  night_start_hour: number;
  night_end_hour: number;
  daily_target: number;
  rounding_unit: number;
  is_active: boolean;
}

// Map city to country code
const CITY_TO_COUNTRY: Record<string, string> = {
  'Douala': 'CM', 'Yaoundé': 'CM',
  'Abidjan': 'CI',
  'Dakar': 'SN',
  'Libreville': 'GA',
  'Brazzaville': 'CG',
  'Kinshasa': 'CD',
  'Lomé': 'TG',
  'Cotonou': 'BJ',
  'Bamako': 'ML',
  'Ouagadougou': 'BF',
  'Niamey': 'NE',
  'Conakry': 'GN',
  'Bangui': 'CF',
  'Ndjamena': 'TD',
  'Accra': 'GH',
  'Lagos': 'NG',
  'Nairobi': 'KE',
  'Kampala': 'UG',
  'Kigali': 'RW',
  'Dar es Salaam': 'TZ',
  'Luanda': 'AO',
  'Casablanca': 'MA',
  'Tunis': 'TN',
  'Alger': 'DZ',
};

// Default tariff (Cameroun/FCFA)
const DEFAULT_TARIFF: CountryTariff = {
  id: 0,
  country_code: 'CM',
  country_name: 'Cameroun',
  currency_code: 'XAF',
  currency_symbol: 'FCFA',
  base_fare: 500,
  price_per_km: 350,
  price_per_min: 50,
  minimum_fare: 1000,
  airport_surcharge: 2000,
  night_multiplier: 1.5,
  night_start_hour: 22,
  night_end_hour: 6,
  daily_target: 30000,
  rounding_unit: 100,
  is_active: true,
};

export function useCountryTariff() {
  const { location } = useGeolocation();
  const [tariff, setTariff] = useState<CountryTariff>(DEFAULT_TARIFF);
  const [loading, setLoading] = useState(true);
  const [detectedCountry, setDetectedCountry] = useState<string>('CM');

  useEffect(() => {
    loadTariff();
  }, [location?.city]);

  const loadTariff = async () => {
    setLoading(true);
    try {
      // Determine country from detected city
      const city = location?.city || 'Douala';
      const countryCode = CITY_TO_COUNTRY[city] || 'CM';
      setDetectedCountry(countryCode);

      // Fetch tariff for this country
      const res = await client.entities.country_tariffs.query({
        query: { country_code: countryCode, is_active: true },
        limit: 1,
      });

      if (res?.data?.items && res.data.items.length > 0) {
        setTariff(res.data.items[0] as CountryTariff);
      } else {
        // Fallback to default
        setTariff({ ...DEFAULT_TARIFF, country_code: countryCode });
      }
    } catch {
      setTariff(DEFAULT_TARIFF);
    }
    setLoading(false);
  };

  // Calculate price based on country tariff
  const calculatePrice = (distanceKm: number, durationMin: number, isNight: boolean = false, isAirport: boolean = false): number => {
    let rawPrice = tariff.base_fare + distanceKm * tariff.price_per_km + durationMin * tariff.price_per_min;
    
    if (isNight) {
      rawPrice *= tariff.night_multiplier;
    }
    if (isAirport) {
      rawPrice += tariff.airport_surcharge;
    }

    // Apply minimum fare
    rawPrice = Math.max(rawPrice, tariff.minimum_fare);

    // Round to rounding unit
    const rounded = Math.ceil(rawPrice / tariff.rounding_unit) * tariff.rounding_unit;
    return rounded;
  };

  // Format price with currency symbol
  const formatPrice = (amount: number): string => {
    const formatted = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(amount);
    // Some currencies have symbol before, some after
    if (['GH₵', '₦', 'KSh', 'USh', 'Kz'].includes(tariff.currency_symbol)) {
      return `${tariff.currency_symbol} ${formatted}`;
    }
    return `${formatted} ${tariff.currency_symbol}`;
  };

  // Check if current time is night
  const isNightTime = (): boolean => {
    const hour = new Date().getHours();
    if (tariff.night_start_hour > tariff.night_end_hour) {
      return hour >= tariff.night_start_hour || hour < tariff.night_end_hour;
    }
    return hour >= tariff.night_start_hour && hour < tariff.night_end_hour;
  };

  return {
    tariff,
    loading,
    detectedCountry,
    calculatePrice,
    formatPrice,
    isNightTime,
  };
}