import { useState, useEffect, useCallback } from 'react';
import { client } from '@/lib/client';
import { usePolling } from '@/hooks/usePolling';

export type DebtAlertLevel = 'none' | 'info' | 'warning' | 'critical';

export interface DebtAlertState {
  level: DebtAlertLevel;
  hasDebt: boolean;
  debtAmount: number;
  walletBalance: number;
  message: string;
  actionLabel: string;
  daysOverdue: number;
  isBlocked: boolean;
  loading: boolean;
  refresh: () => void;
  dismiss: () => void;
  isDismissed: boolean;
}

const DISMISS_KEY = 'eden_debt_alert_dismissed';
const DISMISS_DURATION_MS = 4 * 60 * 60 * 1000; // 4 heures

/**
 * Hook qui surveille l'état de la dette de l'utilisateur et détermine
 * le niveau d'alerte approprié.
 * 
 * Niveaux d'alerte :
 * - none : pas de dette
 * - info : dette récente, montant faible (< 2000 FCFA)
 * - warning : dette modérée (2000-4000 FCFA) ou > 24h
 * - critical : dette au plafond (5000 FCFA) ou > 48h, commande bloquée
 */
export function useDebtAlerts(): DebtAlertState {
  const [hasDebt, setHasDebt] = useState(false);
  const [debtAmount, setDebtAmount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [lastDebtTransaction, setLastDebtTransaction] = useState<string | null>(null);

  // Vérifier si l'alerte a été récemment fermée
  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_DURATION_MS) {
        setIsDismissed(true);
      } else {
        localStorage.removeItem(DISMISS_KEY);
      }
    }
  }, []);

  /**
   * Lecture de l'état de la dette.
   * Les erreurs sont volontairement propagées : `usePolling` s'en sert pour
   * respecter le délai d'attente en cas de dépassement de quota (HTTP 429).
   */
  const fetchDebtStatus = useCallback(async () => {
    try {
      const pRes = await client.entities.passengers.query({ query: {} });
      if (pRes?.data?.items?.length > 0) {
        const p = pRes.data.items[0];
        setHasDebt(p.has_pending_debt || false);
        setDebtAmount(p.debt_amount || 0);
        setWalletBalance(p.wallet_balance || 0);
      }

      // Chercher la dernière transaction de type debt pour calculer l'ancienneté
      const tRes = await client.entities.wallet_transactions.query({
        query: { type: 'ride_debt' },
        sort: '-created_at',
        limit: 1,
      });
      if (tRes?.data?.items?.length > 0) {
        setLastDebtTransaction(tRes.data.items[0].created_at);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /** Rafraîchissement manuel : ne remonte jamais d'erreur à l'interface. */
  const loadDebtStatus = useCallback(async () => {
    try {
      await fetchDebtStatus();
    } catch (e) {
      console.error('Failed to load debt status', e);
    }
  }, [fetchDebtStatus]);

  // Cadence lente : la dette n'évolue qu'après un paiement de l'utilisateur, et
  // `refresh()` déclenche déjà une lecture immédiate quand c'est nécessaire.
  usePolling(fetchDebtStatus, { interval: 90_000, maxInterval: 180_000 });

  // Calculer le nombre de jours depuis la création de la dette
  const daysOverdue = (() => {
    if (!lastDebtTransaction) return 0;
    const debtDate = new Date(lastDebtTransaction);
    const now = new Date();
    return Math.floor((now.getTime() - debtDate.getTime()) / (1000 * 60 * 60 * 24));
  })();

  // Déterminer le niveau d'alerte
  const level: DebtAlertLevel = (() => {
    if (!hasDebt || debtAmount <= 0) return 'none';
    if (debtAmount >= 5000 || daysOverdue >= 2) return 'critical';
    if (debtAmount >= 2000 || daysOverdue >= 1) return 'warning';
    return 'info';
  })();

  // Déterminer si la commande est bloquée
  const isBlocked = hasDebt && debtAmount > 0;

  // Message adapté au niveau
  const message = (() => {
    switch (level) {
      case 'critical':
        return `⚠️ Dette impayée de ${debtAmount.toLocaleString()} FCFA. Vos commandes sont bloquées. Régularisez immédiatement pour continuer à utiliser EDEN VTC.`;
      case 'warning':
        return `Vous avez une dette de ${debtAmount.toLocaleString()} FCFA en attente. Régularisez pour pouvoir commander à nouveau.`;
      case 'info':
        return `Un montant de ${debtAmount.toLocaleString()} FCFA est en attente de régularisation sur votre compte.`;
      default:
        return '';
    }
  })();

  // Label du bouton d'action
  const actionLabel = (() => {
    switch (level) {
      case 'critical':
        return 'Régulariser maintenant';
      case 'warning':
        return 'Payer ma dette';
      case 'info':
        return 'Voir le portefeuille';
      default:
        return '';
    }
  })();

  const dismiss = useCallback(() => {
    // Ne pas permettre de fermer les alertes critiques
    if (level === 'critical') return;
    setIsDismissed(true);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }, [level]);

  const refresh = useCallback(() => {
    setIsDismissed(false);
    localStorage.removeItem(DISMISS_KEY);
    loadDebtStatus();
  }, [loadDebtStatus]);

  return {
    level,
    hasDebt,
    debtAmount,
    walletBalance,
    message,
    actionLabel,
    daysOverdue,
    isBlocked,
    loading,
    refresh,
    dismiss,
    isDismissed,
  };
}