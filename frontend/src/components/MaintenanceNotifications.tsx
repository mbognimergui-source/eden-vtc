import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import { Bell, Wrench, Clock, AlertTriangle, Calendar, Car, CheckCircle2, X } from 'lucide-react';

interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  vehicle_fleet_id: string;
  type: string;
  description: string;
  status: string;
  scheduled_date: string;
  completed_date?: string;
  cost: number;
  notes?: string;
  created_at?: string;
}

interface Vehicle {
  id: number;
  fleet_id: string;
  brand: string;
  model: string;
  license_plate: string;
  status: string;
}

interface Props {
  maintenanceRecords: MaintenanceRecord[];
  vehicles: Vehicle[];
  onCompleteMaintenance?: (recordId: number, vehicleId: string) => void;
}

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  routine: 'Révision',
  battery: 'Batterie',
  tires: 'Pneus',
  brakes: 'Freins',
  body: 'Carrosserie',
  other: 'Autre',
};

function getDaysUntil(dateStr: string): number {
  if (!dateStr) return Infinity;
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyLevel(daysUntil: number): 'critical' | 'warning' | 'info' {
  if (daysUntil <= 0) return 'critical';
  if (daysUntil <= 3) return 'warning';
  return 'info';
}

export default function MaintenanceNotifications({ maintenanceRecords, vehicles, onCompleteMaintenance }: Props) {
  const { formatPrice } = useCountryTariff();
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  // Filter only scheduled/in_progress maintenance (not completed)
  const activeMaintenances = maintenanceRecords
    .filter(m => m.status !== 'completed' && !dismissedIds.has(m.id))
    .sort((a, b) => {
      const daysA = getDaysUntil(a.scheduled_date);
      const daysB = getDaysUntil(b.scheduled_date);
      return daysA - daysB;
    });

  const criticalCount = activeMaintenances.filter(m => getDaysUntil(m.scheduled_date) <= 0).length;
  const warningCount = activeMaintenances.filter(m => {
    const d = getDaysUntil(m.scheduled_date);
    return d > 0 && d <= 3;
  }).length;

  const totalNotifications = activeMaintenances.length;

  const getVehicleInfo = (vehicleId: number) => {
    return vehicles.find(v => v.id === vehicleId);
  };

  const handleDismiss = (id: number) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="relative text-white hover:bg-white/10">
          <Bell className="w-4 h-4" />
          {totalNotifications > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
              criticalCount > 0 ? 'bg-red-500 text-white animate-pulse' :
              warningCount > 0 ? 'bg-amber-500 text-white' :
              'bg-blue-500 text-white'
            }`}>
              {totalNotifications}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications de maintenance
            {totalNotifications > 0 && (
              <Badge variant="secondary">{totalNotifications}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-2">
          {activeMaintenances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
              <p className="text-sm font-medium">Aucune maintenance en attente</p>
              <p className="text-xs text-muted-foreground mt-1">Tous les véhicules sont opérationnels</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Critical - overdue */}
              {criticalCount > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    En retard ({criticalCount})
                  </p>
                </div>
              )}

              {activeMaintenances.map((m) => {
                const daysUntil = getDaysUntil(m.scheduled_date);
                const urgency = getUrgencyLevel(daysUntil);
                const vehicle = getVehicleInfo(m.vehicle_id);

                return (
                  <Card key={m.id} className={`relative overflow-hidden border-l-4 ${
                    urgency === 'critical' ? 'border-l-red-500 bg-red-50/50' :
                    urgency === 'warning' ? 'border-l-amber-500 bg-amber-50/50' :
                    'border-l-blue-500 bg-blue-50/30'
                  }`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 flex-1">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            urgency === 'critical' ? 'bg-red-100' :
                            urgency === 'warning' ? 'bg-amber-100' :
                            'bg-blue-100'
                          }`}>
                            {urgency === 'critical' ? <AlertTriangle className="w-4 h-4 text-red-600" /> :
                             urgency === 'warning' ? <Clock className="w-4 h-4 text-amber-600" /> :
                             <Calendar className="w-4 h-4 text-blue-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold">
                                {MAINTENANCE_TYPE_LABELS[m.type] || m.type}
                              </span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                urgency === 'critical' ? 'border-red-300 text-red-700' :
                                urgency === 'warning' ? 'border-amber-300 text-amber-700' :
                                'border-blue-300 text-blue-700'
                              }`}>
                                {daysUntil < 0 ? `${Math.abs(daysUntil)}j en retard` :
                                 daysUntil === 0 ? "Aujourd'hui" :
                                 daysUntil === 1 ? 'Demain' :
                                 `Dans ${daysUntil}j`}
                              </Badge>
                            </div>

                            {/* Vehicle info */}
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                              <Car className="w-3 h-3" />
                              <span className="font-medium">{m.vehicle_fleet_id || vehicle?.fleet_id || '-'}</span>
                              {vehicle && <span>· {vehicle.brand} {vehicle.model}</span>}
                            </div>

                            {/* Description */}
                            {m.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</p>
                            )}

                            {/* Meta */}
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {m.scheduled_date}
                              </span>
                              {m.cost > 0 && (
                                <span className="font-medium">{formatPrice(m.cost)}</span>
                              )}
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {m.status === 'in_progress' ? 'En cours' : 'Planifiée'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => handleDismiss(m.id)}
                            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                            title="Masquer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          {onCompleteMaintenance && (
                            <button
                              onClick={() => onCompleteMaintenance(m.id, String(m.vehicle_id))}
                              className="p-1 hover:bg-green-100 rounded text-green-600"
                              title="Marquer comme terminée"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}