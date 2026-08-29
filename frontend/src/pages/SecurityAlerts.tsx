import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';
import UserAlertsPanel from '@/components/UserAlertsBanner';
import { useUserAlerts, requestAlertNotificationPermission } from '@/hooks/useUserAlerts';
import { useAuth } from '@/hooks/useAuth';
import { getLang, type Lang } from '@/lib/i18n';

export default function SecurityAlerts() {
  const lang: Lang = getLang();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const {
    alerts,
    stats,
    newAlerts,
    markAsRead,
    markAllRead,
    dismissAlert,
  } = useUserAlerts(isAuthenticated);

  useEffect(() => {
    requestAlertNotificationPermission();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-[#1F4E5F] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-50">
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10 p-1"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Shield className="h-5 w-5" />
        <h1 className="text-lg font-semibold">
          {lang === 'fr' ? 'Sécurité du compte' : 'Account Security'}
        </h1>
      </header>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Info card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-sm text-[#1F4E5F] mb-1">
            {lang === 'fr' ? 'Protection de votre compte' : 'Account Protection'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {lang === 'fr'
              ? 'EDEN VTC surveille en permanence les activités suspectes sur votre compte. Vous serez alerté en cas de connexion inhabituelle, tentative de fraude, ou changement de sécurité.'
              : 'EDEN VTC continuously monitors suspicious activities on your account. You will be alerted for unusual logins, fraud attempts, or security changes.'}
          </p>
        </div>

        {/* Alerts panel */}
        <UserAlertsPanel
          alerts={alerts}
          stats={stats}
          newAlerts={newAlerts}
          onMarkRead={markAsRead}
          onMarkAllRead={markAllRead}
          onDismiss={dismissAlert}
        />

        {/* Security tips */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-sm mb-2">
            {lang === 'fr' ? '🛡️ Conseils de sécurité' : '🛡️ Security Tips'}
          </h3>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>
              {lang === 'fr'
                ? '• Ne partagez jamais vos identifiants de connexion'
                : '• Never share your login credentials'}
            </li>
            <li>
              {lang === 'fr'
                ? '• Utilisez un mot de passe unique et complexe'
                : '• Use a unique and complex password'}
            </li>
            <li>
              {lang === 'fr'
                ? '• Vérifiez régulièrement vos alertes de sécurité'
                : '• Regularly check your security alerts'}
            </li>
            <li>
              {lang === 'fr'
                ? '• Signalez toute activité suspecte au support'
                : '• Report any suspicious activity to support'}
            </li>
            <li>
              {lang === 'fr'
                ? '• Déconnectez-vous des appareils que vous ne reconnaissez pas'
                : '• Log out from devices you don\'t recognize'}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}