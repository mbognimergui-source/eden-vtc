import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { MapPin, Navigation, Search, Globe, CheckCircle2, Loader2 } from 'lucide-react';
import { EDEN_CITIES } from '@/lib/geolocation';
import { useGeolocation } from '@/hooks/useGeolocation';

interface Props {
  onCityChange?: (city: string) => void;
}

export default function CitySelector({ onCityChange }: Props) {
  const { location, loading, error, isAvailable, refresh } = useGeolocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const cities = Object.entries(EDEN_CITIES);
  const filteredCities = cities.filter(([name, info]) =>
    name.toLowerCase().includes(search.toLowerCase()) ||
    info.country.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectCity = (cityName: string) => {
    // Update cached location
    const cityInfo = EDEN_CITIES[cityName];
    if (cityInfo) {
      const newLocation = {
        lat: cityInfo.lat,
        lng: cityInfo.lng,
        city: cityName,
        country: cityInfo.country,
        region: 'available' as const,
        displayName: `${cityName}, ${cityInfo.country}`,
      };
      localStorage.setItem('eden_vtc_user_location', JSON.stringify({ location: newLocation, timestamp: Date.now() }));
      onCityChange?.(cityName);
      setOpen(false);
      window.location.reload(); // Refresh to apply new city
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-sm font-medium hover:bg-white/10 text-white">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <MapPin className="w-3.5 h-3.5" />
          )}
          <span className="max-w-[120px] truncate">
            {loading ? 'Détection...' : location?.city || 'Choisir ville'}
          </span>
          {isAvailable && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Choisir votre ville
          </DialogTitle>
        </DialogHeader>

        {/* Current location */}
        <div className="p-3 bg-muted/50 rounded-lg mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {location?.displayName || 'Position non détectée'}
                </p>
                {error && <p className="text-xs text-muted-foreground">{error}</p>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
              <span className="ml-1 text-xs">GPS</span>
            </Button>
          </div>
          {!isAvailable && location && (
            <p className="text-xs text-amber-600 mt-2">
              EDEN VTC n'est pas encore disponible dans votre zone. Choisissez une ville ci-dessous.
            </p>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une ville ou un pays..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* City list */}
        <ScrollArea className="h-[300px] mt-2">
          <div className="space-y-1">
            {filteredCities.map(([name, info]) => {
              const isCurrentCity = location?.city === name;
              return (
                <button
                  key={name}
                  onClick={() => handleSelectCity(name)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
                    isCurrentCity ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className={`w-4 h-4 ${isCurrentCity ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{info.country}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{info.currency}</Badge>
                    {isCurrentCity && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                </button>
              );
            })}
            {filteredCities.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucune ville trouvée</p>
                <p className="text-xs mt-1">EDEN VTC s'étend bientôt à de nouvelles villes !</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}