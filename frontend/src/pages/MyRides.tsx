import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { client } from '@/lib/client';
import { t } from '@/lib/i18n';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import { ArrowLeft, MapPin, Navigation, Clock, Leaf, Star } from 'lucide-react';
import BottomNav from '@/components/BottomNav';

export default function MyRides() {
  const navigate = useNavigate();
  const { formatPrice } = useCountryTariff();
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRides();
  }, []);

  const loadRides = async () => {
    try {
      const res = await client.entities.rides.query({ query: {}, sort: '-created_at', limit: 50 });
      if (res?.data?.items) {
        setRides(res.data.items);
      }
    } catch (e) {
      console.error('Failed to load rides', e);
    }
    setLoading(false);
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    accepted: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const statusLabels: Record<string, string> = {
    pending: 'En attente',
    accepted: 'Acceptée',
    in_progress: 'En cours',
    completed: 'Terminée',
    cancelled: 'Annulée',
  };

  return (
    <div className="min-h-screen bg-background pb-bottom-nav">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-border/40 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-muted/60 rounded-xl transition-colors duration-200">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">{t('nav.rides')}</h1>
          {rides.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs rounded-full px-2.5">
              {rides.length} courses
            </Badge>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 page-enter">
        {loading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-shimmer h-32 rounded-2xl" />
            ))}
          </div>
        ) : rides.length === 0 ? (
          <div className="text-center py-16 space-y-4 fade-scale-in">
            <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
              <MapPin className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground font-medium">Aucune course pour le moment</p>
            <p className="text-sm text-muted-foreground/70">Vos courses apparaîtront ici</p>
          </div>
        ) : (
          rides.map((ride, index) => (
            <Card key={ride.id} className={`card-interactive border-border/50 rounded-2xl overflow-hidden fade-scale-in stagger-${Math.min(index + 1, 6)}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className={`${statusColors[ride.status] || 'bg-gray-100 text-gray-800'} rounded-full px-2.5 text-xs font-medium`}>
                    {statusLabels[ride.status] || ride.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {ride.created_at ? new Date(ride.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[hsl(45,65%,47%)]/10 flex items-center justify-center mt-0.5 shrink-0">
                      <MapPin className="w-3 h-3 text-[hsl(45,65%,47%)]" />
                    </div>
                    <span className="text-sm">{ride.pickup_address}</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[hsl(195,50%,25%)]/10 flex items-center justify-center mt-0.5 shrink-0">
                      <Navigation className="w-3 h-3 text-[hsl(195,50%,25%)]" />
                    </div>
                    <span className="text-sm">{ride.destination_address}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-border/50">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {ride.distance_km && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {ride.distance_km} km
                      </span>
                    )}
                    {ride.co2_saved && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <Leaf className="w-3 h-3" />
                        {ride.co2_saved}g
                      </span>
                    )}
                    {ride.rating && (
                      <span className="flex items-center gap-1 text-amber-500">
                        <Star className="w-3 h-3 fill-current" />
                        {ride.rating}
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-[hsl(195,50%,25%)]">
                    {formatPrice(ride.final_price || ride.estimated_price || 0)}
                  </span>
                </div>
                {ride.payment_status === 'debt' && (
                  <Badge variant="destructive" className="text-xs rounded-full">Dette non régularisée</Badge>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>
      <BottomNav />
    </div>
  );
}