import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { client } from '@/lib/client';
import { t } from '@/lib/i18n';
import { ArrowLeft, Car, Zap, MapPin, TrendingUp, Battery, Navigation, Clock, Loader2, UserX } from 'lucide-react';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import DriverTTSNotification from '@/components/DriverTTSNotification';
import { useRideDispatch, AvailableRide } from '@/hooks/useRideDispatch';

export default function DriverDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { formatPrice, tariff } = useCountryTariff();
  const { user: authUser, loading: authLoading } = useAuth();
  const [driver, setDriver] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [recentRides, setRecentRides] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [loadingDriver, setLoadingDriver] = useState(true);
  const [noDriverProfile, setNoDriverProfile] = useState(false);
  const [rechargeStation, setRechargeStation] = useState('');
  const [rechargeKwh, setRechargeKwh] = useState('');
  const [rechargeCost, setRechargeCost] = useState('');
  const [rechargeKm, setRechargeKm] = useState('');
  const [showRecharge, setShowRecharge] = useState(false);

  const dailyTarget = tariff.daily_target || 30000;

  // Dispatch: available rides for this driver
  const { availableRides, loading: dispatchLoading, accepting, acceptRide } = useRideDispatch({
    enabled: isOnline,
    pollingInterval: 5000,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!authUser?.id) {
      setLoadingDriver(false);
      return;
    }
    loadDriverData(authUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authUser?.id]);

  const loadDriverData = async (userId: string) => {
    setLoadingDriver(true);
    try {
      // Scopé au compte connecté : sans ce filtre, TOUS les chauffeurs
      // voyaient la même première fiche de la base (gains, véhicule et
      // historique d'un autre chauffeur), quel que soit leur propre compte.
      const dRes = await client.entities.drivers.query({
        query: { user_id: userId },
        limit: 1,
      });
      const d = dRes?.data?.items?.[0];

      if (!d) {
        setNoDriverProfile(true);
        setLoadingDriver(false);
        return;
      }

      setNoDriverProfile(false);
      setDriver(d);
      setIsOnline(d.status === 'online' || d.status === 'on_ride');

      if (d.vehicle_id) {
        const vRes = await client.entities.vehicles.get({ id: String(d.vehicle_id) });
        if (vRes?.data) setVehicle(vRes.data);
      }

      // Historique de CE chauffeur uniquement, pas de toute la flotte.
      const rRes = await client.entities.rides.query({
        query: { driver_id: d.id },
        sort: '-created_at',
        limit: 50,
      });
      if (rRes?.data?.items) {
        setRecentRides(rRes.data.items);
      }
    } catch (e) {
      console.error('Failed to load driver data', e);
    }
    setLoadingDriver(false);
  };

  const toggleOnline = async () => {
    const newStatus = isOnline ? 'offline' : 'online';
    setIsOnline(!isOnline);
    if (driver) {
      try {
        await client.entities.drivers.update({
          id: String(driver.id),
          data: { status: newStatus }
        });
      } catch (e) {
        console.error('Failed to update driver status', e);
      }
    }
  };

  const handleRecharge = async () => {
    if (!rechargeStation || !rechargeKwh || !rechargeCost) {
      toast({ title: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    try {
      await client.entities.recharges.create({
        data: {
          driver_id: driver?.id,
          vehicle_id: driver?.vehicle_id,
          station: rechargeStation,
          kwh: parseFloat(rechargeKwh),
          price_per_kwh: 106,
          total_cost: parseInt(rechargeCost),
          km_counter: parseInt(rechargeKm) || vehicle?.km_counter || 0,
          date: new Date().toISOString().split('T')[0],
        }
      });
      toast({ title: 'Recharge déclarée avec succès !' });
      setShowRecharge(false);
      setRechargeStation('');
      setRechargeKwh('');
      setRechargeCost('');
      setRechargeKm('');
    } catch (e: any) {
      toast({ title: e?.message || 'Erreur', variant: 'destructive' });
    }
  };

  const earnings = driver?.daily_earnings || 0;
  const progressPercent = Math.min((earnings / dailyTarget) * 100, 100);

  const isToday = (isoDate?: string) => {
    if (!isoDate) return false;
    const d = new Date(isoDate);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  const todaysCompletedRides = recentRides.filter(r => r.status === 'completed' && isToday(r.created_at)).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-muted rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">{t('driver.dashboard')}</h1>
          </div>
          {driver && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{isOnline ? t('driver.online') : t('driver.offline')}</span>
              <Switch checked={isOnline} onCheckedChange={toggleOnline} />
            </div>
          )}
        </div>
      </header>

      {(authLoading || loadingDriver) && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(195,50%,25%)]" />
        </div>
      )}

      {!authLoading && !loadingDriver && noDriverProfile && (
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
            <UserX className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h2 className="font-semibold text-lg">Aucune fiche chauffeur associée à votre compte</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Un administrateur EDEN VTC doit créer votre profil chauffeur (avec votre numéro de téléphone)
            avant que vous puissiez accepter des courses. Contactez votre administrateur.
          </p>
          <Button variant="outline" onClick={() => navigate('/')}>Retour à l'accueil</Button>
        </main>
      )}

      {!authLoading && !loadingDriver && !noDriverProfile && (
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <Badge className={isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
            {isOnline ? '🟢 En ligne' : '⚫ Hors ligne'}
          </Badge>
          {driver?.status === 'on_ride' && (
            <Badge className="bg-blue-100 text-blue-800">🚗 En course</Badge>
          )}
        </div>

        {/* Earnings Progress */}
        <Card className="eden-gradient text-white">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-sm">{t('driver.earnings')}</p>
                <p className="text-3xl font-bold">{formatPrice(earnings)}</p>
              </div>
              <div className="text-right">
                <p className="text-white/80 text-sm">{t('driver.target')}</p>
                <p className="text-lg font-semibold">{formatPrice(tariff.daily_target)}</p>
              </div>
            </div>
            <div className="space-y-1">
              <Progress value={progressPercent} className="h-3 bg-white/20" />
              <p className="text-xs text-white/70 text-right">{Math.round(progressPercent)}%</p>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Car className="w-6 h-6 mx-auto text-[hsl(195,50%,25%)] mb-1" />
              <p className="text-2xl font-bold">{todaysCompletedRides}</p>
              <p className="text-xs text-muted-foreground">Courses aujourd'hui</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-6 h-6 mx-auto text-[hsl(45,65%,47%)] mb-1" />
              <p className="text-2xl font-bold">{driver?.total_rides || 0}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <MapPin className="w-6 h-6 mx-auto text-green-600 mb-1" />
              <p className="text-2xl font-bold">{vehicle?.km_counter || 0}</p>
              <p className="text-xs text-muted-foreground">km</p>
            </CardContent>
          </Card>
        </div>

        {/* Available Rides (Dispatch) */}
        {isOnline && (
          <Card className="border-[hsl(45,65%,47%)]/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[hsl(45,65%,47%)]" />
                Courses disponibles
                {availableRides.length > 0 && (
                  <Badge className="bg-[hsl(45,65%,47%)] text-white ml-auto">{availableRides.length}</Badge>
                )}
                {dispatchLoading && <Loader2 className="w-4 h-4 animate-spin ml-2 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {availableRides.length === 0 ? (
                <div className="text-center py-6">
                  <MapPin className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Aucune course à proximité pour le moment</p>
                  <p className="text-xs text-muted-foreground mt-1">Les courses à moins de 10 min apparaîtront ici</p>
                </div>
              ) : (
                availableRides.map((ride: AvailableRide) => (
                  <div key={ride.id} className="p-4 rounded-xl border border-border/60 bg-card hover:shadow-md transition-shadow space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <p className="text-sm font-medium truncate max-w-[200px]">{ride.pickup_address}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">{ride.destination_address}</p>
                        </div>
                      </div>
                      {ride.estimated_price && (
                        <span className="text-sm font-bold text-[hsl(195,50%,25%)]">{formatPrice(ride.estimated_price)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {ride.eta_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {ride.distance_to_pickup_km} km
                      </span>
                      {ride.distance_km && (
                        <span className="flex items-center gap-1">
                          <Navigation className="w-3 h-3" />
                          {ride.distance_km} km trajet
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {ride.payment_method === 'wallet' ? '💳 Wallet' : ride.payment_method === 'cash' ? '💵 Cash' : ride.payment_method}
                      </Badge>
                    </div>
                    <Button
                      className="w-full bg-[hsl(45,65%,47%)] hover:bg-[hsl(45,65%,52%)] text-white font-semibold"
                      disabled={accepting}
                      onClick={() => acceptRide(ride.id)}
                    >
                      {accepting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Acceptation...</>
                      ) : (
                        '✓ Accepter cette course'
                      )}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Vehicle Info */}
        {vehicle && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="w-4 h-4" />
                Véhicule assigné
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ID Flotte</span>
                <Badge variant="outline">{vehicle.fleet_id}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Modèle</span>
                <span className="text-sm font-medium">{vehicle.brand} {vehicle.model}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Immatriculation</span>
                <span className="text-sm font-medium">{vehicle.license_plate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Batterie</span>
                <div className="flex items-center gap-2">
                  <Battery className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">{vehicle.battery_level}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recharge Declaration */}
        <Dialog open={showRecharge} onOpenChange={setShowRecharge}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full border-[hsl(45,65%,47%)] text-[hsl(45,65%,47%)]">
              <Zap className="w-4 h-4 mr-2" />
              {t('driver.recharge')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('driver.recharge')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Borne / Station</Label>
                <Input value={rechargeStation} onChange={(e) => setRechargeStation(e.target.value)} placeholder="Ex: Borne Akwa Centre" />
              </div>
              <div className="space-y-2">
                <Label>kWh chargés</Label>
                <Input type="number" value={rechargeKwh} onChange={(e) => setRechargeKwh(e.target.value)} placeholder="Ex: 25" />
              </div>
              <div className="space-y-2">
                <Label>Coût total ({tariff.currency_symbol})</Label>
                <Input type="number" value={rechargeCost} onChange={(e) => setRechargeCost(e.target.value)} placeholder="Ex: 2650" />
              </div>
              <div className="space-y-2">
                <Label>Km compteur</Label>
                <Input type="number" value={rechargeKm} onChange={(e) => setRechargeKm(e.target.value)} placeholder={String(vehicle?.km_counter || '')} />
              </div>
              <Button onClick={handleRecharge} className="w-full bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white">
                Enregistrer la recharge
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* TTS Notifications */}
        <DriverTTSNotification />

        {/* Recent Rides */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('driver.today_rides')}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRides.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Aucune course pour le moment</p>
            ) : (
              <div className="space-y-3">
                {recentRides.slice(0, 5).map((ride) => (
                  <div key={ride.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-[hsl(195,50%,25%)]" />
                      <div>
                        <p className="text-sm font-medium truncate max-w-[180px]">{ride.destination_address}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {ride.distance_km || '?'} km
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold">{formatPrice(ride.final_price || ride.estimated_price || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      )}
    </div>
  );
}