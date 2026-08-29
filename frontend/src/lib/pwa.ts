/**
 * Enregistrement et gestion du service worker EDEN VTC.
 *
 * Le service worker n'est enregistré qu'en production : en développement il
 * masquerait le rechargement à chaud de Vite et servirait des assets périmés.
 */

const SW_URL = '/sw.js';

/** Indique si l'application tourne en mode installé (écran d'accueil). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  const displayModes = ['standalone', 'minimal-ui', 'fullscreen'];
  const matchesDisplayMode = displayModes.some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches === true
  );

  // Safari iOS expose navigator.standalone au lieu de display-mode.
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;

  return matchesDisplayMode || iosStandalone;
}

/** Détecte iOS / iPadOS, où l'installation reste manuelle via « Partager ». */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const isIphoneOrIpad = /iPad|iPhone|iPod/.test(ua);

  // iPadOS 13+ se présente comme un Mac tactile.
  const isIpadOs =
    /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;

  return isIphoneOrIpad || isIpadOs;
}

/**
 * Enregistre le service worker et applique immédiatement toute mise à jour
 * disponible pour éviter qu'un utilisateur reste bloqué sur une ancienne version.
 */
export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: '/',
    });

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (
          installing.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          installing.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  } catch (error) {
    console.warn('Service worker non enregistré :', error);
  }
}