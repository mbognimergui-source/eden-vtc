/**
 * Ordonnanceur global des sondages (polling) EDEN VTC.
 *
 * L'application interroge en continu plusieurs endpoints (suivi de course,
 * position GPS, alertes caisse / sécurité / dette). Deux problèmes doivent être
 * traités ici :
 *
 * 1. Un refus 429 sur un endpoint ne doit pas laisser les autres marteler le
 *    serveur : une fenêtre de silence est partagée par tous les sondages.
 * 2. La passerelle API en amont applique son propre quota, indépendant du
 *    backend. Il faut donc plafonner le débit total émis par l'application,
 *    et non se contenter de réagir après le refus.
 *
 * Ce module joue le rôle de portier : tout sondage doit obtenir un jeton avant
 * d'émettre sa requête.
 */

let cooldownUntil = 0;
const listeners = new Set<(remainingMs: number) => void>();

/* --------------------------------------------------------------------------
 * Quota global d'émission (seau à jetons)
 * ------------------------------------------------------------------------ */

/** Fenêtre d'observation du quota, en millisecondes. */
const QUOTA_WINDOW_MS = 60_000;

/**
 * Nombre maximal de requêtes de sondage émises par minute, toutes pages et
 * tous hooks confondus. Volontairement conservateur : la marge restante est
 * réservée aux actions de l'utilisateur (commander, payer, se connecter), qui
 * ne doivent jamais être refusées à cause du trafic de fond.
 */
const MAX_POLL_REQUESTS_PER_WINDOW = 24;

/** Espacement minimal entre deux requêtes de sondage, pour lisser les rafales. */
const MIN_GAP_MS = 900;

/** Horodatages des requêtes de sondage émises dans la fenêtre courante. */
let emitted: number[] = [];
let lastEmitAt = 0;

/** Forme des erreurs remontées par le client API. */
interface ApiErrorLike {
  status?: number;
  statusCode?: number;
  error?: string;
  message?: string;
  data?: {
    retry_after?: number | string;
    error?: string;
    status?: number;
  };
  response?: {
    status?: number;
    data?: { retry_after?: number | string };
  };
}

/** Indique si l'erreur correspond à un dépassement de quota (HTTP 429). */
export function isRateLimitError(error: unknown): boolean {
  const err = error as ApiErrorLike;
  if (!err) return false;

  // Le code peut arriver à plusieurs emplacements selon la couche qui refuse
  // la requête (backend applicatif, client SDK, passerelle en amont).
  if (
    err.status === 429 ||
    err.statusCode === 429 ||
    err.data?.status === 429 ||
    err.response?.status === 429
  ) {
    return true;
  }

  const label = `${err.error ?? ''} ${err.data?.error ?? ''} ${err.message ?? ''}`;
  return /too many requests|429/i.test(label);
}

/** Extrait le délai d'attente conseillé par le serveur, en millisecondes. */
export function getRetryAfterMs(error: unknown, fallbackMs: number): number {
  const err = error as ApiErrorLike;
  const raw = err?.data?.retry_after ?? err?.response?.data?.retry_after;
  const seconds = typeof raw === 'string' ? Number(raw) : raw;

  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
    // Borne haute de sécurité : jamais plus de 2 minutes d'attente.
    return Math.min(seconds * 1000, 120_000);
  }
  return fallbackMs;
}

/** Ouvre une fenêtre de silence partagée par tous les sondages. */
export function notifyRateLimited(waitMs: number): void {
  const until = Date.now() + Math.max(1_000, waitMs);
  if (until <= cooldownUntil) return;

  cooldownUntil = until;

  // Le quota est reparti de zéro après la pause : les jetons déjà consommés
  // n'ont plus de sens et bloqueraient inutilement la reprise.
  emitted = [];

  const remaining = until - Date.now();
  listeners.forEach((listener) => {
    try {
      listener(remaining);
    } catch {
      /* un abonné défaillant ne doit pas casser les autres */
    }
  });
}

/** Millisecondes restantes avant reprise ; 0 si aucune limitation active. */
export function getGlobalCooldownMs(): number {
  const remaining = cooldownUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

/** Vrai si l'application est actuellement en attente après un 429. */
export function isThrottled(): boolean {
  return getGlobalCooldownMs() > 0;
}

/** Réinitialise la fenêtre de silence (utile après une action utilisateur). */
export function clearRateLimit(): void {
  cooldownUntil = 0;
}

/**
 * Demande l'autorisation d'émettre une requête de sondage.
 *
 * @returns 0 si la requête peut partir immédiatement (un jeton est consommé),
 *          sinon le nombre de millisecondes à attendre avant de redemander.
 */
export function acquirePollSlot(): number {
  const now = Date.now();

  const cooldown = getGlobalCooldownMs();
  if (cooldown > 0) return cooldown + 250;

  // Lissage : deux sondages ne partent jamais dans la même milliseconde.
  const sinceLast = now - lastEmitAt;
  if (sinceLast < MIN_GAP_MS) return MIN_GAP_MS - sinceLast;

  emitted = emitted.filter((t) => now - t < QUOTA_WINDOW_MS);

  if (emitted.length >= MAX_POLL_REQUESTS_PER_WINDOW) {
    // Le quota est saturé : attendre la libération du plus ancien créneau.
    const oldest = emitted[0];
    return Math.max(500, QUOTA_WINDOW_MS - (now - oldest) + 100);
  }

  emitted.push(now);
  lastEmitAt = now;
  return 0;
}

/** Nombre de requêtes de sondage encore disponibles dans la fenêtre courante. */
export function getRemainingPollQuota(): number {
  const now = Date.now();
  emitted = emitted.filter((t) => now - t < QUOTA_WINDOW_MS);
  return Math.max(0, MAX_POLL_REQUESTS_PER_WINDOW - emitted.length);
}

/** S'abonne aux déclenchements de limitation. Retourne la fonction de retrait. */
export function onRateLimited(
  listener: (remainingMs: number) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}