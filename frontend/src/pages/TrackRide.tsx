import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Phone, MessageSquare, Navigation, MapPin, Clock, Car, Shield, Star, Wifi, WifiOff, RefreshCw, Bell, BellRing } from 'lucide-react';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import RideMap from '@/components/RideMap';
import SharePosition from '@/components/SharePosition';
import { useVehicleTracking } from '@/hooks/useVehicleTracking';
import { useRideNotifications } from '@/hooks/useRideNotifications';
import { reverseGeocode } from '@/lib/geolocation';
import { client } from '@/lib/client';

type RidePhase = 'waiting_gps' | 'driver_approaching' | 'pickup_reached' | 'in_transit' | 'arriving' | 'completed';

interface DriverInfo {
  name: string;
  photo: string;
  rating: number;
  vehicle: string;
  plate: string;
  phone: string;
}

interface RideInfo {
  id: number;
  vehicleId: number;
  pickup: { lat: number; lng: number; name: string };
  destination: { lat: number; lng: number; name: string };
  driver: DriverInfo;
  price: number;
  distance: number;
}

// Données de démonstration (en production, récupérées depuis le backend lors de la commande)
const DEMO_RIDE: RideInfo = {
  id: 1,
  vehicleId: 1,
  pickup: { lat: 4.0435, lng: 9.6966, name: 'Akwa, Douala' },
  destination: { lat: 4.0186, lng: 9.6942, name: 'Bonanjo, Douala' },
  driver: {
    name: 'Jean-Paul M.',
    photo: '👨🏾‍✈️',
    rating: 4.8,
    vehicle: 'Tesla Model 3 – Blanc',
    plate: 'LT-2345-DLA',
    phone: '+237 6 99 88 77 66',
  },
  price: 2500,
  distance: 3.2,
};

export default function TrackRide() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatPrice } = useCountryTariff();

  // Récupérer les paramètres de la course depuis l'URL
  const vehicleId = parseInt(searchParams.get('vehicle_id') || '1', 10);
  const rideId = parseInt(searchParams.get('ride_id') || '0', 10);

  // Utiliser le hook de suivi GPS réel du véhicule
  const {
    position,
    previousPosition,
    isLoading,
    error,
    isConnected,
    lastUpdate,
    refresh,
  } = useVehicleTracking({
    vehicleId,
    rideId: rideId || undefined,
    pollingInterval: 5000, // Interroger le GPS toutes les 5 secondes
    enabled: true,
  });

  const [phase, setPhase] = useState<RidePhase>('waiting_gps');
  const [followDriver, setFollowDriver] = useState(true);
  const [ride, setRide] = useState<RideInfo>(DEMO_RIDE);
  const [showArrivalBanner, setShowArrivalBanner] = useState(false);
  const [userGpsPosition, setUserGpsPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocationName, setUserLocationName] = useState<string>('votre position');
  const lastGeocodedRef = useRef<string>('');

  // Charger les vraies infos de la course (chauffeur, véhicule, trajet) via
  // rideId. Sans ça, l'écran affichait toujours DEMO_RIDE (Jean-Paul M.,
  // Akwa → Bonanjo, 2500 FCFA) quelle que soit la course réellement assignée.
  useEffect(() => {
    if (!rideId) return;

    let cancelled = false;

    (async () => {
      try {
        const rideRes = await client.entities.rides.get({ id: String(rideId) });
        const r = rideRes?.data;
        if (!r || cancelled) return;

        let driverInfo: DriverInfo = DEMO_RIDE.driver;
        if (r.driver_id) {
          try {
            const [driverRes, vehicleRes] = await Promise.all([
              client.entities.drivers.get({ id: String(r.driver_id) }),
              r.vehicle_id ? client.entities.vehicles.get({ id: String(r.vehicle_id) }) : Promise.resolve(null),
            ]);
            const d = driverRes?.data;
            const v = vehicleRes?.data;
            if (d) {
              driverInfo = {
                name: `${d.first_name} ${d.last_name?.[0] ? d.last_name[0] + '.' : ''}`.trim(),
                photo: '👨🏾‍✈️',
                rating: d.rating ?? 5,
                vehicle: v ? `${v.brand} ${v.model}` : DEMO_RIDE.driver.vehicle,
                plate: v?.license_plate || DEMO_RIDE.driver.plate,
                phone: d.phone || '',
              };
            }
          } catch (e) {
            console.error('Failed to load driver/vehicle for ride', e);
          }
        }

        if (cancelled) return;
        setRide({
          id: r.id,
          vehicleId: r.vehicle_id || vehicleId,
          pickup: {
            lat: r.pickup_lat ?? DEMO_RIDE.pickup.lat,
            lng: r.pickup_lng ?? DEMO_RIDE.pickup.lng,
            name: r.pickup_address || DEMO_RIDE.pickup.name,
          },
          destination: {
            lat: r.destination_lat ?? DEMO_RIDE.destination.lat,
            lng: r.destination_lng ?? DEMO_RIDE.destination.lng,
            name: r.destination_address || DEMO_RIDE.destination.name,
          },
          driver: driverInfo,
          price: r.final_price ?? r.estimated_price ?? DEMO_RIDE.price,
          distance: r.distance_km ?? DEMO_RIDE.distance,
        });
      } catch (e) {
        console.error('Failed to load ride details', e);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  // Obtenir la position GPS réelle de l'utilisateur (PAS le pickup fixe comme fallback)
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      // Pas de GPS disponible — tenter un fallback IP
      fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(data => {
          if (data.latitude && data.longitude) {
            setUserGpsPosition({ lat: data.latitude, lng: data.longitude });
          }
        })
        .catch(() => { /* Pas de fallback possible */ });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // GPS refusé → fallback IP (PAS le pickup fixe !)
        fetch('https://ipapi.co/json/')
          .then(r => r.json())
          .then(data => {
            if (data.latitude && data.longitude) {
              setUserGpsPosition({ lat: data.latitude, lng: data.longitude });
            }
          })
          .catch(() => { /* Pas de fallback possible */ });
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Géocodage inversé : convertir la position GPS de l'utilisateur en nom de lieu
  useEffect(() => {
    if (!userGpsPosition) return;

    const key = `${userGpsPosition.lat.toFixed(3)},${userGpsPosition.lng.toFixed(3)}`;
    if (lastGeocodedRef.current === key) return; // Éviter les appels répétés
    lastGeocodedRef.current = key;

    reverseGeocode(userGpsPosition.lat, userGpsPosition.lng)
      .then(({ city }) => {
        if (city && city !== 'Ville inconnue') {
          setUserLocationName(city);
        }
      })
      .catch(() => { /* Garder "votre position" par défaut */ });
  }, [userGpsPosition]);

  // Position actuelle du chauffeur (depuis le GPS du véhicule)
  const driverPos = useMemo(() => {
    if (position) {
      return { lat: position.latitude, lng: position.longitude };
    }
    return { lat: ride.pickup.lat, lng: ride.pickup.lng };
  }, [position, ride.pickup]);

  // Cap du véhicule (depuis le GPS)
  const driverHeading = position?.heading || 0;

  // Vitesse du véhicule (depuis le GPS)
  const vehicleSpeed = position?.speed || 0;

  // Afficher la bannière d'arrivée quand le chauffeur arrive au point de prise en charge
  useEffect(() => {
    if (phase === 'pickup_reached') {
      setShowArrivalBanner(true);
      // Masquer la bannière après 15 secondes
      const timer = setTimeout(() => setShowArrivalBanner(false), 15000);
      return () => clearTimeout(timer);
    } else {
      setShowArrivalBanner(false);
    }
  }, [phase]);

  // Calculer la distance entre deux points GPS (formule Haversine)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Déterminer la phase de la course basée sur la position GPS réelle
  // Tient compte de la position de l'UTILISATEUR (pas seulement du pickup fixe)
  useEffect(() => {
    if (!position) {
      setPhase('waiting_gps');
      return;
    }

    // Distance chauffeur → utilisateur (position GPS réelle ou fallback pickup)
    const userLat = userGpsPosition?.lat ?? ride.pickup.lat;
    const userLng = userGpsPosition?.lng ?? ride.pickup.lng;

    const distToUser = calculateDistance(
      position.latitude, position.longitude,
      userLat, userLng
    );
    const distToPickup = calculateDistance(
      position.latitude, position.longitude,
      ride.pickup.lat, ride.pickup.lng
    );
    const distToDestination = calculateDistance(
      position.latitude, position.longitude,
      ride.destination.lat, ride.destination.lng
    );
    const totalDistance = calculateDistance(
      ride.pickup.lat, ride.pickup.lng,
      ride.destination.lat, ride.destination.lng
    );

    // Seuils en mètres — basés sur la distance vers l'utilisateur ET la destination
    if (distToDestination < 50) {
      setPhase('completed');
    } else if (distToDestination < 200) {
      setPhase('arriving');
    } else if (distToUser < 80 || distToPickup < 50) {
      // Le chauffeur est arrivé au niveau de l'utilisateur (< 80m)
      // OU au point de prise en charge fixe (< 50m)
      setPhase('pickup_reached');
    } else if (distToPickup < totalDistance * 0.3 && distToUser > distToPickup) {
      // Le chauffeur a dépassé le pickup et est en transit vers la destination
      setPhase('in_transit');
    } else {
      setPhase('driver_approaching');
    }
  }, [position, userGpsPosition, ride.pickup, ride.destination]);

  // Calculer l'ETA basé sur la vitesse GPS réelle et la distance vers l'UTILISATEUR
  const eta = useMemo(() => {
    if (!position) return 0;

    let targetLat: number, targetLng: number;

    if (phase === 'driver_approaching' || phase === 'waiting_gps') {
      // Utiliser la position GPS réelle de l'utilisateur si disponible
      if (userGpsPosition) {
        targetLat = userGpsPosition.lat;
        targetLng = userGpsPosition.lng;
      } else {
        // Fallback : point de prise en charge
        targetLat = ride.pickup.lat;
        targetLng = ride.pickup.lng;
      }
    } else {
      targetLat = ride.destination.lat;
      targetLng = ride.destination.lng;
    }

    const distance = calculateDistance(
      position.latitude, position.longitude,
      targetLat, targetLng
    );

    // Utiliser la vitesse GPS réelle, ou 30 km/h par défaut en ville
    const speed = vehicleSpeed > 0 ? vehicleSpeed : 30;
    const speedMs = speed * 1000 / 3600; // Convertir km/h en m/s
    const etaSeconds = distance / speedMs;
    return Math.max(1, Math.round(etaSeconds / 60)); // En minutes
  }, [position, phase, vehicleSpeed, userGpsPosition, ride.pickup, ride.destination]);

  // Calculer la progression
  const progress = useMemo(() => {
    if (!position) return 0;

    if (phase === 'completed') return 100;

    const totalDistance = calculateDistance(
      ride.pickup.lat, ride.pickup.lng,
      ride.destination.lat, ride.destination.lng
    );

    if (phase === 'driver_approaching' || phase === 'waiting_gps') {
      // Progression vers le point de prise en charge
      const initialDist = totalDistance * 1.5; // Distance estimée initiale
      const currentDist = calculateDistance(
        position.latitude, position.longitude,
        ride.pickup.lat, ride.pickup.lng
      );
      return Math.min(95, Math.max(0, ((initialDist - currentDist) / initialDist) * 100));
    }

    // Progression vers la destination
    const distCovered = calculateDistance(
      ride.pickup.lat, ride.pickup.lng,
      position.latitude, position.longitude
    );
    return Math.min(95, Math.max(0, (distCovered / totalDistance) * 100));
  }, [position, phase, ride.pickup, ride.destination]);

  // Calculer la distance réelle entre le chauffeur et la position de l'utilisateur
  const distanceToUser = useMemo(() => {
    if (!position) return 0;

    // Utiliser la position GPS réelle de l'utilisateur si disponible via le hook
    // Sinon, utiliser le point de pickup comme approximation de la position utilisateur
    if (userGpsPosition) {
      return calculateDistance(
        position.latitude, position.longitude,
        userGpsPosition.lat, userGpsPosition.lng
      );
    }

    // Fallback : distance chauffeur → point de prise en charge
    if (phase === 'driver_approaching' || phase === 'pickup_reached' || phase === 'waiting_gps') {
      return calculateDistance(
        position.latitude, position.longitude,
        ride.pickup.lat, ride.pickup.lng
      );
    }

    // En transit / arrivée : distance vers la destination
    return calculateDistance(
      position.latitude, position.longitude,
      ride.destination.lat, ride.destination.lng
    );
  }, [position, userGpsPosition, phase, ride.pickup, ride.destination]);

  // Système de notifications — alerte quand le chauffeur arrive
  // Tient compte de la position GPS réelle de l'utilisateur
  const { permissionGranted, requestPermission } = useRideNotifications({
    phase,
    config: {
      driverName: ride.driver.name,
      vehiclePlate: ride.driver.plate,
      pickupName: userLocationName, // Position réelle de l'utilisateur, PAS le pickup fixe
      destinationName: ride.destination.name,
      eta,
      distanceToUser,
      userPosition: userGpsPosition,
      driverPosition: position ? { lat: position.latitude, lng: position.longitude } : null,
    },
    enabled: true,
  });

  const getPhaseLabel = () => {
    switch (phase) {
      case 'waiting_gps': return 'Connexion au GPS du véhicule...';
      case 'driver_approaching': return 'Chauffeur en approche';
      case 'pickup_reached': return 'Le chauffeur est près de vous';
      case 'in_transit': return 'En route vers la destination';
      case 'arriving': return 'Arrivée imminente';
      case 'completed': return 'Course terminée';
    }
  };

  const getPhaseColor = () => {
    switch (phase) {
      case 'waiting_gps': return 'bg-gray-500';
      case 'driver_approaching': return 'bg-blue-500';
      case 'pickup_reached': return 'bg-amber-500';
      case 'in_transit': return 'bg-green-500';
      case 'arriving': return 'bg-[hsl(45,65%,47%)]';
      case 'completed': return 'bg-[hsl(195,50%,25%)]';
    }
  };

  // Formater le temps depuis la dernière mise à jour GPS
  const getLastUpdateText = () => {
    if (!lastUpdate) return 'Jamais';
    const seconds = Math.round((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 10) return 'À l\'instant';
    if (seconds < 60) return `Il y a ${seconds}s`;
    return `Il y a ${Math.round(seconds / 60)} min`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/rides')} className="p-2 hover:bg-muted rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Suivi GPS en direct</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Indicateur de connexion GPS */}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isConnected ? 'GPS actif' : 'Hors ligne'}</span>
            </div>
            <Badge className={`${getPhaseColor()} text-white text-xs`}>
              {phase === 'in_transit' ? 'EN COURS' : phase === 'completed' ? 'TERMINÉE' : 'LIVE'}
            </Badge>
          </div>
        </div>
      </header>

      {/* Bannière d'arrivée du chauffeur */}
      {showArrivalBanner && (
        <div className="relative z-40 animate-in slide-in-from-top duration-500">
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-3 shadow-lg">
            <div className="max-w-2xl mx-auto flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                <BellRing className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm">Votre chauffeur est arrivé !</p>
                <p className="text-xs text-white/90">
                  {ride.driver.name} ({ride.driver.plate}) est près de vous. Rejoignez-le !
                </p>
              </div>
              <button
                onClick={() => setShowArrivalBanner(false)}
                className="p-1 hover:bg-white/20 rounded-full text-white/80"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demande de permission notifications */}
      {!permissionGranted && phase === 'driver_approaching' && (
        <div className="relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Bell className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-xs text-blue-700 flex-1">
              Activez les notifications pour être alerté quand votre chauffeur arrive.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={requestPermission}
              className="text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
            >
              Activer
            </Button>
          </div>
        </div>
      )}

      {/* Map - takes most of the screen */}
      <div className="flex-1 relative">
        <RideMap
          pickupLat={ride.pickup.lat}
          pickupLng={ride.pickup.lng}
          destinationLat={ride.destination.lat}
          destinationLng={ride.destination.lng}
          driverLat={driverPos.lat}
          driverLng={driverPos.lng}
          driverHeading={driverHeading}
          showRoute={true}
          showDriverTrail={true}
          followDriver={followDriver}
          className="h-full w-full"
        />

        {/* Follow toggle */}
        <button
          onClick={() => setFollowDriver(!followDriver)}
          className={`absolute top-4 right-4 z-[1000] p-3 rounded-full shadow-lg transition-colors ${
            followDriver ? 'bg-[hsl(195,50%,25%)] text-white' : 'bg-white text-gray-700'
          }`}
        >
          <Navigation className="w-5 h-5" />
        </button>

        {/* ETA overlay */}
        {phase !== 'completed' && phase !== 'waiting_gps' && (
          <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[hsl(195,50%,25%)]" />
              <span className="text-sm font-medium">ETA</span>
              <span className="text-lg font-bold text-[hsl(195,50%,25%)]">{eta} min</span>
            </div>
            {vehicleSpeed > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{Math.round(vehicleSpeed)} km/h</p>
            )}
          </div>
        )}

        {/* GPS signal info */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span>GPS véhicule • {getLastUpdateText()}</span>
            {!isConnected && (
              <button onClick={refresh} className="ml-1 p-1 hover:bg-gray-100 rounded">
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
          {position?.accuracy && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Précision : ±{Math.round(position.accuracy)}m
            </p>
          )}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="bg-white border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {/* Erreur GPS */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <WifiOff className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
              <Button size="sm" variant="outline" onClick={refresh} className="ml-auto text-xs">
                <RefreshCw className="w-3 h-3 mr-1" /> Réessayer
              </Button>
            </div>
          )}

          {/* Phase indicator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[hsl(195,50%,25%)]">{getPhaseLabel()}</p>
              {isLoading && <span className="text-xs text-muted-foreground">Chargement...</span>}
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Driver info card */}
          <Card className="border-0 shadow-none bg-gray-50">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[hsl(195,50%,25%)]/10 flex items-center justify-center text-2xl">
                    {ride.driver.photo}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{ride.driver.name}</p>
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-[hsl(45,65%,47%)] text-[hsl(45,65%,47%)]" />
                      <span className="text-xs text-muted-foreground">{ride.driver.rating}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{ride.driver.vehicle}</p>
                    <p className="text-xs font-mono text-muted-foreground">{ride.driver.plate}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="outline" className="rounded-full h-10 w-10">
                    <Phone className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="outline" className="rounded-full h-10 w-10">
                    <MessageSquare className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Route info */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex flex-col items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-[hsl(45,65%,47%)]" />
              <div className="w-0.5 h-6 bg-gray-300" />
              <div className="w-3 h-3 rounded-full bg-[hsl(195,50%,25%)]" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[hsl(45,65%,47%)]" />
                <span className="text-sm">{ride.pickup.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-[hsl(195,50%,25%)]" />
                <span className="text-sm">{ride.destination.name}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-[hsl(195,50%,25%)]">{formatPrice(ride.price)}</p>
              <p className="text-xs text-muted-foreground">{ride.distance} km</p>
            </div>
          </div>

          {/* Safety badge + Share position */}
          <div className="flex items-center gap-2 py-2 px-3 bg-green-50 rounded-lg">
            <Shield className="w-4 h-4 text-green-600" />
            <span className="text-xs text-green-700">Course sécurisée • GPS véhicule</span>
            <div className="ml-auto">
              <SharePosition
                driverName={ride.driver.name}
                driverPlate={ride.driver.plate}
                pickupName={ride.pickup.name}
                destinationName={ride.destination.name}
                driverLat={driverPos.lat}
                driverLng={driverPos.lng}
                eta={eta}
              />
            </div>
          </div>

          {/* Completed state */}
          {phase === 'completed' && (
            <div className="text-center space-y-3 py-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <Car className="w-8 h-8 text-green-600" />
              </div>
              <p className="font-semibold text-lg">Vous êtes arrivé !</p>
              <p className="text-sm text-muted-foreground">Merci d'avoir choisi EDEN VTC</p>
              <Button
                onClick={() => navigate('/rides')}
                className="w-full bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white"
              >
                Voir mes courses
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}