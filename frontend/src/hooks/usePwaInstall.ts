import { useCallback, useEffect, useState } from 'react';
import { isIosDevice, isStandalone } from '@/lib/pwa';

/** Événement Chrome/Edge non encore typé dans la lib DOM standard. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'eden_vtc_pwa_prompt_dismissed_at';
/** On ne réaffiche pas l'invitation avant 7 jours après un refus. */
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export interface PwaInstallState {
  /** L'application peut être installée via l'invite native du navigateur. */
  canInstall: boolean;
  /** L'application tourne déjà en mode installé. */
  installed: boolean;
  /** iOS : l'installation doit être expliquée manuellement. */
  needsManualIosSteps: boolean;
  /** L'invitation doit-elle être affichée à l'utilisateur. */
  shouldPrompt: boolean;
  /** Déclenche l'invite native ; retourne true si l'utilisateur a accepté. */
  promptInstall: () => Promise<boolean>;
  /** Masque l'invitation pour 7 jours. */
  dismiss: () => void;
}

/**
 * Gère la détection d'installabilité PWA et l'invitation d'ajout à l'écran
 * d'accueil, en tenant compte du cas iOS où l'API native n'existe pas.
 */
export function usePwaInstall(): PwaInstallState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const [dismissed, setDismissed] = useState<boolean>(() =>
    wasRecentlyDismissed()
  );

  const ios = isIosDevice();

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Empêche la mini-infobar Chrome pour piloter nous-mêmes l'invitation.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    const media = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) setInstalled(true);
    };
    media?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      media?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (outcome === 'accepted') {
        setInstalled(true);
        return true;
      }

      // Refus explicite : on respecte le délai de latence.
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        /* stockage indisponible : on ignore */
      }
      setDismissed(true);
      return false;
    } catch (error) {
      console.warn("Invite d'installation indisponible :", error);
      return false;
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* stockage indisponible : on ignore */
    }
    setDismissed(true);
  }, []);

  const canInstall = !installed && deferredPrompt !== null;
  const needsManualIosSteps = !installed && ios && deferredPrompt === null;

  return {
    canInstall,
    installed,
    needsManualIosSteps,
    shouldPrompt: !dismissed && (canInstall || needsManualIosSteps),
    promptInstall,
    dismiss,
  };
}