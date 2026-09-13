import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { client } from '@/lib/client';
import { t } from '@/lib/i18n';
import { MapPin, Navigation, Clock, Leaf, AlertTriangle, ArrowLeft, Car, Locate, Loader2, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import RideMap from '@/components/RideMap';
import TrafficPanel from '@/components/TrafficPanel';
import SavedAddresses, { SavedAddress } from '@/components/SavedAddresses';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import { useTrafficData } from '@/hooks/useTrafficData';
import { EDEN_CITIES, haversineDistance, reverseGeocode, getPositionWithFallback } from '@/lib/geolocation';
import { useNearbyDestinations } from '@/hooks/useNearbyDestinations';
import BottomNav from '@/components/BottomNav';
import { useRideStatus, requestNotificationPermission } from '@/hooks/useRideStatus';
import { useNearbyDrivers } from '@/hooks/useNearbyDrivers';
import DebtAlertBanner from '@/components/DebtAlertBanner';

// Geocode an address using Nominatim (free, works worldwide in Africa)
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';

async function geocodeAddress(address: string, cityCenter: { lat: number; lng: number }): Promise<{ lat: number; lng: number }> {
  try {
    const res = await fetch(
      `${NOMINATIM_SEARCH}?q=${encodeURIComponent(address)}&format=json&limit=1&viewbox=${cityCenter.lng - 0.2},${cityCenter.lat + 0.2},${cityCenter.lng + 0.2},${cityCenter.lat - 0.2}&bounded=1`,
      { headers: { 'User-Agent': 'EDEN-VTC-App/1.0' } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // Fallback below
  }
  // Fallback: random offset from city center
  return {
    lat: cityCenter.lat + (Math.random() - 0.5) * 0.04,
    lng: cityCenter.lng + (Math.random() - 0.5) * 0.04,
  };
}

export default function BookRide() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { location } = useGeolocation();
  const { tariff, formatPrice, calculatePrice, isNightTime } = useCountryTariff();
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [bookingForSelf, setBookingForSelf] = useState(true);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);
  const [co2Saved, setCo2Saved] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [totalRides, setTotalRides] = useState(0);
  const [hasDebt, setHasDebt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [positionSource, setPositionSource] = useState<'gps' | 'ip' | null>(null);
  const [passenger, setPassenger] = useState<any>(null);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [rideConfirmed, setRideConfirmed] = useState(false);
  const [currentRideId, setCurrentRideId] = useState<number | null>(null);

  // Traffic data
  const { trafficData, loading: trafficLoading, lastUpdate: trafficLastUpdate, refresh: refreshTraffic } = useTrafficData(true);

  // Ride status polling (when waiting for a driver)
  const { rideStatus, driverFound, cancelRide: cancelCurrentRide } = useRideStatus({
    rideId: currentRideId,
    // 6 s : cadence suffisante pour l'attente d'un chauffeur réel tout en
    // restant sous le quota de lecture. L'attente peut désormais durer
    // longtemps puisque seule une acceptation manuelle assigne la course.
    pollingInterval: 6000,
    onDriverAccepted: (data) => {
      // Driver found! Show driver info and redirect to tracking
      if (data.driver) {
        setDriverCoords(null); // Will be set by tracking page
      }
      setTimeout(() => {
        navigate('/track');
      }, 2000);
    },
  });

  // City center for geocoding bias (from user's detected location)
  const cityCenter = location
    ? { lat: location.lat, lng: location.lng }
    : { lat: 4.0511, lng: 9.7679 };

  // Quartiers/localités à moins de 15 km du point de départ (ou du
  // centre-ville tant que le départ n'est pas encore connu), proposés comme
  // destinations rapides sous le champ Destination — n'importe où, pas
  // seulement dans les villes pour lesquelles EDEN VTC a une liste maison
  // (cf. hooks/useNearbyDestinations.ts).
  const NEARBY_DESTINATION_RADIUS_KM = 15;
  const { destinations: nearbyDestinations, loading: loadingNearbyDestinations } = useNearbyDestinations({
    lat: pickupCoords?.lat ?? cityCenter.lat,
    lng: pickupCoords?.lng ?? cityCenter.lng,
    radiusKm: NEARBY_DESTINATION_RADIUS_KM,
  });

  // Chauffeurs EDEN VTC réellement en ligne à moins de 3 km du point de
  // départ, affichés sur la carte tant que la course n'est pas encore
  // commandée (une fois confirmée, la carte bascule sur le chauffeur assigné
  // et le trajet jusqu'à la destination).
  const NEARBY_DRIVERS_RADIUS_KM = 3;
  const { nearbyDrivers } = useNearbyDrivers({
    lat: pickupCoords?.lat,
    lng: pickupCoords?.lng,
    radiusKm: NEARBY_DRIVERS_RADIUS_KM,
    enabled: !rideConfirmed,
  });

  useEffect(() => {
    loadPassengerData();
  }, []);

  // Auto-fill pickup with GPS when booking for self
  useEffect(() => {
    if (bookingForSelf && !pickup && !pickupCoords) {
      handleUseGPS();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingForSelf]);

  const loadPassengerData = async () => {
    try {
      const res = await client.entities.passengers.query({ query: {} });
      if (res?.data?.items?.length > 0) {
        const p = res.data.items[0];
        setPassenger(p);
        setWalletBalance(p.wallet_balance || 0);
        setTotalRides(p.total_rides || 0);
        setHasDebt(p.has_pending_debt || false);
      }
    } catch (e) {
      console.error('Failed to load passenger data', e);
    }
  };

  // Use GPS to fill pickup with current position (with IP triangulation fallback if GPS denied)
  const handleUseGPS = useCallback(async () => {
    setGpsLoading(true);
    try {
      const result = await getPositionWithFallback();
      setPickupCoords({ lat: result.lat, lng: result.lng });
      setPositionSource(result.source);
      // Reverse geocode to get address
      const { city, displayName } = await reverseGeocode(result.lat, result.lng);
      setPickup(displayName || `${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`);

      if (result.source === 'gps') {
        toast({ title: `📍 Position GPS détectée : ${city}` });
      } else {
        // Afficher les détails de triangulation IP
        const confidencePercent = Math.round(result.confidence * 100);
        const methodLabel = result.method === 'triangulated'
          ? `triangulée (${result.sources_used} sources)`
          : result.method === 'single' ? '1 source' : 'estimation';
        toast({
          title: `📡 Position ${methodLabel} : ${city}`,
          description: `Précision ~${result.accuracy_km}km • Confiance ${confidencePercent}%. Ajustez manuellement si nécessaire.`,
        });
      }
    } catch (e: any) {
      // Even the IP fallback failed — use default Douala center
      const fallbackLat = 4.0511;
      const fallbackLng = 9.7679;
      setPickupCoords({ lat: fallbackLat, lng: fallbackLng });
      setPickup('Douala, Cameroun');
      setPositionSource(null);
      toast({
        title: '📍 Position par défaut : Douala',
        description: 'Impossible de détecter votre position. Vous pouvez modifier l\'adresse manuellement.',
      });
    } finally {
      setGpsLoading(false);
    }
  }, [toast]);

  const handleEstimate = async () => {
    if (!pickup || !destination) {
      toast({ title: 'Veuillez remplir le départ et la destination', variant: 'destructive' });
      return;
    }

    setEstimating(true);
    try {
      // Geocode addresses using Nominatim (works in all African cities)
      const pCoords = pickupCoords || await geocodeAddress(pickup, cityCenter);
      const dCoords = destCoords || await geocodeAddress(destination, cityCenter);
      setPickupCoords(pCoords);
      setDestCoords(dCoords);

      // Calculate distance using Haversine
      let distance = haversineDistance(pCoords.lat, pCoords.lng, dCoords.lat, dCoords.lng);
      // Add 30% for road vs straight line
      distance = Math.round(distance * 1.3 * 10) / 10;
      if (distance < 1) distance = 1;

      const duration = Math.round(distance * 3.5 + 5);
      // Use country-specific tariff
      // Estimation indicative à l'écran uniquement. Le montant réellement
      // facturé est recalculé par le serveur à la commande et à la fin de course.
      const price = calculatePrice(distance, duration, isNightTime());
      const co2 = Math.round(distance * 120);

      setEstimatedDistance(distance);
      setEstimatedDuration(duration);
      setEstimatedPrice(price);
      setCo2Saved(co2);
    } catch {
      toast({ title: 'Erreur lors du calcul de l\'itinéraire', variant: 'destructive' });
    } finally {
      setEstimating(false);
    }
  };

  const handleConfirmRide = async () => {
    if (!estimatedPrice) {
      toast({ title: "Veuillez estimer le prix d'abord", variant: 'destructive' });
      return;
    }
    if (hasDebt && paymentMethod === 'wallet') {
      toast({ title: 'Vous avez une dette en cours. Veuillez régulariser avant de commander.', variant: 'destructive' });
      return;
    }
    // Bloquer si solde insuffisant et pas éligible au crédit (< 50 courses)
    if (insufficientBalance && !isEligibleForCredit && paymentMethod === 'wallet') {
      toast({
        title: `Crédit non disponible (${totalRides}/${MIN_RIDES_FOR_CREDIT} courses)`,
        description: 'Rechargez votre portefeuille ou effectuez plus de courses pour débloquer le crédit.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Use dispatch system to create ride visible to nearby drivers
      const res = await client.apiCall.invoke({
        url: '/api/v1/dispatch/create-ride',
        method: 'POST',
        data: {
          pickup_address: pickup,
          pickup_lat: pickupCoords?.lat,
          pickup_lng: pickupCoords?.lng,
          destination_address: destination,
          destination_lat: destCoords?.lat,
          destination_lng: destCoords?.lng,
          distance_km: estimatedDistance,
          duration_min: estimatedDuration,
          estimated_price: estimatedPrice,
          payment_method: paymentMethod,
          is_scheduled: isScheduled,
          scheduled_at: isScheduled && scheduledDate ? scheduledDate : undefined,
          co2_saved: co2Saved,
        },
      });

      if (res?.data?.success) {
        const rideId = res.data.ride_id;

        // Le prix facturé est calculé et validé par le serveur : on aligne
        // l'affichage sur le montant officiel retourné par l'API.
        const serverPrice = res.data.price;
        if (typeof serverPrice === 'number' && serverPrice > 0) {
          setEstimatedPrice(serverPrice);
        }

        // La dette et le débit du portefeuille sont gérés exclusivement côté
        // serveur à la fin de la course : aucune écriture comptable ici.

        // Request notification permission early so browser notification fires when driver accepts
        requestNotificationPermission();

        // Show waiting state
        setRideConfirmed(true);
        setCurrentRideId(rideId);

        toast({
          title: '🚗 Commande envoyée !',
          description: 'Recherche d\'un chauffeur disponible à proximité...',
        });
      } else {
        toast({ title: 'Erreur lors de la commande', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: e?.response?.data?.detail || e?.data?.detail || e?.message || 'Erreur lors de la commande', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };



  const MIN_RIDES_FOR_CREDIT = 50;
  const insufficientBalance = estimatedPrice !== null && walletBalance < estimatedPrice && paymentMethod === 'wallet';
  const isEligibleForCredit = totalRides >= MIN_RIDES_FOR_CREDIT;
  const needsCreditButNotEligible = insufficientBalance && !isEligibleForCredit && !hasDebt;

  return (
    <div className="min-h-screen bg-background pb-bottom-nav">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-border/40 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-muted/60 rounded-xl transition-colors duration-200">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">{t('book.title')}</h1>
          </div>
          {location && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
              <MapPin className="w-3 h-3" />
              <span className="text-xs font-medium">{location.city}</span>
              <span className="w-1.5 h-1.5 rounded-full status-dot-online" />
            </div>
          )}
        </div>
      </header>

      {/* Debt Alert Banner */}
      <DebtAlertBanner className="mx-4 mt-4" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Map */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <RideMap
              pickupLat={pickupCoords?.lat}
              pickupLng={pickupCoords?.lng}
              destinationLat={destCoords?.lat}
              destinationLng={destCoords?.lng}
              driverLat={driverCoords?.lat}
              driverLng={driverCoords?.lng}
              userLat={pickupCoords?.lat ?? location?.lat}
              userLng={pickupCoords?.lng ?? location?.lng}
              nearbyDrivers={rideConfirmed ? [] : nearbyDrivers}
              showRoute={true}
              autoLocate={true}
              trafficSegments={trafficData?.segments.map(s => ({ id: s.id, coords: s.coords, level: s.level })) || []}
              className="h-[280px] w-full"
            />
          </CardContent>
          {!rideConfirmed && pickupCoords && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
              {nearbyDrivers.length > 0
                ? `🚗 ${nearbyDrivers.length} chauffeur${nearbyDrivers.length > 1 ? 's' : ''} disponible${nearbyDrivers.length > 1 ? 's' : ''} à moins de ${NEARBY_DRIVERS_RADIUS_KM} km`
                : `Aucun chauffeur disponible à moins de ${NEARBY_DRIVERS_RADIUS_KM} km pour le moment`}
            </div>
          )}
        </Card>

        {/* Traffic Panel */}
        <TrafficPanel
          trafficData={trafficData}
          loading={trafficLoading}
          lastUpdate={trafficLastUpdate}
          onRefresh={refreshTraffic}
        />

        {/* Waiting for driver / Driver found */}
        {rideConfirmed && (
          <Card className={`border-2 transition-all duration-500 ${driverFound ? 'border-green-300 bg-green-50 shadow-lg shadow-green-100 animate-pulse-once' : 'border-[hsl(45,65%,47%)]/40 bg-[hsl(45,65%,47%)]/5'}`}>
            <CardContent className="p-6">
              {driverFound && rideStatus?.driver ? (
                <div className="flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center ring-4 ring-green-200 ring-offset-2">
                    <Car className="w-8 h-8 text-green-700" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-green-800 text-lg">🎉 Chauffeur trouvé !</p>
                      <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0.5">Confirmé</Badge>
                    </div>
                    <p className="text-sm text-green-700 font-medium mt-1">
                      {rideStatus.driver.first_name} {rideStatus.driver.last_name}
                    </p>
                    <p className="text-xs text-green-600 mt-0.5">
                      ⭐ {rideStatus.driver.rating}/5 · Tél: {rideStatus.driver.phone}
                    </p>
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Redirection vers le suivi en cours...
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[hsl(45,65%,47%)]/10 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-[hsl(45,65%,47%)] animate-spin" />
                  </div>
                  <div>
                    <p className="font-bold text-[hsl(195,50%,25%)] text-lg">Recherche d'un chauffeur...</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Votre commande est visible par les chauffeurs libres à moins de 10 minutes de vous.
                      Elle reste en attente jusqu'à ce qu'un chauffeur l'accepte : si aucun n'est en ligne
                      pour le moment, vous pouvez annuler et réessayer plus tard.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {pickup} → {destination}
                    </p>
                    {estimatedPrice && (
                      <p className="text-sm font-semibold text-[hsl(195,50%,25%)] mt-2">
                        Prix estimé : {estimatedPrice.toLocaleString()} FCFA
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      const cancelled = await cancelCurrentRide();
                      if (cancelled) {
                        setRideConfirmed(false);
                        setCurrentRideId(null);
                      }
                    }}
                  >
                    Annuler la commande
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pickup & Destination */}
        {!rideConfirmed && (
          <Card>
            <CardContent className="p-6 space-y-4">
              {/* City indicator */}
              {location && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 text-sm">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-medium">{location.city}, {location.country}</span>
                  <span className="w-2 h-2 rounded-full bg-green-500 ml-auto" />
                </div>
              )}

              {/* Booking mode: for self or third party */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(195,50%,25%)]/5 border border-[hsl(195,50%,25%)]/10">
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-[hsl(195,50%,25%)]" />
                  <span className="text-sm font-medium text-[hsl(195,50%,25%)]">
                    {bookingForSelf ? 'Course pour moi' : 'Course pour un tiers'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{bookingForSelf ? 'Ma position GPS' : 'Adresse manuelle'}</span>
                  <Switch
                    checked={!bookingForSelf}
                    onCheckedChange={(checked) => {
                      setBookingForSelf(!checked);
                      if (!checked) {
                        // Switching back to "for self" — trigger GPS auto-fill
                        handleUseGPS();
                      } else {
                        // Switching to "for third party" — clear pickup for manual entry
                        setPickup('');
                        setPickupCoords(null);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Saved addresses quick-select */}
              <div className="space-y-1">
                <SavedAddresses
                  compact
                  onSelect={(addr: SavedAddress) => {
                    setPickup(addr.address);
                    setPickupCoords({ lat: addr.lat, lng: addr.lng });
                    setPositionSource(null);
                    toast({ title: `📌 Adresse "${addr.label}" sélectionnée` });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[hsl(45,65%,47%)]" />
                  {t('book.pickup')}
                </Label>

                {bookingForSelf ? (
                  <>
                    {/* GPS auto-filled display */}
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border bg-green-50/50 border-green-200">
                        {gpsLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-[hsl(195,50%,25%)]" />
                            <span className="text-sm text-muted-foreground">Détection GPS en cours...</span>
                          </>
                        ) : pickup ? (
                          <>
                            <Locate className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800 truncate">{pickup}</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                            <span className="text-sm text-orange-600">GPS indisponible — cliquez pour réessayer</span>
                          </>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleUseGPS}
                        disabled={gpsLoading}
                        title="Rafraîchir ma position GPS"
                        className="shrink-0"
                      >
                        {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Locate className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-green-700">
                      {positionSource === 'ip'
                        ? '📡 Position approximative (par IP) — vous pouvez ajuster si besoin'
                        : '📍 Votre position GPS est utilisée comme point de départ'}
                    </p>
                  </>
                ) : (
                  <>
                    {/* Manual address entry for third party */}
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder={`Adresse de prise en charge du passager, ${location?.city || 'Ville'}`}
                        value={pickup}
                        onChange={(e) => { setPickup(e.target.value); setPickupCoords(null); }}
                        className="flex-1 h-12 text-base px-4 border-2 border-border/60 focus:border-[hsl(45,65%,47%)] rounded-xl"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleUseGPS}
                        disabled={gpsLoading}
                        title="Utiliser ma position GPS"
                        className="shrink-0"
                      >
                        {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Locate className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Entrez l'adresse de prise en charge pour la tierce personne
                    </p>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Navigation className="w-4 h-4 text-[hsl(195,50%,25%)]" />
                  {t('book.destination')}
                </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder={`Ex: Centre-ville, ${location?.city || 'Ville'}`}
                    value={destination}
                    onChange={(e) => { setDestination(e.target.value); setDestCoords(null); }}
                    className="flex-1 h-12 text-base px-4 border-2 border-border/60 focus:border-[hsl(195,50%,25%)] rounded-xl"
                  />
                  <SavedAddresses
                    compact
                    onSelect={(addr: SavedAddress) => {
                      setDestination(addr.address);
                      setDestCoords({ lat: addr.lat, lng: addr.lng });
                      toast({ title: `📌 Destination "${addr.label}" sélectionnée` });
                    }}
                  />
                </div>
                {loadingNearbyDestinations ? (
                  <p className="text-xs text-muted-foreground pt-1">Recherche des quartiers à proximité...</p>
                ) : nearbyDestinations.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs text-muted-foreground">
                      {nearbyDestinations.length} quartier{nearbyDestinations.length > 1 ? 's' : ''} à moins de {NEARBY_DESTINATION_RADIUS_KM} km
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {nearbyDestinations.map((n) => {
                        const label = location?.city ? `${n.name}, ${location.city}` : n.name;
                        return (
                          <Button
                            key={n.name}
                            type="button"
                            variant="outline"
                            size="sm"
                            className={`h-7 rounded-full text-xs px-3 ${destination === label ? 'border-[hsl(195,50%,25%)] bg-[hsl(195,50%,25%)]/10' : ''}`}
                            onClick={() => {
                              setDestination(label);
                              setDestCoords({ lat: n.lat, lng: n.lng });
                            }}
                          >
                            {n.name} · {n.distanceKm.toFixed(1)} km
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Schedule toggle */}
              <div className="flex items-center justify-between pt-2">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {t('book.schedule')}
                </Label>
                <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
              </div>
              {isScheduled && (
                <Input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              )}

              <Button
                onClick={handleEstimate}
                disabled={estimating}
                className="w-full bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white"
              >
                {estimating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calcul en cours...</> : t('book.estimate')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Estimation Result */}
        {estimatedPrice !== null && !rideConfirmed && (
          <Card className="border-[hsl(45,65%,47%)]/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{t('book.estimated_price')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <p className="text-4xl font-bold text-[hsl(195,50%,25%)]">{formatPrice(estimatedPrice)}</p>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{tariff.country_name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tariff.currency_code}</Badge>
                  {isNightTime() && <Badge className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700">Nuit x{tariff.night_multiplier}</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div>
                  <p className="text-muted-foreground">{t('book.distance')}</p>
                  <p className="font-semibold">{estimatedDistance} km</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('book.duration')}</p>
                  <p className="font-semibold">{estimatedDuration} min</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('home.co2')}</p>
                  <p className="font-semibold text-green-600">{co2Saved}g</p>
                </div>
              </div>

              {/* Eco badge */}
              <div className="flex items-center justify-center gap-2 py-2 px-4 bg-green-50 rounded-lg">
                <Leaf className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 font-medium">{t('home.eco')} — {co2Saved}g CO₂ évité</span>
              </div>

              {/* Traffic impact on ETA */}
              {trafficData && trafficData.totalDelay > 0 && (
                <div className="flex items-center gap-2 py-2 px-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-orange-700 font-medium">
                    Trafic : +{trafficData.totalDelay} min estimé sur votre trajet
                  </span>
                </div>
              )}

              {/* Payment method */}
              <div className="space-y-2">
                <Label>{t('book.payment_method')}</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wallet">Portefeuille ({formatPrice(walletBalance)})</SelectItem>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="orange_money">Orange Money</SelectItem>
                    <SelectItem value="mtn_momo">MTN MoMo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Debt warning — client non éligible au crédit (< 50 courses) */}
              {needsCreditButNotEligible && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-800 text-sm">
                    <strong>Solde insuffisant.</strong> Le crédit de course est réservé aux clients fidèles ayant effectué au moins {MIN_RIDES_FOR_CREDIT} courses.
                    Vous avez actuellement <strong>{totalRides}</strong> course(s) sur {MIN_RIDES_FOR_CREDIT} requises.
                    Veuillez recharger votre portefeuille pour commander.
                  </AlertDescription>
                </Alert>
              )}

              {/* Debt warning — client éligible au crédit (≥ 50 courses) */}
              {insufficientBalance && isEligibleForCredit && !hasDebt && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-sm">
                    Solde insuffisant — en tant que client fidèle ({totalRides} courses), cette course sera portée à crédit.
                    Le montant de {((estimatedPrice || 0) - walletBalance).toLocaleString()} FCFA sera ajouté à votre dette (plafond : 5 000 FCFA).
                  </AlertDescription>
                </Alert>
              )}

              {hasDebt && paymentMethod === 'wallet' && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-800 text-sm">
                    Vous avez une dette en cours de {formatPrice(passenger?.debt_amount || 0)}. Veuillez régulariser via le portefeuille.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleConfirmRide}
                disabled={loading || (hasDebt && paymentMethod === 'wallet') || needsCreditButNotEligible}
                className="w-full bg-[hsl(45,65%,47%)] hover:bg-[hsl(45,65%,52%)] text-[hsl(195,50%,10%)] font-semibold py-6 text-lg"
              >
                {loading ? t('common.loading') : needsCreditButNotEligible ? 'Recharger pour commander' : t('book.confirm')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Ride in progress info */}
        {rideConfirmed && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[hsl(45,65%,47%)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Départ</p>
                  <p className="text-sm font-medium">{pickup}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Navigation className="w-4 h-4 text-[hsl(195,50%,25%)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Destination</p>
                  <p className="text-sm font-medium">{destination}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center text-sm pt-2 border-t">
                <div>
                  <p className="text-muted-foreground">Distance</p>
                  <p className="font-semibold">{estimatedDistance} km</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Prix</p>
                  <p className="font-semibold text-[hsl(195,50%,25%)]">{formatPrice(estimatedPrice || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">CO₂ évité</p>
                  <p className="font-semibold text-green-600">{co2Saved}g</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => navigate('/rides')}
              >
                Voir mes courses
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}