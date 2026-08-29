export type Lang = 'fr' | 'en';

// Mapping country code → default language
// Anglophone African countries use English, all others use French
const COUNTRY_LANG_MAP: Record<string, Lang> = {
  // Anglophone
  'GH': 'en', // Ghana
  'NG': 'en', // Nigeria
  'KE': 'en', // Kenya
  'UG': 'en', // Ouganda
  'RW': 'en', // Rwanda
  'TZ': 'en', // Tanzanie
  // Francophone (explicit)
  'CM': 'fr', // Cameroun
  'CI': 'fr', // Côte d'Ivoire
  'SN': 'fr', // Sénégal
  'GA': 'fr', // Gabon
  'CG': 'fr', // Congo
  'CD': 'fr', // RD Congo
  'TG': 'fr', // Togo
  'BJ': 'fr', // Bénin
  'ML': 'fr', // Mali
  'BF': 'fr', // Burkina Faso
  'NE': 'fr', // Niger
  'GN': 'fr', // Guinée
  'CF': 'fr', // Centrafrique
  'TD': 'fr', // Tchad
  'AO': 'fr', // Angola (lusophone, mais fr par défaut dans l'app)
  'MA': 'fr', // Maroc
  'TN': 'fr', // Tunisie
  'DZ': 'fr', // Algérie
};

// City name → country code (for auto-detection from geolocation)
const CITY_TO_COUNTRY_CODE: Record<string, string> = {
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

/**
 * Get the default language for a given country code
 */
export function getLangForCountry(countryCode: string): Lang {
  return COUNTRY_LANG_MAP[countryCode] || 'fr';
}

/**
 * Get the default language for a given city name
 */
export function getLangForCity(city: string): Lang {
  const code = CITY_TO_COUNTRY_CODE[city];
  if (code) return getLangForCountry(code);
  return 'fr';
}

const translations: Record<string, Record<Lang, string>> = {
  // Navigation
  'nav.home': { fr: 'Accueil', en: 'Home' },
  'nav.book': { fr: 'Commander', en: 'Book' },
  'nav.rides': { fr: 'Mes courses', en: 'My rides' },
  'nav.wallet': { fr: 'Portefeuille', en: 'Wallet' },
  'nav.profile': { fr: 'Profil', en: 'Profile' },
  'nav.driver': { fr: 'Chauffeur', en: 'Driver' },
  'nav.admin': { fr: 'Administration', en: 'Admin' },
  'nav.login': { fr: 'Connexion', en: 'Login' },
  'nav.logout': { fr: 'Déconnexion', en: 'Logout' },

  // Home
  'home.title': { fr: 'EDEN VTC', en: 'EDEN VTC' },
  'home.subtitle': { fr: 'Transport 100% électrique à Douala', en: '100% Electric Transport in Douala' },
  'home.cta': { fr: 'Commander une course', en: 'Book a ride' },
  'home.eco': { fr: 'Course 100% électrique', en: '100% Electric ride' },
  'home.co2': { fr: 'CO₂ évité', en: 'CO₂ saved' },

  // Booking
  'book.title': { fr: 'Commander une course', en: 'Book a ride' },
  'book.pickup': { fr: 'Point de départ', en: 'Pickup location' },
  'book.destination': { fr: 'Destination', en: 'Destination' },
  'book.estimate': { fr: 'Estimer le prix', en: 'Estimate price' },
  'book.confirm': { fr: 'Confirmer la course', en: 'Confirm ride' },
  'book.schedule': { fr: 'Réserver pour plus tard', en: 'Schedule for later' },
  'book.estimated_price': { fr: 'Prix estimé', en: 'Estimated price' },
  'book.distance': { fr: 'Distance', en: 'Distance' },
  'book.duration': { fr: 'Durée estimée', en: 'Estimated duration' },
  'book.payment_method': { fr: 'Mode de paiement', en: 'Payment method' },
  'book.debt_warning': { fr: 'Votre solde est insuffisant. Cette course sera mise en dette. Régularisez avant la prochaine commande.', en: 'Insufficient balance. This ride will be on credit. Please settle before your next order.' },

  // Wallet
  'wallet.title': { fr: 'Mon portefeuille', en: 'My wallet' },
  'wallet.balance': { fr: 'Solde actuel', en: 'Current balance' },
  'wallet.topup': { fr: 'Recharger', en: 'Top up' },
  'wallet.history': { fr: 'Historique', en: 'History' },
  'wallet.debt': { fr: 'Dette à régulariser', en: 'Outstanding debt' },

  // Driver
  'driver.dashboard': { fr: 'Tableau de bord', en: 'Dashboard' },
  'driver.today_rides': { fr: 'Courses du jour', en: "Today's rides" },
  'driver.earnings': { fr: 'Recettes du jour', en: "Today's earnings" },
  'driver.target': { fr: 'Objectif', en: 'Target' },
  'driver.online': { fr: 'En ligne', en: 'Online' },
  'driver.offline': { fr: 'Hors ligne', en: 'Offline' },
  'driver.on_ride': { fr: 'En course', en: 'On ride' },
  'driver.recharge': { fr: 'Déclarer une recharge', en: 'Declare recharge' },
  'driver.accept': { fr: 'Accepter', en: 'Accept' },
  'driver.decline': { fr: 'Refuser', en: 'Decline' },

  // Admin
  'admin.dashboard': { fr: 'Tableau de bord flotte', en: 'Fleet dashboard' },
  'admin.vehicles': { fr: 'Véhicules', en: 'Vehicles' },
  'admin.drivers': { fr: 'Chauffeurs', en: 'Drivers' },
  'admin.rides': { fr: 'Courses', en: 'Rides' },
  'admin.tariffs': { fr: 'Tarification', en: 'Pricing' },
  'admin.exports': { fr: 'Exports', en: 'Exports' },
  'admin.revenue': { fr: 'Recettes', en: 'Revenue' },
  'admin.availability': { fr: 'Disponibilité flotte', en: 'Fleet availability' },
  'admin.alert': { fr: 'Alerte −15%', en: '−15% Alert' },
  'admin.energy_cost': { fr: 'Coût énergie', en: 'Energy cost' },

  // Common
  'common.fcfa': { fr: 'FCFA', en: 'XAF' },
  'common.km': { fr: 'km', en: 'km' },
  'common.min': { fr: 'min', en: 'min' },
  'common.save': { fr: 'Enregistrer', en: 'Save' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'common.loading': { fr: 'Chargement...', en: 'Loading...' },
  'common.error': { fr: 'Erreur', en: 'Error' },
  'common.success': { fr: 'Succès', en: 'Success' },
};

let currentLang: Lang = 'fr';
const LANG_STORAGE_KEY = 'eden_vtc_lang';

// Initialize from localStorage if available
try {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === 'fr' || stored === 'en') {
    currentLang = stored;
  }
} catch { /* ignore */ }

export function setLang(lang: Lang) {
  currentLang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch { /* ignore */ }
}

/**
 * Auto-detect and set language based on city name (from geolocation).
 * Only applies if user hasn't manually overridden the language.
 */
export function setLangFromCity(city: string) {
  try {
    const manualOverride = localStorage.getItem('eden_vtc_lang_manual');
    if (manualOverride === 'true') return; // User chose manually, don't override
  } catch { /* ignore */ }
  const detectedLang = getLangForCity(city);
  setLang(detectedLang);
}

/**
 * Manually set language (marks as user override so auto-detection won't change it)
 */
export function setLangManual(lang: Lang) {
  setLang(lang);
  try {
    localStorage.setItem('eden_vtc_lang_manual', 'true');
  } catch { /* ignore */ }
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string): string {
  return translations[key]?.[currentLang] || key;
}

export function formatCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(Math.round(amount / 100) * 100) + ' FCFA';
}