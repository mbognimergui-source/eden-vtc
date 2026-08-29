import { useEffect, useRef } from 'react';
import {
  acquirePollSlot,
  getGlobalCooldownMs,
  getRetryAfterMs,
  isRateLimitError,
  notifyRateLimited,
} from '@/lib/pollingScheduler';

export interface PollingTaskResult {
  /** Arrête définitivement le sondage (état terminal atteint). */
  stop?: boolean;
}

export interface UsePollingOptions {
  /** Intervalle nominal entre deux exécutions, en millisecondes. */
  interval: number;
  /** Active ou suspend le sondage. */
  enabled?: boolean;
  /** Plafond de l'intervalle après repli exponentiel. */
  maxInterval?: number;
  /** Suspend le sondage quand l'onglet est en arrière-plan (par défaut true). */
  pauseWhenHidden?: boolean;
}

/**
 * Sondage résilient et discipliné :
 * - demande un jeton à l'ordonnanceur global avant chaque requête, afin que le
 *   débit total de l'application reste sous le quota de la passerelle API ;
 * - respecte le délai `Retry-After` en cas de 429 ;
 * - applique un repli exponentiel sur erreur réseau ;
 * - se met en pause quand l'onglet passe en arrière-plan.
 *
 * La tâche doit propager ses erreurs (ne pas les avaler) pour que le repli
 * puisse s'appliquer.
 */
export function usePolling(
  task: () => Promise<PollingTaskResult | void>,
  options: UsePollingOptions
): void {
  const {
    interval,
    enabled = true,
    maxInterval = 120_000,
    pauseWhenHidden = true,
  } = options;

  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = interval;

    const schedule = (ms: number) => {
      if (cancelled || stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, Math.max(250, ms));
    };

    async function run() {
      if (cancelled || stopped) return;

      // Onglet en arrière-plan : on saute le tour sans consommer de quota.
      if (pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
        schedule(interval);
        return;
      }

      // Portier global : quota saturé, pause en cours ou rafale à lisser.
      const waitMs = acquirePollSlot();
      if (waitMs > 0) {
        schedule(waitMs);
        return;
      }

      try {
        const result = await taskRef.current();
        if (result && result.stop) {
          stopped = true;
          return;
        }
        delay = interval;
        schedule(delay);
      } catch (error) {
        if (isRateLimitError(error)) {
          const wait = getRetryAfterMs(
            error,
            Math.min(Math.max(delay * 2, 30_000), maxInterval)
          );
          // Toute l'application observe la même pause.
          notifyRateLimited(wait);
          delay = Math.min(Math.max(delay * 2, interval), maxInterval);
          schedule(wait + 500);
          return;
        }

        // Autre erreur (réseau 3G instable) : repli progressif.
        delay = Math.min(delay * 2, maxInterval);
        schedule(delay);
      }
    }

    void run();

    const onVisibilityChange = () => {
      if (cancelled || stopped) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      // Retour au premier plan : rafraîchissement rapide mais respectueux.
      schedule(Math.max(getGlobalCooldownMs(), 600));
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [enabled, interval, maxInterval, pauseWhenHidden]);
}