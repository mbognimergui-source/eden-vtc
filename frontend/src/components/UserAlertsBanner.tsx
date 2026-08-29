import { useState } from 'react';
import { UserAlert, UserAlertStats } from '@/hooks/useUserAlerts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  Monitor,
  MapPin,
  ShieldAlert,
  ShieldX,
  Lock,
  CreditCard,
  Users,
  X,
} from 'lucide-react';
import { getLang, type Lang } from '@/lib/i18n';

const ALERT_TYPE_CONFIG: Record<string, {
  fr: string;
  en: string;
  icon: React.ElementType;
}> = {
  new_device: { fr: 'Nouvel appareil', en: 'New Device', icon: Monitor },
  suspicious_login: { fr: 'Connexion suspecte', en: 'Suspicious Login', icon: ShieldAlert },
  fraud_attempt: { fr: 'Tentative de fraude', en: 'Fraud Attempt', icon: ShieldX },
  multiple_accounts: { fr: 'Multi-comptes', en: 'Multiple Accounts', icon: Users },
  account_locked: { fr: 'Compte verrouillé', en: 'Account Locked', icon: Lock },
  unusual_location: { fr: 'Localisation inhabituelle', en: 'Unusual Location', icon: MapPin },
  debt_warning: { fr: 'Alerte dette', en: 'Debt Warning', icon: CreditCard },
};

const SEVERITY_STYLES: Record<string, {
  bg: string;
  border: string;
  text: string;
  badge: string;
  label: { fr: string; en: string };
}> = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-300 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    badge: 'bg-red-500 text-white',
    label: { fr: 'Critique', en: 'Critical' },
  },
  high: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-300 dark:border-orange-800',
    text: 'text-orange-700 dark:text-orange-300',
    badge: 'bg-orange-500 text-white',
    label: { fr: 'Élevé', en: 'High' },
  },
  medium: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-300 dark:border-yellow-800',
    text: 'text-yellow-700 dark:text-yellow-300',
    badge: 'bg-yellow-500 text-white',
    label: { fr: 'Moyen', en: 'Medium' },
  },
  low: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-300 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-500 text-white',
    label: { fr: 'Faible', en: 'Low' },
  },
};

function formatTimeAgo(dateStr: string, lang: 'fr' | 'en'): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return lang === 'fr' ? "À l'instant" : 'Just now';
  if (minutes < 60) return lang === 'fr' ? `Il y a ${minutes}min` : `${minutes}m ago`;
  if (hours < 24) return lang === 'fr' ? `Il y a ${hours}h` : `${hours}h ago`;
  return lang === 'fr' ? `Il y a ${days}j` : `${days}d ago`;
}

interface AlertItemProps {
  alert: UserAlert;
  lang: 'fr' | 'en';
  onDismiss: (id: number) => void;
  onMarkRead: (ids: number[]) => void;
}

function AlertItem({ alert, lang, onDismiss, onMarkRead }: AlertItemProps) {
  const typeConfig = ALERT_TYPE_CONFIG[alert.alert_type] || {
    fr: alert.alert_type,
    en: alert.alert_type,
    icon: Bell,
  };
  const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium;
  const IconComponent = typeConfig.icon;

  return (
    <div
      className={`p-3 rounded-lg border ${severity.bg} ${severity.border} ${
        !alert.is_read ? 'ring-1 ring-offset-1 ring-current/20' : 'opacity-80'
      } transition-all`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className={`mt-0.5 ${severity.text}`}>
            <IconComponent className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-medium text-sm ${severity.text}`}>
                {lang === 'fr' ? typeConfig.fr : typeConfig.en}
              </span>
              <Badge className={`text-[10px] px-1.5 py-0 ${severity.badge}`}>
                {lang === 'fr' ? severity.label.fr : severity.label.en}
              </Badge>
              {!alert.is_read && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
            <p className="text-xs font-medium mt-0.5">{alert.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {alert.message}
            </p>
            <span className="text-[10px] text-muted-foreground mt-1 block">
              {formatTimeAgo(alert.created_at, lang)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!alert.is_read && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => onMarkRead([alert.id])}
              title={lang === 'fr' ? 'Marquer comme lu' : 'Mark as read'}
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onDismiss(alert.id)}
            title={lang === 'fr' ? 'Supprimer' : 'Dismiss'}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Compact Banner (for header/top of pages) ----------
interface UserAlertsBannerProps {
  alerts: UserAlert[];
  stats: UserAlertStats;
  newAlerts: UserAlert[];
  onMarkRead: (ids: number[]) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: number) => void;
}

export function UserAlertsBannerCompact({
  stats,
  newAlerts,
  onMarkAllRead,
}: Pick<UserAlertsBannerProps, 'stats' | 'newAlerts' | 'onMarkAllRead'>) {
  const lang: Lang = getLang();

  if (stats.unread === 0) return null;

  const hasCritical = stats.critical > 0;

  return (
    <div
      className={`px-4 py-2 flex items-center justify-between text-sm ${
        hasCritical
          ? 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-b border-red-200'
          : 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-b border-amber-200'
      }`}
    >
      <div className="flex items-center gap-2">
        {hasCritical ? (
          <ShieldAlert className="h-4 w-4 animate-pulse" />
        ) : (
          <BellRing className="h-4 w-4" />
        )}
        <span className="font-medium">
          {lang === 'fr'
            ? `${stats.unread} alerte(s) de sécurité non lue(s)`
            : `${stats.unread} unread security alert(s)`}
        </span>
        {hasCritical && (
          <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0">
            {stats.critical} {lang === 'fr' ? 'critique(s)' : 'critical'}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {newAlerts.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={onMarkAllRead}
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            {lang === 'fr' ? 'Tout lu' : 'Read all'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Full Panel (for dedicated alerts page/section) ----------
export default function UserAlertsPanel({
  alerts,
  stats,
  newAlerts,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
}: UserAlertsBannerProps) {
  const lang: Lang = getLang();
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !a.is_read;
    return a.severity === filter;
  });

  return (
    <Card className="border-[#1F4E5F]/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[#1F4E5F]" />
            {lang === 'fr' ? 'Alertes de sécurité' : 'Security Alerts'}
            {stats.unread > 0 && (
              <Badge className="bg-red-500 text-white text-xs ml-1">
                {stats.unread}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {stats.unread > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={onMarkAllRead}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                {lang === 'fr' ? 'Tout marquer lu' : 'Mark all read'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Stats row */}
        {expanded && (
          <div className="flex gap-3 mt-2 text-xs">
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              <span className="font-bold text-red-600">{stats.critical}</span>
              {lang === 'fr' ? 'critiques' : 'critical'}
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-orange-500" />
              <span className="font-bold text-orange-600">{stats.high}</span>
              {lang === 'fr' ? 'élevées' : 'high'}
            </span>
            <span className="flex items-center gap-1">
              <Bell className="h-3 w-3 text-yellow-600" />
              <span className="font-bold text-yellow-700">{stats.medium + stats.low}</span>
              {lang === 'fr' ? 'autres' : 'other'}
            </span>
          </div>
        )}

        {/* Filters */}
        {expanded && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[
              { key: 'all', label: { fr: 'Toutes', en: 'All' } },
              { key: 'unread', label: { fr: 'Non lues', en: 'Unread' } },
              { key: 'critical', label: { fr: 'Critiques', en: 'Critical' } },
              { key: 'high', label: { fr: 'Élevées', en: 'High' } },
            ].map((f) => (
              <Button
                key={f.key}
                variant={filter === f.key ? 'default' : 'outline'}
                size="sm"
                className="text-[11px] h-6 px-2"
                onClick={() => setFilter(f.key)}
              >
                {lang === 'fr' ? f.label.fr : f.label.en}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {/* New alerts banner */}
          {newAlerts.length > 0 && (
            <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                <BellRing className="h-4 w-4 animate-bounce" />
                <span className="font-medium">
                  {lang === 'fr'
                    ? `${newAlerts.length} nouvelle(s) alerte(s) !`
                    : `${newAlerts.length} new alert(s)!`}
                </span>
              </div>
            </div>
          )}

          {filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <CheckCircle className="h-8 w-8 text-green-400 mb-2" />
              <p className="text-sm font-medium">
                {lang === 'fr' ? 'Aucune alerte' : 'No alerts'}
              </p>
              <p className="text-xs mt-1">
                {lang === 'fr'
                  ? 'Votre compte est sécurisé'
                  : 'Your account is secure'}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[350px] pr-2">
              <div className="space-y-2">
                {filteredAlerts.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    lang={lang}
                    onDismiss={onDismiss}
                    onMarkRead={onMarkRead}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      )}
    </Card>
  );
}