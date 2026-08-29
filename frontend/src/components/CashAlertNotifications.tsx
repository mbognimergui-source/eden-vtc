import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCashAlerts, CashAlert } from '@/hooks/useCashAlerts';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import {
  Bell,
  BellRing,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  TrendingDown,
  Banknote,
  CreditCard,
  UserX,
} from 'lucide-react';

const SEVERITY_CONFIG = {
  critical: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    badge: 'bg-red-100 text-red-700 border-red-300',
    icon: AlertCircle,
    iconColor: 'text-red-600',
    label: 'Critique',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    badge: 'bg-amber-100 text-amber-700 border-amber-300',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    label: 'Attention',
  },
  info: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    badge: 'bg-blue-100 text-blue-700 border-blue-300',
    icon: Info,
    iconColor: 'text-blue-600',
    label: 'Info',
  },
};

const ALERT_TYPE_ICONS: Record<string, typeof Bell> = {
  large_transaction: Banknote,
  debt_created: UserX,
  low_encours: TrendingDown,
  manual_entry_large: CreditCard,
  daily_threshold: Bell,
};

function AlertItem({
  alert,
  onMarkRead,
  onResolve,
  formatPrice,
}: {
  alert: CashAlert;
  onMarkRead: (id: number) => void;
  onResolve: (id: number) => void;
  formatPrice: (n: number) => string;
}) {
  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
  const SeverityIcon = config.icon;
  const TypeIcon = ALERT_TYPE_ICONS[alert.alert_type] || Bell;

  return (
    <div
      className={`p-3 rounded-xl border transition-all ${
        alert.is_read ? 'bg-muted/30 border-border/50 opacity-70' : config.bg
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`mt-0.5 ${alert.is_read ? 'text-muted-foreground' : config.iconColor}`}>
          <SeverityIcon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className={`text-sm font-semibold ${alert.is_read ? 'text-muted-foreground' : config.text}`}>
              {alert.title}
            </span>
            {!alert.is_read && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.badge}`}>
                {config.label}
              </Badge>
            )}
            {alert.is_resolved && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-300">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                Résolu
              </Badge>
            )}
          </div>
          <p className={`text-xs ${alert.is_read ? 'text-muted-foreground' : 'text-foreground/80'}`}>
            {alert.message}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            {alert.amount && (
              <span className="text-xs font-medium text-[hsl(195,50%,25%)]">
                {formatPrice(alert.amount)}
              </span>
            )}
            {alert.created_at && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(alert.created_at).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {!alert.is_read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onMarkRead(alert.id)}
              title="Marquer comme lu"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
          )}
          {!alert.is_resolved && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => onResolve(alert.id)}
              title="Résoudre"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CashAlertNotifications() {
  const { formatPrice } = useCountryTariff();
  const {
    alerts,
    stats,
    loading,
    newAlertDetected,
    markAsRead,
    resolveAlert,
    markAllRead,
    refresh,
  } = useCashAlerts(15000);

  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [showPanel, setShowPanel] = useState(true);

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'unread') return !a.is_read;
    if (filter === 'critical') return a.severity === 'critical' && !a.is_resolved;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(195,50%,25%)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bannière alerte temps réel */}
      {newAlertDetected && (
        <div className="animate-pulse bg-gradient-to-r from-red-500 to-amber-500 text-white rounded-xl p-3 flex items-center gap-3 shadow-lg">
          <BellRing className="w-5 h-5 animate-bounce" />
          <span className="text-sm font-medium">Nouvelle alerte de caisse détectée !</span>
        </div>
      )}

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-3">
        <Card className={`cursor-pointer transition-all ${filter === 'unread' ? 'ring-2 ring-[hsl(195,50%,25%)]' : ''}`}
          onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <EyeOff className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] text-muted-foreground">Non lues</span>
            </div>
            <p className="text-xl font-bold text-amber-700">{stats.unread}</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${filter === 'critical' ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')}>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
              <span className="text-[10px] text-muted-foreground">Critiques</span>
            </div>
            <p className="text-xl font-bold text-red-700">{stats.critical_unresolved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Bell className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[10px] text-muted-foreground">Aujourd'hui</span>
            </div>
            <p className="text-xl font-bold text-blue-700">{stats.today}</p>
          </CardContent>
        </Card>
      </div>

      {/* Panel alertes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-[hsl(195,50%,25%)]" />
              Alertes de caisse
              {stats.unread > 0 && (
                <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 ml-1">
                  {stats.unread}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              {stats.unread > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={markAllRead}>
                  Tout lire
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPanel(!showPanel)}>
                {showPanel ? <X className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {showPanel && (
          <CardContent>
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {filter === 'all'
                    ? 'Aucune alerte de caisse'
                    : filter === 'unread'
                    ? 'Toutes les alertes ont été lues'
                    : 'Aucune alerte critique non résolue'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredAlerts.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    onMarkRead={markAsRead}
                    onResolve={resolveAlert}
                    formatPrice={formatPrice}
                  />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}