import { useState } from 'react';
import { useSecurityAlerts, SecurityAlert } from '@/hooks/useSecurityAlerts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Bell,
  BellRing,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Eye,
  EyeOff,
  Activity,
  Globe,
  FileWarning,
  Zap,
} from 'lucide-react';
import { getLang, type Lang } from '@/lib/i18n';

const ALERT_TYPE_LABELS: Record<string, { fr: string; en: string; icon: React.ElementType }> = {
  brute_force: { fr: 'Force brute', en: 'Brute Force', icon: Zap },
  xss_attempt: { fr: 'Tentative XSS', en: 'XSS Attempt', icon: FileWarning },
  sql_injection: { fr: 'Injection SQL', en: 'SQL Injection', icon: AlertTriangle },
  path_traversal: { fr: 'Traversée de chemin', en: 'Path Traversal', icon: Globe },
  template_injection: { fr: 'Injection de template', en: 'Template Injection', icon: FileWarning },
  file_inclusion: { fr: 'Inclusion de fichier', en: 'File Inclusion', icon: FileWarning },
  command_injection: { fr: 'Injection de commande', en: 'Command Injection', icon: AlertTriangle },
  rate_limit_exceeded: { fr: 'Limite de requêtes', en: 'Rate Limit Exceeded', icon: Activity },
  suspicious_request: { fr: 'Requête suspecte', en: 'Suspicious Request', icon: ShieldAlert },
  file_upload_violation: { fr: 'Upload non autorisé', en: 'File Upload Violation', icon: FileWarning },
  unauthorized_access: { fr: 'Accès non autorisé', en: 'Unauthorized Access', icon: XCircle },
};

const SEVERITY_CONFIG = {
  critical: {
    color: 'bg-red-500/10 text-red-600 border-red-500/30',
    badge: 'bg-red-500 text-white',
    pulse: 'animate-pulse',
    label: { fr: 'Critique', en: 'Critical' },
  },
  high: {
    color: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
    badge: 'bg-orange-500 text-white',
    pulse: '',
    label: { fr: 'Élevé', en: 'High' },
  },
  medium: {
    color: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
    badge: 'bg-yellow-500 text-white',
    pulse: '',
    label: { fr: 'Moyen', en: 'Medium' },
  },
  low: {
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    badge: 'bg-blue-500 text-white',
    pulse: '',
    label: { fr: 'Faible', en: 'Low' },
  },
};

function formatTimeAgo(dateStr: string, lang: 'fr' | 'en'): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return lang === 'fr' ? 'À l\'instant' : 'Just now';
  if (minutes < 60) return lang === 'fr' ? `Il y a ${minutes}min` : `${minutes}m ago`;
  if (hours < 24) return lang === 'fr' ? `Il y a ${hours}h` : `${hours}h ago`;
  return lang === 'fr' ? `Il y a ${days}j` : `${days}d ago`;
}

function AlertItem({
  alert,
  lang,
  onResolve,
}: {
  alert: SecurityAlert;
  lang: 'fr' | 'en';
  onResolve: (id: number) => void;
}) {
  const typeInfo = ALERT_TYPE_LABELS[alert.alert_type] || {
    fr: alert.alert_type,
    en: alert.alert_type,
    icon: ShieldAlert,
  };
  const severity = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium;
  const IconComponent = typeInfo.icon;

  return (
    <div
      className={`p-3 rounded-lg border ${severity.color} ${severity.pulse} transition-all hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="mt-0.5">
            <IconComponent className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">
                {lang === 'fr' ? typeInfo.fr : typeInfo.en}
              </span>
              <Badge className={`text-[10px] px-1.5 py-0 ${severity.badge}`}>
                {lang === 'fr' ? severity.label.fr : severity.label.en}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {alert.description}
            </p>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
              {alert.source_ip && (
                <span className="flex items-center gap-0.5">
                  <Globe className="h-3 w-3" />
                  {alert.source_ip}
                </span>
              )}
              {alert.target_path && (
                <span className="font-mono truncate max-w-[120px]">
                  {alert.target_path}
                </span>
              )}
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {formatTimeAgo(alert.created_at, lang)}
              </span>
            </div>
          </div>
        </div>
        {!alert.is_resolved && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => onResolve(alert.id)}
            title={lang === 'fr' ? 'Marquer comme résolu' : 'Mark as resolved'}
          >
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
          </Button>
        )}
        {alert.is_resolved && (
          <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 shrink-0">
            <CheckCircle className="h-3 w-3 mr-0.5" />
            {lang === 'fr' ? 'Résolu' : 'Resolved'}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function SecurityNotifications() {
  const lang: Lang = getLang();
  const {
    alerts,
    stats,
    loading,
    unreadCount,
    newAlerts,
    resolveAlert,
    dismissNewAlerts,
    refresh,
  } = useSecurityAlerts();

  const [showResolved, setShowResolved] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const handleResolve = async (id: number) => {
    try {
      await resolveAlert(id, 'admin');
    } catch {
      // Error handled in hook
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (!showResolved && a.is_resolved) return false;
    if (filter === 'all') return true;
    if (filter === 'critical') return a.severity === 'critical';
    if (filter === 'high') return a.severity === 'high';
    if (filter === 'unresolved') return !a.is_resolved;
    return a.alert_type === filter;
  });

  return (
    <div className="space-y-4">
      {/* New Alerts Banner */}
      {newAlerts.length > 0 && (
        <Card className="border-red-500/50 bg-red-50 dark:bg-red-950/20 animate-pulse">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellRing className="h-5 w-5 text-red-600 animate-bounce" />
                <span className="font-semibold text-red-700">
                  {lang === 'fr'
                    ? `${newAlerts.length} nouvelle(s) alerte(s) de sécurité !`
                    : `${newAlerts.length} new security alert(s)!`}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={dismissNewAlerts}>
                {lang === 'fr' ? 'Marquer comme lues' : 'Mark as read'}
              </Button>
            </div>
            <div className="mt-2 space-y-1">
              {newAlerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className="text-sm text-red-600">
                  • {alert.description}
                </div>
              ))}
              {newAlerts.length > 3 && (
                <div className="text-xs text-red-500">
                  {lang === 'fr'
                    ? `+ ${newAlerts.length - 3} autre(s)...`
                    : `+ ${newAlerts.length - 3} more...`}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-red-200">
          <CardContent className="p-3 text-center">
            <ShieldAlert className="h-5 w-5 mx-auto text-red-500 mb-1" />
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
            <div className="text-[10px] text-muted-foreground uppercase">
              {lang === 'fr' ? 'Critiques' : 'Critical'}
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="p-3 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-orange-500 mb-1" />
            <div className="text-2xl font-bold text-orange-600">{stats.high}</div>
            <div className="text-[10px] text-muted-foreground uppercase">
              {lang === 'fr' ? 'Élevées' : 'High'}
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200">
          <CardContent className="p-3 text-center">
            <Bell className="h-5 w-5 mx-auto text-yellow-600 mb-1" />
            <div className="text-2xl font-bold text-yellow-700">{stats.unresolved}</div>
            <div className="text-[10px] text-muted-foreground uppercase">
              {lang === 'fr' ? 'Non résolues' : 'Unresolved'}
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-3 text-center">
            <ShieldCheck className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <div className="text-2xl font-bold text-green-600">{stats.last24h}</div>
            <div className="text-[10px] text-muted-foreground uppercase">
              {lang === 'fr' ? 'Dernières 24h' : 'Last 24h'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#1F4E5F]" />
              {lang === 'fr' ? 'Journal des alertes' : 'Alert Log'}
              {unreadCount > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-1">
                  {unreadCount}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResolved(!showResolved)}
                className="text-xs"
              >
                {showResolved ? (
                  <EyeOff className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Eye className="h-3.5 w-3.5 mr-1" />
                )}
                {showResolved
                  ? lang === 'fr' ? 'Masquer résolues' : 'Hide resolved'
                  : lang === 'fr' ? 'Voir résolues' : 'Show resolved'}
              </Button>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
                {lang === 'fr' ? 'Actualiser' : 'Refresh'}
              </Button>
            </div>
          </div>
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[
              { key: 'all', label: { fr: 'Toutes', en: 'All' } },
              { key: 'critical', label: { fr: 'Critiques', en: 'Critical' } },
              { key: 'high', label: { fr: 'Élevées', en: 'High' } },
              { key: 'unresolved', label: { fr: 'Non résolues', en: 'Unresolved' } },
              { key: 'xss_attempt', label: { fr: 'XSS', en: 'XSS' } },
              { key: 'sql_injection', label: { fr: 'SQL Inj.', en: 'SQL Inj.' } },
              { key: 'rate_limit_exceeded', label: { fr: 'Rate Limit', en: 'Rate Limit' } },
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
        </CardHeader>
        <CardContent className="pt-0">
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              {lang === 'fr' ? 'Chargement...' : 'Loading...'}
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 text-green-400 mb-2" />
              <p className="text-sm font-medium">
                {lang === 'fr' ? 'Aucune alerte détectée' : 'No alerts detected'}
              </p>
              <p className="text-xs mt-1">
                {lang === 'fr'
                  ? 'Votre application est sécurisée'
                  : 'Your application is secure'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-2">
              <div className="space-y-2">
                {filteredAlerts.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    lang={lang}
                    onResolve={handleResolve}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}