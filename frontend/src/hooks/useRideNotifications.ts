import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from '@/hooks/use-toast';

type RidePhase = 'waiting_gps' | 'driver_approaching' | 'pickup_reached' | 'in_transit' | 'arriving' | 'completed';

interface NotificationConfig {
  driverName: string;
  vehiclePlate: string;
  pickupName: string;
  destinationName: string;
  eta: number; // ETA en minutes
  /** Distance en mètres entre le chauffeur et l'utilisateur */
  distanceToUser: number;
  /** Position GPS de l'utilisateur (si disponible) */
  userPosition?: { lat: number; lng: number } | null;
  /** Position GPS du chauffeur */
  driverPosition?: { lat: number; lng: number } | null;
}

interface UseRideNotificationsOptions {
  phase: RidePhase;
  config: NotificationConfig;
  enabled?: boolean;
}

/**
 * Hook pour gérer les notifications de course EDEN VTC.
 * Tient compte de la position géographique réelle de l'utilisateur.
 * Envoie des notifications navigateur + toast + vibration quand :
 * - Le chauffeur est à moins de 500m de l'utilisateur
 * - Le chauffeur est à 2 min de l'utilisateur (basé sur distance GPS réelle)
 * - Le chauffeur est arrivé au niveau de l'utilisateur (< 80m)
 * - Le passager arrive à destination
 * - La course est terminée
 */
export function useRideNotifications({ phase, config, enabled = true }: UseRideNotificationsOptions) {
  const previousPhaseRef = useRef<RidePhase | null>(null);
  const notificationPermissionRef = useRef<NotificationPermission>('default');
  const etaNotifiedRef = useRef(false);
  const distance500mNotifiedRef = useRef(false);
  const distance200mNotifiedRef = useRef(false);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);

  // Obtenir la position GPS de l'utilisateur
  useEffect(() => {
    if (!enabled) return;

    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // Fallback : utiliser la position de pickup comme approximation
        // (l'utilisateur est probablement proche de son point de prise en charge)
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  // Demander la permission pour les notifications au montage
  useEffect(() => {
    if (!enabled) return;

    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        notificationPermissionRef.current = 'granted';
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          notificationPermissionRef.current = permission;
        });
      }
    }
  }, [enabled]);

  // Envoyer une notification navigateur
  const sendBrowserNotification = useCallback((title: string, body: string, icon?: string) => {
    if (!('Notification' in window)) return;
    if (notificationPermissionRef.current !== 'granted') return;

    try {
      const notification = new Notification(title, {
        body,
        icon: icon || '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'eden-vtc-ride',
        renotify: true,
        vibrate: [200, 100, 200],
      });

      setTimeout(() => notification.close(), 8000);
    } catch {
      // Fallback silencieux
    }
  }, []);

  // Vibrer le téléphone
  const vibrate = useCallback((pattern: number[]) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Pas de vibration disponible
      }
    }
  }, []);

  // Envoyer un toast in-app
  const sendToast = useCallback((title: string, description: string, variant?: 'default' | 'destructive') => {
    toast({
      title,
      description,
      variant: variant || 'default',
    });
  }, []);

  // Formater la distance pour l'affichage
  const formatDistance = useCallback((meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }, []);

  // Notification basée sur la distance réelle chauffeur → utilisateur
  useEffect(() => {
    if (!enabled) return;
    if (phase !== 'driver_approaching') return;

    const distToUser = config.distanceToUser;

    // Notification à 500m de l'utilisateur
    if (distToUser <= 500 && distToUser > 200 && !distance500mNotifiedRef.current) {
      distance500mNotifiedRef.current = true;

      const title = '🚗 Votre chauffeur est à proximité !';
      const body = `${config.driverName} est près de vous (${formatDistance(distToUser)}). Préparez-vous, il arrive dans environ ${config.eta} min.`;

      sendBrowserNotification(title, body);
      sendToast(title, body);
      vibrate([200, 100, 200]);
    }

    // Notification à 200m de l'utilisateur
    if (distToUser <= 200 && distToUser > 80 && !distance200mNotifiedRef.current) {
      distance200mNotifiedRef.current = true;

      const title = '🚗 Le chauffeur est près de vous !';
      const body = `${config.driverName} (${config.vehiclePlate}) est tout près. Sortez pour le rejoindre !`;

      sendBrowserNotification(title, body);
      sendToast(title, body);
      vibrate([200, 100, 200, 100, 200]);
    }

    // Notification ETA ≤ 2 min (basée sur la distance réelle vers l'utilisateur)
    if (config.eta <= 2 && !etaNotifiedRef.current) {
      etaNotifiedRef.current = true;

      const title = '⏱️ Le chauffeur est près de vous dans 2 min !';
      const body = `${config.driverName} arrive dans ${config.eta} min. Préparez-vous.`;

      sendBrowserNotification(title, body);
      sendToast(title, body);
      vibrate([200, 100, 200, 100, 200]);
    }
  }, [phase, config.distanceToUser, config.eta, config.driverName, config.vehiclePlate, enabled, sendBrowserNotification, sendToast, vibrate, formatDistance]);

  // Réagir aux changements de phase
  useEffect(() => {
    if (!enabled) return;
    if (previousPhaseRef.current === phase) return;

    const prevPhase = previousPhaseRef.current;
    previousPhaseRef.current = phase;

    // Ne pas notifier au premier rendu
    if (prevPhase === null) return;

    // Réinitialiser les flags de distance quand on change de phase
    if (phase !== 'driver_approaching') {
      distance500mNotifiedRef.current = false;
      distance200mNotifiedRef.current = false;
      etaNotifiedRef.current = false;
    }

    switch (phase) {
      case 'pickup_reached': {
        const title = '✅ Votre chauffeur est arrivé !';
        const body = `${config.driverName} (${config.vehiclePlate}) est près de vous. Rejoignez-le maintenant !`;

        sendBrowserNotification(title, body);
        sendToast(title, body);
        vibrate([300, 150, 300, 150, 300, 150, 300]);
        break;
      }

      case 'in_transit': {
        const title = '🛣️ Course en cours';
        const body = `Vous êtes en route vers ${config.destinationName} avec ${config.driverName}. Distance restante : ${formatDistance(config.distanceToUser)}.`;

        sendBrowserNotification(title, body);
        sendToast(title, body);
        vibrate([100]);
        break;
      }

      case 'arriving': {
        const title = '📍 Arrivée imminente !';
        const body = `Vous êtes à ${formatDistance(config.distanceToUser)} de ${config.destinationName}. Préparez vos affaires.`;

        sendBrowserNotification(title, body);
        sendToast(title, body);
        vibrate([200, 100, 200, 100, 400]);
        break;
      }

      case 'completed': {
        const title = '🎉 Course terminée !';
        const body = `Vous êtes arrivé à ${config.destinationName}. Merci d'avoir choisi EDEN VTC !`;

        sendBrowserNotification(title, body);
        sendToast(title, body);
        vibrate([100, 50, 100, 50, 300]);
        break;
      }
    }
  }, [phase, config, enabled, sendBrowserNotification, sendToast, vibrate, formatDistance]);

  // Demander la permission manuellement
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;

    const permission = await Notification.requestPermission();
    notificationPermissionRef.current = permission;
    return permission === 'granted';
  }, []);

  return {
    permissionGranted: notificationPermissionRef.current === 'granted',
    requestPermission,
    userPosition,
  };
}