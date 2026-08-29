import { useEffect, useState } from 'react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { getLang, setLangFromCity, setLangManual, Lang } from '@/lib/i18n';

/**
 * Hook that auto-detects the language based on the user's geolocation (city/country).
 * - Anglophone countries (Ghana, Nigeria, Kenya, Uganda, Rwanda, Tanzania) → English
 * - All other countries → French
 * 
 * The user can manually override the language via setLangManual, 
 * which prevents auto-detection from changing it again.
 */
export function useAutoLang() {
  const { location } = useGeolocation();
  const [lang, setLangState] = useState<Lang>(getLang());

  useEffect(() => {
    if (location?.city) {
      setLangFromCity(location.city);
      setLangState(getLang());
    }
  }, [location?.city]);

  const switchLang = (newLang: Lang) => {
    setLangManual(newLang);
    setLangState(newLang);
  };

  return {
    lang,
    switchLang,
    isEnglish: lang === 'en',
    isFrench: lang === 'fr',
  };
}