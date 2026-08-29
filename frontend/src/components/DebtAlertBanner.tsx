import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, CreditCard, Clock, ShieldAlert, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDebtAlerts, DebtAlertLevel } from '@/hooks/useDebtAlerts';
import { useCountryTariff } from '@/hooks/useCountryTariff';

interface DebtAlertBannerProps {
  /** Afficher en mode compact (une seule ligne) */
  compact?: boolean;
  /** Classe CSS additionnelle */
  className?: string;
}

const levelStyles: Record<DebtAlertLevel, { bg: string; border: string; text: string; icon: string; accent: string }> = {
  none: { bg: '', border: '', text: '', icon: '', accent: '' },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: 'text-blue-500',
    accent: 'bg-blue-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: 'text-amber-500',
    accent: 'bg-amber-500',
  },
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-800',
    icon: 'text-red-500',
    accent: 'bg-red-500',
  },
};

export default function DebtAlertBanner({ compact = false, className = '' }: DebtAlertBannerProps) {
  const navigate = useNavigate();
  const { formatPrice } = useCountryTariff();
  const {
    level,
    hasDebt,
    debtAmount,
    message,
    actionLabel,
    daysOverdue,
    isBlocked,
    loading,
    dismiss,
    isDismissed,
  } = useDebtAlerts();

  // Ne rien afficher si pas de dette, en chargement, ou fermé (sauf critique)
  if (loading || level === 'none') return null;
  if (isDismissed && level !== 'critical') return null;

  const styles = levelStyles[level];

  // Mode compact : bandeau simple en haut de page
  if (compact) {
    return (
      <div className={`${styles.bg} ${styles.border} border-b px-4 py-2.5 flex items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${styles.icon}`} />
          <p className={`text-sm font-medium truncate ${styles.text}`}>
            Dette : {formatPrice(debtAmount)}
            {isBlocked && ' — Commandes bloquées'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate('/wallet')}
            className={`h-7 px-2.5 text-xs font-semibold ${styles.text} hover:${styles.bg}`}
          >
            Régler <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
          {level !== 'critical' && (
            <button onClick={dismiss} className={`p-1 rounded hover:bg-black/5 ${styles.icon}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Mode complet : carte d'alerte détaillée
  return (
    <div className={`${styles.bg} ${styles.border} border rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {/* Barre de sévérité */}
      <div className={`h-1 ${styles.accent}`} />

      <div className="p-4 space-y-3">
        {/* En-tête avec icône et titre */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl ${styles.bg} border ${styles.border} flex items-center justify-center flex-shrink-0`}>
              {level === 'critical' ? (
                <ShieldAlert className={`w-5 h-5 ${styles.icon}`} />
              ) : level === 'warning' ? (
                <AlertTriangle className={`w-5 h-5 ${styles.icon}`} />
              ) : (
                <CreditCard className={`w-5 h-5 ${styles.icon}`} />
              )}
            </div>
            <div>
              <h4 className={`font-semibold text-sm ${styles.text}`}>
                {level === 'critical' ? 'Action requise — Commandes bloquées' :
                 level === 'warning' ? 'Dette en attente' :
                 'Régularisation en attente'}
              </h4>
              <p className={`text-sm mt-0.5 ${styles.text} opacity-80`}>
                {message}
              </p>
            </div>
          </div>
          {level !== 'critical' && (
            <button
              onClick={dismiss}
              className={`p-1.5 rounded-lg hover:bg-black/5 flex-shrink-0 ${styles.icon}`}
              aria-label="Fermer l'alerte"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Détails : montant + ancienneté */}
        <div className="flex items-center gap-4 pl-13">
          <div className={`flex items-center gap-1.5 text-xs ${styles.text} opacity-70`}>
            <CreditCard className="w-3.5 h-3.5" />
            <span>{formatPrice(debtAmount)}</span>
          </div>
          {daysOverdue > 0 && (
            <div className={`flex items-center gap-1.5 text-xs ${styles.text} opacity-70`}>
              <Clock className="w-3.5 h-3.5" />
              <span>
                {daysOverdue === 1 ? 'Depuis hier' : `Depuis ${daysOverdue} jours`}
              </span>
            </div>
          )}
          {isBlocked && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Bloqué</span>
            </div>
          )}
        </div>

        {/* Bouton d'action */}
        <div className="pl-13">
          <Button
            size="sm"
            onClick={() => navigate('/wallet')}
            className={`
              ${level === 'critical' ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200' :
                level === 'warning' ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200' :
                'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200'}
              font-semibold h-9 px-4 text-xs
            `}
          >
            {actionLabel}
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}