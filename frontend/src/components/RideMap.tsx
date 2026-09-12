import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons for Leaflet in bundled apps
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export interface TrafficSegmentData {
  id: string;
  coords: [number, number][];
  level: 'low' | 'moderate' | 'heavy' | 'severe';
}

export interface NearbyDriverData {
  driver_id: number;
  latitude: number;
  longitude: number;
  heading?: number;
  distance_km?: number;
}

interface RideMapProps {
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  driverLat?: number;
  driverLng?: number;
  driverHeading?: number;
  userLat?: number;
  userLng?: number;
  nearbyDrivers?: NearbyDriverData[];
  showRoute?: boolean;
  showDriverTrail?: boolean;
  followDriver?: boolean;
  autoLocate?: boolean;
  trafficSegments?: TrafficSegmentData[];
  className?: string;
}

// ─── EDEN VTC Premium Marker Icons ───────────────────────────────────────────

const createPickupIcon = () => {
  return L.divIcon({
    className: 'eden-pickup-marker',
    html: `<div class="eden-marker-container">
      <div style="
        position: relative;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(201, 162, 39, 0.15);
          animation: eden-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        "></div>
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 50% 50% 50% 4px;
          background: linear-gradient(135deg, #C9A227 0%, #e6c84a 100%);
          border: 3px solid white;
          box-shadow: 0 4px 14px rgba(201, 162, 39, 0.4), 0 2px 6px rgba(0,0,0,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotate(-45deg);
        ">
          <span style="
            transform: rotate(45deg);
            font-size: 16px;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
          ">📍</span>
        </div>
      </div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 40],
    popupAnchor: [0, -40],
  });
};

const createDestinationIcon = () => {
  return L.divIcon({
    className: 'eden-dest-marker',
    html: `<div class="eden-marker-container">
      <div style="
        position: relative;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(31, 78, 95, 0.15);
          animation: eden-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          animation-delay: 0.5s;
        "></div>
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 50% 50% 50% 4px;
          background: linear-gradient(135deg, #1F4E5F 0%, #2d7a94 100%);
          border: 3px solid white;
          box-shadow: 0 4px 14px rgba(31, 78, 95, 0.4), 0 2px 6px rgba(0,0,0,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotate(-45deg);
        ">
          <span style="
            transform: rotate(45deg);
            font-size: 16px;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
          ">🏁</span>
        </div>
      </div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 40],
    popupAnchor: [0, -40],
  });
};

const createDriverIcon = (heading: number = 0) => {
  return L.divIcon({
    className: 'eden-driver-marker',
    html: `<div style="
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(${heading}deg);
      transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    ">
      <div style="
        position: relative;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(22,163,106,0.3) 0%, transparent 70%);
          animation: eden-driver-pulse 1.5s ease-in-out infinite;
        "></div>
        <div style="
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
          border: 3px solid white;
          box-shadow: 0 4px 16px rgba(22,163,106,0.5), 0 2px 8px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        ">
          <span style="
            font-size: 20px;
            transform: rotate(-${heading}deg);
            transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
          ">🚗</span>
          <div style="
            position: absolute;
            top: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 10px solid #16a34a;
            filter: drop-shadow(0 -1px 2px rgba(0,0,0,0.2));
          "></div>
        </div>
      </div>
    </div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    popupAnchor: [0, -26],
  });
};

const createUserIcon = () => {
  return L.divIcon({
    className: 'eden-user-marker',
    html: `<div style="
      position: relative;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.2);
        animation: eden-user-pulse 2s ease-in-out infinite;
      "></div>
      <div style="
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(59,130,246,0.5), 0 1px 4px rgba(0,0,0,0.2);
      "></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

// ─── Map Styles CSS (injected once) ─────────────────────────────────────────

const EDEN_MAP_STYLES = `
  @keyframes eden-ping {
    0% { transform: scale(1); opacity: 1; }
    75% { transform: scale(1.8); opacity: 0; }
    100% { transform: scale(2); opacity: 0; }
  }
  @keyframes eden-driver-pulse {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.3); opacity: 0.4; }
  }
  @keyframes eden-user-pulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.6); opacity: 0.2; }
  }

  /* Custom zoom controls */
  .eden-map .leaflet-control-zoom {
    border: none !important;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
    border-radius: 12px !important;
    overflow: hidden;
  }
  .eden-map .leaflet-control-zoom a {
    background: rgba(255,255,255,0.95) !important;
    backdrop-filter: blur(8px);
    color: #1F4E5F !important;
    border: none !important;
    border-bottom: 1px solid rgba(31,78,95,0.1) !important;
    width: 36px !important;
    height: 36px !important;
    line-height: 36px !important;
    font-size: 18px !important;
    font-weight: 600 !important;
    transition: all 0.2s ease;
  }
  .eden-map .leaflet-control-zoom a:hover {
    background: #1F4E5F !important;
    color: white !important;
  }
  .eden-map .leaflet-control-zoom a:last-child {
    border-bottom: none !important;
  }

  /* Attribution styling */
  .eden-map .leaflet-control-attribution {
    background: rgba(255,255,255,0.7) !important;
    backdrop-filter: blur(4px);
    border-radius: 6px 0 0 0;
    font-size: 10px;
    padding: 2px 6px;
  }

  /* Popup styling */
  .eden-map .leaflet-popup-content-wrapper {
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    border: 1px solid rgba(31,78,95,0.1);
  }
  .eden-map .leaflet-popup-content {
    margin: 12px 16px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    color: #1F4E5F;
  }
  .eden-map .leaflet-popup-tip {
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  }

  /* Smooth tile loading */
  .eden-map .leaflet-tile {
    transition: opacity 0.3s ease;
  }
  .eden-map .leaflet-fade-anim .leaflet-tile {
    transition: opacity 0.3s ease;
  }

  /* Traffic tooltip styling */
  .eden-traffic-tooltip {
    background: rgba(31, 78, 95, 0.92) !important;
    backdrop-filter: blur(6px);
    color: white !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 6px 10px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
    letter-spacing: 0.02em;
  }
  .eden-traffic-tooltip::before {
    border-top-color: rgba(31, 78, 95, 0.92) !important;
  }
`;

// Inject styles once
let stylesInjected = false;
function injectMapStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = EDEN_MAP_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

// ─── Tile Layer Options ─────────────────────────────────────────────────────

// Modern, clean map style (Carto Voyager - colorful but elegant)
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

// ─── Main Component ─────────────────────────────────────────────────────────

// Traffic level colors
const TRAFFIC_COLORS: Record<string, string> = {
  low: '#22c55e',
  moderate: '#eab308',
  heavy: '#f97316',
  severe: '#ef4444',
};

export default function RideMap({
  pickupLat,
  pickupLng,
  destinationLat,
  destinationLng,
  driverLat,
  driverLng,
  driverHeading = 0,
  userLat,
  userLng,
  nearbyDrivers = [],
  showRoute = true,
  showDriverTrail = false,
  followDriver = false,
  autoLocate = true,
  trafficSegments = [],
  className = 'h-[300px] w-full rounded-xl overflow-hidden',
}: RideMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const trafficLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const nearbyDriversLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const trailPointsRef = useRef<L.LatLngExpression[]>([]);
  const initialFitDoneRef = useRef(false);
  const geolocatedRef = useRef(false);
  const [trafficLayerVisible, setTrafficLayerVisible] = useState(true);

  // Default center: Douala, Cameroun
  const defaultCenter: [number, number] = [4.0511, 9.7679];

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    injectMapStyles();

    // Use user location as initial center if available
    const center: [number, number] = (userLat && userLng) ? [userLat, userLng] : defaultCenter;

    mapInstanceRef.current = L.map(mapRef.current, {
      center,
      zoom: (userLat && userLng) ? 15 : 13,
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
    });

    // Add the elegant tile layer
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(mapInstanceRef.current);

    // Add eden-map class for custom styling
    mapRef.current.classList.add('eden-map');

    // Auto-locate user via browser Geolocation API if no user coords provided and autoLocate is enabled
    if (!userLat && !userLng && autoLocate && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const map = mapInstanceRef.current;
          if (!map || geolocatedRef.current) return;
          geolocatedRef.current = true;

          const { latitude, longitude } = pos.coords;

          // Only recenter if no markers have been placed yet
          if (!initialFitDoneRef.current && !pickupLat && !destinationLat && !driverLat) {
            map.setView([latitude, longitude], 15, { animate: true });
          }

          // Add user location marker
          if (userMarkerRef.current) {
            map.removeLayer(userMarkerRef.current);
          }
          userMarkerRef.current = L.marker([latitude, longitude], { icon: createUserIcon(), zIndexOffset: 500 })
            .addTo(map)
            .bindPopup('<strong>📍 Vous êtes ici</strong>');
        },
        () => {
          // Geolocation denied or failed — keep default center
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update user location marker when userLat/userLng props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userLat && userLng) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([userLat, userLng]);
      } else {
        userMarkerRef.current = L.marker([userLat, userLng], { icon: createUserIcon(), zIndexOffset: 500 })
          .addTo(map)
          .bindPopup('<strong>📍 Vous êtes ici</strong>');
      }

      // Center on user if no other markers and not yet fitted
      if (!initialFitDoneRef.current && !pickupLat && !destinationLat && !driverLat) {
        map.setView([userLat, userLng], 15, { animate: true });
      }
    }
  }, [userLat, userLng, pickupLat, destinationLat, driverLat]);

  // Update pickup marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (pickupMarkerRef.current) {
      map.removeLayer(pickupMarkerRef.current);
      pickupMarkerRef.current = null;
    }

    if (pickupLat && pickupLng) {
      pickupMarkerRef.current = L.marker([pickupLat, pickupLng], { icon: createPickupIcon() })
        .addTo(map)
        .bindPopup('<strong>📍 Point de départ</strong><br/><span style="color:#666">Position du client</span>');
    }
  }, [pickupLat, pickupLng]);

  // Update destination marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }

    if (destinationLat && destinationLng) {
      destMarkerRef.current = L.marker([destinationLat, destinationLng], { icon: createDestinationIcon() })
        .addTo(map)
        .bindPopup('<strong>🏁 Destination</strong><br/><span style="color:#666">Point d\'arrivée</span>');
    }
  }, [destinationLat, destinationLng]);

  // Update driver marker with smooth animation
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (driverLat && driverLng) {
      const newLatLng = L.latLng(driverLat, driverLng);

      if (driverMarkerRef.current) {
        // Smooth transition to new position
        const currentLatLng = driverMarkerRef.current.getLatLng();
        const steps = 30;
        const latStep = (newLatLng.lat - currentLatLng.lat) / steps;
        const lngStep = (newLatLng.lng - currentLatLng.lng) / steps;
        let step = 0;

        const animate = () => {
          step++;
          const lat = currentLatLng.lat + latStep * step;
          const lng = currentLatLng.lng + lngStep * step;
          driverMarkerRef.current?.setLatLng([lat, lng]);

          if (step < steps) {
            requestAnimationFrame(animate);
          }
        };
        requestAnimationFrame(animate);

        // Update icon with heading
        driverMarkerRef.current.setIcon(createDriverIcon(driverHeading));
      } else {
        driverMarkerRef.current = L.marker([driverLat, driverLng], {
          icon: createDriverIcon(driverHeading),
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindPopup('<strong>🚗 Chauffeur EDEN VTC</strong><br/><span style="color:#666">En route vers vous</span>');
      }

      // Add to trail
      if (showDriverTrail) {
        trailPointsRef.current.push([driverLat, driverLng]);
        if (trailRef.current) {
          trailRef.current.setLatLngs(trailPointsRef.current);
        } else {
          trailRef.current = L.polyline(trailPointsRef.current, {
            color: '#16a34a',
            weight: 3,
            opacity: 0.5,
            dashArray: '8, 12',
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);
        }
      }

      // Follow driver
      if (followDriver) {
        map.panTo([driverLat, driverLng], { animate: true, duration: 0.8 });
      }
    } else {
      if (driverMarkerRef.current) {
        map.removeLayer(driverMarkerRef.current);
        driverMarkerRef.current = null;
      }
    }
  }, [driverLat, driverLng, driverHeading, showDriverTrail, followDriver]);

  // Chauffeurs disponibles à proximité (avant qu'une course ne soit
  // commandée). Redessinés en bloc à chaque mise à jour de la liste, comme
  // le calque trafic ci-dessous.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (nearbyDriversLayerRef.current) {
      map.removeLayer(nearbyDriversLayerRef.current);
      nearbyDriversLayerRef.current = null;
    }

    if (nearbyDrivers.length > 0) {
      const markers = nearbyDrivers.map((d) =>
        L.marker([d.latitude, d.longitude], {
          icon: createDriverIcon(d.heading ?? 0),
          zIndexOffset: 400,
        }).bindPopup(
          `<strong>🚗 Chauffeur disponible</strong>${
            d.distance_km !== undefined ? `<br/><span style="color:#666">${d.distance_km.toFixed(1)} km</span>` : ''
          }`
        )
      );
      nearbyDriversLayerRef.current = L.layerGroup(markers).addTo(map);
    }
  }, [nearbyDrivers]);

  // Draw route with styled polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeRef.current) {
      map.removeLayer(routeRef.current);
      routeRef.current = null;
    }

    if (showRoute) {
      const routePoints: L.LatLngExpression[] = [];
      if (pickupLat && pickupLng) routePoints.push([pickupLat, pickupLng]);
      if (destinationLat && destinationLng) routePoints.push([destinationLat, destinationLng]);

      if (routePoints.length >= 2) {
        // Generate intermediate points for a more realistic route
        const start = routePoints[0] as [number, number];
        const end = routePoints[1] as [number, number];
        const intermediatePoints = generateRoutePoints(start, end);

        // Draw shadow line first for depth effect
        L.polyline(intermediatePoints, {
          color: 'rgba(31, 78, 95, 0.2)',
          weight: 10,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);

        // Main route line
        routeRef.current = L.polyline(intermediatePoints, {
          color: '#1F4E5F',
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
      }
    }
  }, [pickupLat, pickupLng, destinationLat, destinationLng, showRoute]);

  // Fit bounds on initial load
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || initialFitDoneRef.current) return;

    const bounds: L.LatLngExpression[] = [];
    if (pickupLat && pickupLng) bounds.push([pickupLat, pickupLng]);
    if (destinationLat && destinationLng) bounds.push([destinationLat, destinationLng]);
    if (driverLat && driverLng) bounds.push([driverLat, driverLng]);

    if (bounds.length > 0) {
      initialFitDoneRef.current = true;
      if (bounds.length === 1) {
        map.setView(bounds[0] as L.LatLngExpression, 15, { animate: true });
      } else {
        map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60], animate: true });
      }
    }
  }, [pickupLat, pickupLng, destinationLat, destinationLng, driverLat, driverLng]);

  // Draw traffic segments into a LayerGroup
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove existing traffic layer group
    if (trafficLayerGroupRef.current) {
      map.removeLayer(trafficLayerGroupRef.current);
      trafficLayerGroupRef.current = null;
    }

    // Create new traffic layer group
    if (trafficSegments && trafficSegments.length > 0) {
      const layers: L.Layer[] = [];

      trafficSegments.forEach((segment) => {
        const color = TRAFFIC_COLORS[segment.level] || TRAFFIC_COLORS.low;
        const weight = segment.level === 'severe' ? 7 : segment.level === 'heavy' ? 6 : 5;
        const opacity = segment.level === 'low' ? 0.5 : 0.75;

        // Shadow line for depth
        const shadow = L.polyline(segment.coords, {
          color: 'rgba(0,0,0,0.15)',
          weight: weight + 4,
          lineCap: 'round',
          lineJoin: 'round',
        });
        layers.push(shadow);

        // Main traffic line with tooltip
        const levelLabels: Record<string, string> = {
          low: 'Fluide',
          moderate: 'Modéré',
          heavy: 'Dense',
          severe: 'Très dense',
        };
        const line = L.polyline(segment.coords, {
          color,
          weight,
          opacity,
          lineCap: 'round',
          lineJoin: 'round',
        });
        line.bindTooltip(`Trafic : ${levelLabels[segment.level] || segment.level}`, {
          sticky: true,
          direction: 'top',
          className: 'eden-traffic-tooltip',
        });
        layers.push(line);
      });

      trafficLayerGroupRef.current = L.layerGroup(layers);
      if (trafficLayerVisible) {
        trafficLayerGroupRef.current.addTo(map);
      }
    }
  }, [trafficSegments, trafficLayerVisible]);

  // Toggle traffic layer visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = trafficLayerGroupRef.current;
    if (!map || !group) return;

    if (trafficLayerVisible) {
      if (!map.hasLayer(group)) {
        group.addTo(map);
      }
    } else {
      if (map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }, [trafficLayerVisible]);

  return (
    <div className={`relative ${className}`}>
      {/* Map container */}
      <div ref={mapRef} style={{ height: '100%', width: '100%', borderRadius: 'inherit' }} />
      
      {/* Subtle gradient overlay at top for better header readability */}
      <div 
        className="absolute top-0 left-0 right-0 h-12 pointer-events-none rounded-t-xl"
        style={{ 
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, transparent 100%)',
        }}
      />

      {/* Traffic layer toggle button */}
      {trafficSegments && trafficSegments.length > 0 && (
        <button
          onClick={() => setTrafficLayerVisible(!trafficLayerVisible)}
          className={`absolute top-2 right-2 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow-md text-xs font-semibold transition-all duration-200 ${
            trafficLayerVisible
              ? 'bg-white/95 text-[#1F4E5F] border border-[#1F4E5F]/20'
              : 'bg-gray-100/90 text-gray-500 border border-gray-300/50'
          }`}
          title={trafficLayerVisible ? 'Masquer le trafic' : 'Afficher le trafic'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span>{trafficLayerVisible ? 'Trafic' : 'Trafic OFF'}</span>
        </button>
      )}

      {/* Traffic legend */}
      {trafficLayerVisible && trafficSegments && trafficSegments.length > 0 && (
        <div className="absolute bottom-8 right-2 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-2.5 py-2 border border-gray-200/60">
          <p className="text-[10px] font-bold text-[#1F4E5F] mb-1 uppercase tracking-wide">Conditions trafic</p>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-1 rounded-full" style={{ backgroundColor: '#22c55e' }} />
              <span className="text-[9px] text-gray-600">Fluide</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-1 rounded-full" style={{ backgroundColor: '#eab308' }} />
              <span className="text-[9px] text-gray-600">Modéré</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-1 rounded-full" style={{ backgroundColor: '#f97316' }} />
              <span className="text-[9px] text-gray-600">Dense</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-1 rounded-full" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-[9px] text-gray-600">Très dense</span>
            </div>
          </div>
        </div>
      )}
      
      {/* EDEN VTC branding watermark */}
      <div className="absolute bottom-2 left-2 pointer-events-none">
        <span className="text-[10px] font-semibold text-[#1F4E5F]/40 tracking-wider uppercase">
          EDEN VTC
        </span>
      </div>
    </div>
  );
}

// Generate intermediate route points to simulate a realistic road path
function generateRoutePoints(start: [number, number], end: [number, number]): L.LatLngExpression[] {
  const points: L.LatLngExpression[] = [start];
  const segments = 10;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    // Add slight curve for more natural look
    const curve = Math.sin(t * Math.PI) * 0.002;
    const lat = start[0] + (end[0] - start[0]) * t + curve * (Math.random() > 0.5 ? 1 : -1);
    const lng = start[1] + (end[1] - start[1]) * t + curve * (Math.random() > 0.5 ? 1 : -1);
    points.push([lat, lng]);
  }

  points.push(end);
  return points;
}