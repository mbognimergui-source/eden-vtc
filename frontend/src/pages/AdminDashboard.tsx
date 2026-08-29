import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { client } from '@/lib/client';
import { t } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import {
  ArrowLeft, Car, Users, TrendingUp, Zap, AlertTriangle, Download,
  MapPin, Battery, Plus, Wrench, Calendar, BarChart3, UserPlus, CarFront,
  Activity, RefreshCw, ChevronDown, ChevronRight, History, CheckCircle2, Clock, Shield, Sparkles, Lock, Wallet,
} from 'lucide-react';
import MaintenanceNotifications from '@/components/MaintenanceNotifications';
import AccessManagement from '@/components/AccessManagement';
import AIImageGenerator from '@/components/AIImageGenerator';
import SecurityPanel from '@/components/SecurityPanel';
import SecurityNotifications from '@/components/SecurityNotifications';
import CashRegisterPanel from '@/components/CashRegisterPanel';
import FleetAlertBanner from '@/components/FleetAlertBanner';
import PayrollPanel from '@/components/PayrollPanel';

type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Journalier',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  semiannual: 'Semestriel',
  annual: 'Annuel',
};

function getPeriodDays(period: Period): number {
  switch (period) {
    case 'daily': return 1;
    case 'weekly': return 7;
    case 'monthly': return 30;
    case 'quarterly': return 90;
    case 'semiannual': return 180;
    case 'annual': return 365;
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { formatPrice, tariff } = useCountryTariff();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [rides, setRides] = useState<any[]>([]);
  const [recharges, setRecharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('daily');
  const [activeTab, setActiveTab] = useState('dashboard');

  // Create driver form
  const [showCreateDriver, setShowCreateDriver] = useState(false);
  const [newDriver, setNewDriver] = useState({
    first_name: '', last_name: '', phone: '', email: '', license_number: '',
    status: 'offline', rating: 5.0, total_rides: 0, daily_earnings: 0,
    employee_id: '', employment_type: 'salaried', monthly_base_salary: 150000,
  });

  // Create vehicle form
  const [showCreateVehicle, setShowCreateVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    fleet_id: '', brand: '', model: '', license_plate: '', year: 2024,
    battery_level: 100, km_counter: 0, status: 'available', color: '',
  });

  // Maintenance form
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [maintenanceData, setMaintenanceData] = useState({
    vehicle_id: '', type: 'routine', description: '', scheduled_date: '', cost: 0,
  });

  // Maintenance records
  const [maintenanceRecords, setMaintenanceRecords] = useState<any[]>([]);
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);

  const dailyTarget = 30000;
  const alertThreshold = 0.85;

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [vRes, dRes, rRes, rcRes, mRes] = await Promise.all([
        client.entities.vehicles.query({ query: {}, limit: 200 }),
        client.entities.drivers.query({ query: {}, limit: 200 }),
        client.entities.rides.query({ query: {}, sort: '-created_at', limit: 500 }),
        client.entities.recharges.query({ query: {}, sort: '-created_at', limit: 200 }),
        client.entities.maintenance_records.query({ query: {}, sort: '-created_at', limit: 500 }),
      ]);
      if (vRes?.data?.items) setVehicles(vRes.data.items);
      if (dRes?.data?.items) setDrivers(dRes.data.items);
      if (rRes?.data?.items) setRides(rRes.data.items);
      if (rcRes?.data?.items) setRecharges(rcRes.data.items);
      if (mRes?.data?.items) setMaintenanceRecords(mRes.data.items);
    } catch (e) {
      console.error('Failed to load admin data', e);
    }
    setLoading(false);
  };

  // Filter rides by period
  const filteredRides = useMemo(() => {
    const days = getPeriodDays(period);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return rides.filter(r => {
      if (!r.created_at) return false;
      return new Date(r.created_at) >= cutoff;
    });
  }, [rides, period]);

  const filteredRecharges = useMemo(() => {
    const days = getPeriodDays(period);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return recharges.filter(r => {
      const d = r.date || r.created_at;
      if (!d) return false;
      return new Date(d) >= cutoff;
    });
  }, [recharges, period]);

  // KPIs
  const completedRides = filteredRides.filter(r => r.status === 'completed');
  const totalRevenue = completedRides.reduce((sum, r) => sum + (r.final_price || r.estimated_price || 0), 0);
  const totalRidesCount = filteredRides.length;
  const cancelledRides = filteredRides.filter(r => r.status === 'cancelled').length;
  const cancelRate = totalRidesCount > 0 ? Math.round((cancelledRides / totalRidesCount) * 100) : 0;
  const avgRidePrice = completedRides.length > 0 ? Math.round(totalRevenue / completedRides.length) : 0;
  const totalDistance = completedRides.reduce((sum, r) => sum + (r.distance_km || 0), 0);
  const totalCO2 = completedRides.reduce((sum, r) => sum + (r.co2_saved || 0), 0);
  const availableVehicles = vehicles.filter(v => v.status === 'available').length;
  const totalVehicles = vehicles.length;
  const fleetAvailability = totalVehicles > 0 ? Math.round((availableVehicles / totalVehicles) * 100) : 0;
  const totalEnergyCost = filteredRecharges.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const totalKwh = filteredRecharges.reduce((sum, r) => sum + (r.kwh || 0), 0);
  const periodDays = getPeriodDays(period);
  const avgRevenuePerDay = periodDays > 0 ? Math.round(totalRevenue / periodDays) : 0;
  const avgRevenuePerVehicle = totalVehicles > 0 ? Math.round(avgRevenuePerDay / totalVehicles) : 0;
  const isAlertActive = avgRevenuePerVehicle < dailyTarget * alertThreshold;

  // Revenue by payment method
  const revenueByMethod = useMemo(() => {
    const methods: Record<string, number> = { wallet: 0, cash: 0, orange_money: 0, mtn_momo: 0 };
    completedRides.forEach(r => {
      const method = r.payment_method || 'wallet';
      methods[method] = (methods[method] || 0) + (r.final_price || r.estimated_price || 0);
    });
    return methods;
  }, [completedRides]);

  // Create driver
  const handleCreateDriver = async () => {
    try {
      await client.entities.drivers.create({ data: newDriver });
      toast({ title: 'Chauffeur créé avec succès !' });
      setShowCreateDriver(false);
      setNewDriver({ first_name: '', last_name: '', phone: '', email: '', license_number: '', status: 'offline', rating: 5.0, total_rides: 0, daily_earnings: 0, employee_id: '', employment_type: 'salaried', monthly_base_salary: 150000 });
      loadAllData();
    } catch (e: any) {
      toast({ title: e?.message || 'Erreur lors de la création', variant: 'destructive' });
    }
  };

  // Create vehicle
  const handleCreateVehicle = async () => {
    try {
      await client.entities.vehicles.create({ data: newVehicle });
      toast({ title: 'Véhicule créé avec succès !' });
      setShowCreateVehicle(false);
      setNewVehicle({ fleet_id: '', brand: '', model: '', license_plate: '', year: 2024, battery_level: 100, km_counter: 0, status: 'available', color: '' });
      loadAllData();
    } catch (e: any) {
      toast({ title: e?.message || 'Erreur lors de la création', variant: 'destructive' });
    }
  };

  // Set vehicle maintenance
  const handleSetMaintenance = async () => {
    try {
      if (maintenanceData.vehicle_id) {
        const vehicle = vehicles.find(v => String(v.id) === maintenanceData.vehicle_id);
        // Create maintenance record
        await client.entities.maintenance_records.create({
          data: {
            vehicle_id: parseInt(maintenanceData.vehicle_id),
            vehicle_fleet_id: vehicle?.fleet_id || '',
            type: maintenanceData.type,
            description: maintenanceData.description,
            status: 'scheduled',
            scheduled_date: maintenanceData.scheduled_date || new Date().toISOString().split('T')[0],
            cost: maintenanceData.cost || 0,
          },
        });
        // Update vehicle status
        await client.entities.vehicles.update({
          id: maintenanceData.vehicle_id,
          data: { status: 'maintenance' },
        });
        toast({ title: 'Maintenance planifiée et véhicule mis en maintenance !' });
        setShowMaintenance(false);
        setMaintenanceData({ vehicle_id: '', type: 'routine', description: '', scheduled_date: '', cost: 0 });
        loadAllData();
      }
    } catch (e: any) {
      toast({ title: e?.message || 'Erreur', variant: 'destructive' });
    }
  };

  // Complete maintenance
  const handleCompleteMaintenance = async (recordId: number, vehicleId: string) => {
    try {
      await client.entities.maintenance_records.update({
        id: recordId,
        data: { status: 'completed', completed_date: new Date().toISOString().split('T')[0] },
      });
      await client.entities.vehicles.update({
        id: vehicleId,
        data: { status: 'available' },
      });
      toast({ title: 'Maintenance terminée, véhicule remis en service !' });
      loadAllData();
    } catch (e: any) {
      toast({ title: e?.message || 'Erreur', variant: 'destructive' });
    }
  };

  // Get maintenance records for a specific vehicle
  const getVehicleMaintenanceRecords = (vehicleId: number) => {
    return maintenanceRecords.filter(m => m.vehicle_id === vehicleId);
  };

  const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
    routine: 'Révision',
    battery: 'Batterie',
    tires: 'Pneus',
    brakes: 'Freins',
    body: 'Carrosserie',
    other: 'Autre',
  };

  // Export CSV
  const exportCSV = () => {
    const headers = ['Période', 'Nb courses', 'Courses complétées', 'Courses annulées', 'Taux annulation', 'Espèces', 'Orange Money', 'MTN MoMo', 'Plateforme', 'Total recettes', 'Distance totale (km)', 'CO₂ évité (g)', 'kWh consommés', 'Coût énergie', 'Recette moy/jour', 'Recette moy/véhicule/jour'];
    const row = [
      PERIOD_LABELS[period],
      totalRidesCount,
      completedRides.length,
      cancelledRides,
      `${cancelRate}%`,
      revenueByMethod.cash || 0,
      revenueByMethod.orange_money || 0,
      revenueByMethod.mtn_momo || 0,
      revenueByMethod.wallet || 0,
      totalRevenue,
      Math.round(totalDistance),
      totalCO2,
      totalKwh,
      totalEnergyCost,
      avgRevenuePerDay,
      avgRevenuePerVehicle,
    ];
    const detailHeaders = ['Date', 'Départ', 'Destination', 'Distance (km)', 'Prix', 'Méthode paiement', 'Statut'];
    const detailRows = filteredRides.map(r => [
      r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '',
      r.pickup_address || '',
      r.destination_address || '',
      r.distance_km || '',
      r.final_price || r.estimated_price || 0,
      r.payment_method || '',
      r.status || '',
    ]);
    const csv = [
      `EDEN VTC - Rapport ${PERIOD_LABELS[period]}`,
      `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
      '',
      'RÉSUMÉ',
      headers.join(';'),
      row.join(';'),
      '',
      'DÉTAIL DES COURSES',
      detailHeaders.join(';'),
      ...detailRows.map(r => r.join(';')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_eden_vtc_${period}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[hsl(195,50%,25%)] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Administration EDEN VTC</h1>
          </div>
          <div className="flex items-center gap-2">
            <MaintenanceNotifications
              maintenanceRecords={maintenanceRecords}
              vehicles={vehicles}
              onCompleteMaintenance={handleCompleteMaintenance}
            />
            <Button variant="ghost" size="sm" onClick={loadAllData} className="text-white hover:bg-white/10">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={exportCSV} className="text-white hover:bg-white/10">
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Period Selector */}
        <Card className="border-[hsl(45,65%,47%)]/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[hsl(195,50%,25%)]" />
                <span className="text-sm font-medium">Période :</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={period === p ? 'default' : 'outline'}
                    className={period === p ? 'bg-[hsl(195,50%,25%)] text-white' : ''}
                    onClick={() => setPeriod(p)}
                  >
                    {PERIOD_LABELS[p]}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerte officielle règle -15 % (recette moyenne/véhicule glissante sur 90j, calculée côté serveur) */}
        <FleetAlertBanner />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-[hsl(195,50%,25%)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[hsl(195,50%,25%)]/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[hsl(195,50%,25%)]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recettes ({PERIOD_LABELS[period]})</p>
                  <p className="text-lg font-bold">{formatPrice(totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">{formatPrice(avgRevenuePerDay)}/jour</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[hsl(45,65%,47%)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[hsl(45,65%,47%)]/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-[hsl(45,65%,47%)]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Courses</p>
                  <p className="text-lg font-bold">{totalRidesCount}</p>
                  <p className="text-xs text-muted-foreground">{completedRides.length} complétées · {cancelRate}% annulées</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Car className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Flotte</p>
                  <p className="text-lg font-bold">{availableVehicles}/{totalVehicles}</p>
                  <p className="text-xs text-muted-foreground">Disponibilité {fleetAvailability}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Énergie</p>
                  <p className="text-lg font-bold">{formatPrice(totalEnergyCost)}</p>
                  <p className="text-xs text-muted-foreground">{totalKwh} kWh · {Math.round(totalDistance)} km</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Répartition des recettes — {PERIOD_LABELS[period]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-muted-foreground">Portefeuille</p>
                <p className="text-lg font-bold text-blue-700">{formatPrice(revenueByMethod.wallet)}</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-muted-foreground">Espèces</p>
                <p className="text-lg font-bold text-green-700">{formatPrice(revenueByMethod.cash)}</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <p className="text-xs text-muted-foreground">Orange Money</p>
                <p className="text-lg font-bold text-orange-700">{formatPrice(revenueByMethod.orange_money)}</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <p className="text-xs text-muted-foreground">MTN MoMo</p>
                <p className="text-lg font-bold text-yellow-700">{formatPrice(revenueByMethod.mtn_momo)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <p className="text-muted-foreground">Prix moyen/course</p>
                <p className="font-semibold">{formatPrice(avgRidePrice)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">CO₂ évité</p>
                <p className="font-semibold text-green-600">{(totalCO2 / 1000).toFixed(1)} kg</p>
              </div>
              <div>
                <p className="text-muted-foreground">Recette/véhicule/jour</p>
                <p className={`font-semibold ${isAlertActive ? 'text-red-600' : 'text-green-600'}`}>
                  {formatPrice(avgRevenuePerVehicle)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fleet Availability */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Disponibilité flotte (objectif ≥ 95%)</span>
              <Badge className={fleetAvailability >= 95 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                {fleetAvailability}%
              </Badge>
            </div>
            <Progress value={fleetAvailability} className="h-2" />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Dialog open={showCreateDriver} onOpenChange={setShowCreateDriver}>
            <DialogTrigger asChild>
              <Button className="bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white gap-2">
                <UserPlus className="w-4 h-4" />
                Créer un chauffeur
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Nouveau chauffeur
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Prénom</Label>
                    <Input value={newDriver.first_name} onChange={(e) => setNewDriver({ ...newDriver, first_name: e.target.value })} placeholder="Jean" />
                  </div>
                  <div>
                    <Label>Nom</Label>
                    <Input value={newDriver.last_name} onChange={(e) => setNewDriver({ ...newDriver, last_name: e.target.value })} placeholder="Dupont" />
                  </div>
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input value={newDriver.phone} onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })} placeholder="+237 6XX XXX XXX" type="tel" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={newDriver.email} onChange={(e) => setNewDriver({ ...newDriver, email: e.target.value })} placeholder="chauffeur@eden-vtc.cm" type="email" />
                </div>
                <div>
                  <Label>N° Permis de conduire</Label>
                  <Input value={newDriver.license_number} onChange={(e) => setNewDriver({ ...newDriver, license_number: e.target.value })} placeholder="DLA-XXXXX" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Matricule employé</Label>
                    <Input value={newDriver.employee_id} onChange={(e) => setNewDriver({ ...newDriver, employee_id: e.target.value })} placeholder="EDEN-CH-001" />
                  </div>
                  <div>
                    <Label>Salaire mensuel de base (FCFA)</Label>
                    <Input
                      type="number"
                      value={newDriver.monthly_base_salary}
                      onChange={(e) => setNewDriver({ ...newDriver, monthly_base_salary: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <Button onClick={handleCreateDriver} className="w-full bg-[hsl(195,50%,25%)] text-white" disabled={!newDriver.first_name || !newDriver.last_name || !newDriver.phone}>
                  Créer le chauffeur
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showCreateVehicle} onOpenChange={setShowCreateVehicle}>
            <DialogTrigger asChild>
              <Button className="bg-[hsl(45,65%,47%)] hover:bg-[hsl(45,65%,52%)] text-[hsl(195,50%,10%)] gap-2">
                <CarFront className="w-4 h-4" />
                Ajouter un véhicule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CarFront className="w-5 h-5" />
                  Nouveau véhicule
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ID Flotte</Label>
                    <Input value={newVehicle.fleet_id} onChange={(e) => setNewVehicle({ ...newVehicle, fleet_id: e.target.value })} placeholder="EDEN-006" />
                  </div>
                  <div>
                    <Label>Plaque</Label>
                    <Input value={newVehicle.license_plate} onChange={(e) => setNewVehicle({ ...newVehicle, license_plate: e.target.value })} placeholder="LT-XXXX-DLA" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Marque</Label>
                    <Input value={newVehicle.brand} onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })} placeholder="Tesla" />
                  </div>
                  <div>
                    <Label>Modèle</Label>
                    <Input value={newVehicle.model} onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })} placeholder="Model 3" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Année</Label>
                    <Input value={newVehicle.year} onChange={(e) => setNewVehicle({ ...newVehicle, year: parseInt(e.target.value) || 2024 })} type="number" />
                  </div>
                  <div>
                    <Label>Couleur</Label>
                    <Input value={newVehicle.color} onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })} placeholder="Blanc" />
                  </div>
                  <div>
                    <Label>Km compteur</Label>
                    <Input value={newVehicle.km_counter} onChange={(e) => setNewVehicle({ ...newVehicle, km_counter: parseInt(e.target.value) || 0 })} type="number" />
                  </div>
                </div>
                <Button onClick={handleCreateVehicle} className="w-full bg-[hsl(45,65%,47%)] text-[hsl(195,50%,10%)]" disabled={!newVehicle.fleet_id || !newVehicle.license_plate || !newVehicle.brand}>
                  Ajouter le véhicule
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showMaintenance} onOpenChange={setShowMaintenance}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Wrench className="w-4 h-4" />
                Maintenance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Planifier une maintenance
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Véhicule</Label>
                  <Select value={maintenanceData.vehicle_id} onValueChange={(v) => setMaintenanceData({ ...maintenanceData, vehicle_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un véhicule" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.fleet_id} — {v.brand} {v.model} ({v.license_plate})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type de maintenance</Label>
                  <Select value={maintenanceData.type} onValueChange={(v) => setMaintenanceData({ ...maintenanceData, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="routine">Routine (révision)</SelectItem>
                      <SelectItem value="battery">Batterie</SelectItem>
                      <SelectItem value="tires">Pneus</SelectItem>
                      <SelectItem value="brakes">Freins</SelectItem>
                      <SelectItem value="body">Carrosserie</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={maintenanceData.description} onChange={(e) => setMaintenanceData({ ...maintenanceData, description: e.target.value })} placeholder="Détails de la maintenance..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Date prévue</Label>
                    <Input type="date" value={maintenanceData.scheduled_date} onChange={(e) => setMaintenanceData({ ...maintenanceData, scheduled_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Coût estimé (FCFA)</Label>
                    <Input type="number" value={maintenanceData.cost} onChange={(e) => setMaintenanceData({ ...maintenanceData, cost: parseInt(e.target.value) || 0 })} placeholder="0" />
                  </div>
                </div>
                <Button onClick={handleSetMaintenance} className="w-full bg-amber-500 hover:bg-amber-600 text-white" disabled={!maintenanceData.vehicle_id}>
                  Mettre en maintenance
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabs: Vehicles, Drivers, Rides, Recharges */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-9 w-full">
            <TabsTrigger value="dashboard" className="gap-1">
              <BarChart3 className="w-3.5 h-3.5 hidden sm:inline" />
              TDB
            </TabsTrigger>
            <TabsTrigger value="caisse" className="gap-1">
              <Wallet className="w-3.5 h-3.5 hidden sm:inline" />
              Caisse
            </TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1">
              <Users className="w-3.5 h-3.5 hidden sm:inline" />
              Paie
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-1">
              <Car className="w-3.5 h-3.5 hidden sm:inline" />
              Véhicules
            </TabsTrigger>
            <TabsTrigger value="drivers" className="gap-1">
              <Users className="w-3.5 h-3.5 hidden sm:inline" />
              Chauffeurs
            </TabsTrigger>
            <TabsTrigger value="rides" className="gap-1">
              <MapPin className="w-3.5 h-3.5 hidden sm:inline" />
              Courses
            </TabsTrigger>
            <TabsTrigger value="access" className="gap-1">
              <Shield className="w-3.5 h-3.5 hidden sm:inline" />
              Accès
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1">
              <Lock className="w-3.5 h-3.5 hidden sm:inline" />
              Sécurité
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-1">
              <Sparkles className="w-3.5 h-3.5 hidden sm:inline" />
              Images IA
            </TabsTrigger>
          </TabsList>

          {/* Caisse Centralisée Tab */}
          <TabsContent value="caisse" className="mt-4">
            <CashRegisterPanel />
          </TabsContent>

          {/* Paie Chauffeurs Salariés Tab */}
          <TabsContent value="payroll" className="mt-4">
            <PayrollPanel drivers={drivers} />
          </TabsContent>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Résumé — {PERIOD_LABELS[period]}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Indicateur</TableHead>
                        <TableHead className="text-right">Valeur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Nombre de courses</TableCell>
                        <TableCell className="text-right font-medium">{totalRidesCount}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Courses complétées</TableCell>
                        <TableCell className="text-right font-medium">{completedRides.length}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Taux d'annulation</TableCell>
                        <TableCell className="text-right font-medium">{cancelRate}%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Recettes totales</TableCell>
                        <TableCell className="text-right font-bold text-[hsl(195,50%,25%)]">{formatPrice(totalRevenue)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Recette moyenne/jour</TableCell>
                        <TableCell className="text-right font-medium">{formatPrice(avgRevenuePerDay)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Recette moy./véhicule/jour</TableCell>
                        <TableCell className={`text-right font-medium ${isAlertActive ? 'text-red-600' : ''}`}>{formatPrice(avgRevenuePerVehicle)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Prix moyen/course</TableCell>
                        <TableCell className="text-right font-medium">{formatPrice(avgRidePrice)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Distance totale parcourue</TableCell>
                        <TableCell className="text-right font-medium">{Math.round(totalDistance)} km</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>CO₂ évité</TableCell>
                        <TableCell className="text-right font-medium text-green-600">{(totalCO2 / 1000).toFixed(1)} kg</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Énergie consommée</TableCell>
                        <TableCell className="text-right font-medium">{totalKwh} kWh</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Coût énergie</TableCell>
                        <TableCell className="text-right font-medium">{formatPrice(totalEnergyCost)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Véhicules disponibles</TableCell>
                        <TableCell className="text-right font-medium">{availableVehicles}/{totalVehicles}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Chauffeurs actifs</TableCell>
                        <TableCell className="text-right font-medium">{drivers.filter(d => d.status === 'online' || d.status === 'on_ride').length}/{drivers.length}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vehicles Tab */}
          <TabsContent value="vehicles" className="mt-4 space-y-3">
            {vehicles.map((v) => {
              const vRecords = getVehicleMaintenanceRecords(v.id);
              const isExpanded = expandedVehicle === String(v.id);
              return (
                <Card key={v.id} className="overflow-hidden">
                  <Collapsible open={isExpanded} onOpenChange={() => setExpandedVehicle(isExpanded ? null : String(v.id))}>
                    <CollapsibleTrigger asChild>
                      <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">{v.fleet_id}</span>
                                <span className="text-sm text-muted-foreground">{v.brand} {v.model}</span>
                                <Badge className={
                                  v.status === 'available' ? 'bg-green-100 text-green-800' :
                                  v.status === 'in_use' ? 'bg-blue-100 text-blue-800' :
                                  v.status === 'maintenance' ? 'bg-amber-100 text-amber-800' :
                                  'bg-gray-100 text-gray-800'
                                }>
                                  {v.status === 'available' ? 'Disponible' :
                                   v.status === 'in_use' ? 'En course' :
                                   v.status === 'maintenance' ? 'Maintenance' : 'Hors ligne'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                <span>{v.license_plate}</span>
                                <span className="flex items-center gap-1"><Battery className="w-3 h-3" /> {v.battery_level}%</span>
                                <span>{v.km_counter?.toLocaleString()} km</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs gap-1">
                              <History className="w-3 h-3" />
                              {vRecords.length} maintenance{vRecords.length > 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t px-4 py-3 bg-muted/30">
                        <div className="flex items-center gap-2 mb-3">
                          <Wrench className="w-4 h-4 text-[hsl(195,50%,25%)]" />
                          <h4 className="text-sm font-semibold">Historique de maintenance</h4>
                        </div>
                        {vRecords.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic py-2">Aucune maintenance enregistrée pour ce véhicule.</p>
                        ) : (
                          <div className="space-y-2">
                            {vRecords.map((m) => (
                              <div key={m.id} className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    m.status === 'completed' ? 'bg-green-100' :
                                    m.status === 'in_progress' ? 'bg-blue-100' :
                                    'bg-amber-100'
                                  }`}>
                                    {m.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> :
                                     m.status === 'in_progress' ? <RefreshCw className="w-4 h-4 text-blue-600" /> :
                                     <Clock className="w-4 h-4 text-amber-600" />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{MAINTENANCE_TYPE_LABELS[m.type] || m.type}</span>
                                      <Badge variant="outline" className={`text-xs ${
                                        m.status === 'completed' ? 'border-green-300 text-green-700' :
                                        m.status === 'in_progress' ? 'border-blue-300 text-blue-700' :
                                        'border-amber-300 text-amber-700'
                                      }`}>
                                        {m.status === 'completed' ? 'Terminée' :
                                         m.status === 'in_progress' ? 'En cours' : 'Planifiée'}
                                      </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {m.description && <span>{m.description} · </span>}
                                      <span>Prévue : {m.scheduled_date || '-'}</span>
                                      {m.completed_date && <span> · Terminée : {m.completed_date}</span>}
                                      {m.cost > 0 && <span> · Coût : {formatPrice(m.cost)}</span>}
                                    </div>
                                  </div>
                                </div>
                                {m.status !== 'completed' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                                    onClick={(e) => { e.stopPropagation(); handleCompleteMaintenance(m.id, String(v.id)); }}
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Terminer
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </TabsContent>

          {/* Drivers Tab */}
          <TabsContent value="drivers" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Téléphone</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead>Courses</TableHead>
                        <TableHead>Recettes/jour</TableHead>
                        <TableHead>Salaire de base</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drivers.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.first_name} {d.last_name}</TableCell>
                          <TableCell>{d.phone}</TableCell>
                          <TableCell>
                            <Badge className={
                              d.status === 'online' ? 'bg-green-100 text-green-800' :
                              d.status === 'on_ride' ? 'bg-blue-100 text-blue-800' :
                              d.status === 'suspended' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }>
                              {d.status === 'online' ? 'En ligne' :
                               d.status === 'on_ride' ? 'En course' :
                               d.status === 'suspended' ? 'Suspendu' : 'Hors ligne'}
                            </Badge>
                          </TableCell>
                          <TableCell>⭐ {d.rating}</TableCell>
                          <TableCell>{d.total_rides}</TableCell>
                          <TableCell className="font-medium">{formatPrice(d.daily_earnings || 0)}</TableCell>
                          <TableCell>{formatPrice(d.monthly_base_salary || 0)}/mois</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rides Tab */}
          <TabsContent value="rides" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {filteredRides.length} courses — {PERIOD_LABELS[period]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Départ</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Distance</TableHead>
                        <TableHead>Prix</TableHead>
                        <TableHead>Paiement</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRides.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            Aucune course sur cette période
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRides.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '-'}</TableCell>
                            <TableCell className="max-w-[120px] truncate">{r.pickup_address}</TableCell>
                            <TableCell className="max-w-[120px] truncate">{r.destination_address}</TableCell>
                            <TableCell>{r.distance_km || '-'} km</TableCell>
                            <TableCell className="font-medium">{formatPrice(r.final_price || r.estimated_price || 0)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{r.payment_method || '-'}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                r.status === 'completed' ? 'bg-green-100 text-green-800' :
                                r.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                r.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                'bg-amber-100 text-amber-800'
                              }>
                                {r.status === 'completed' ? 'Terminée' :
                                 r.status === 'in_progress' ? 'En cours' :
                                 r.status === 'cancelled' ? 'Annulée' : 'En attente'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Access Management Tab */}
          <TabsContent value="access" className="mt-4">
            <AccessManagement />
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="mt-4">
            <div className="space-y-6">
              <SecurityNotifications />
              <SecurityPanel />
            </div>
          </TabsContent>

          {/* AI Image Generator Tab */}
          <TabsContent value="images" className="mt-4">
            <AIImageGenerator />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}