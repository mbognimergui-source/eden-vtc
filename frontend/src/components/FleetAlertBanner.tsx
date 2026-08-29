import { useState, useEffect, useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { client } from '@/lib/client';
import { useCountryTariff } from '@/hooks/useCountryTariff';

interface AlertStatus {
  alert_active: boolean;
  fleet_avg_daily_revenue: number;
  daily_target: number;
  alert_threshold: number;
  window_days: number;
  vehicle_count: number;
  below_threshold_count: number;
}

/**
 * Bannière officielle de la « règle des -15 % » : recette moyenne/véhicule
 * calculée en glissant sur `window_days` (90 par défaut) côté serveur —
 * indépendante du sélecteur de période du tableau de bord, dont les KPI
 * couvrent une fenêtre différente (jour/semaine/mois...).
 */
export default function FleetAlertBanner() {
  const { formatPrice } = useCountryTariff();
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/fleet-kpi/alert-status', method: 'GET' });
      if (res?.data) setStatus(res.data);
    } catch (err) {
      console.error('Error loading fleet alert status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Vérification de la règle -15 %…
      </div>
    );
  }

  if (!status || !status.alert_active) return null;

  return (
    <Alert className="border-red-200 bg-red-50">
      <AlertTriangle className="w-5 h-5 text-red-600" />
      <AlertTitle className="text-red-800 font-semibold">⚠️ Alerte performance flotte (règle -15 %)</AlertTitle>
      <AlertDescription className="text-red-700">
        Recette moyenne/véhicule/jour sur les {status.window_days} derniers jours : {formatPrice(status.fleet_avg_daily_revenue)}
        {' '}— inférieure au seuil d'alerte ({formatPrice(status.alert_threshold)}, soit -15 % de l'objectif {formatPrice(status.daily_target)}).
        {' '}{status.below_threshold_count} véhicule(s) sur {status.vehicle_count} en dessous du seuil.
      </AlertDescription>
    </Alert>
  );
}
