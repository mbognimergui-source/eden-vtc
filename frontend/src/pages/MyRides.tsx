import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { client } from '@/lib/client';
import { t } from '@/lib/i18n';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, MapPin, Navigation, Clock, Leaf, Star, Receipt, CreditCard, Calendar } from 'lucide-react';
import BottomNav from '@/components/BottomNav';

const paymentMethodLabels: Record<string, string> = {
  wallet: 'Portefeuille EDEN',
  cash: 'Espèces',
  orange_money: 'Orange Money',
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

export default function MyRides() {
  const navigate = useNavigate();
  const { formatPrice } = useCountryTariff();
  const { toast } = useToast();
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRide, setDetailRide] = useState<any | null>(null);
  const [ratingRide, setRatingRide] = useState<any | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

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

  const openRatingDialog = (ride: any) => {
    setRatingValue(0);
    setRatingComment('');
    setRatingRide(ride);
  };

  const submitRating = async () => {
    if (!ratingRide || ratingValue < 1) return;
    setSubmittingRating(true);
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/dispatch/rate-ride/${ratingRide.id}`,
        method: 'POST',
        data: { rating: ratingValue, comment: ratingComment.trim() || undefined },
      });
      if (res?.data?.success) {
        toast({ title: '✅ Merci pour votre avis !' });
        setRides((prev) =>
          prev.map((r) => (r.id === ratingRide.id ? { ...r, rating: ratingValue, comment: ratingComment.trim() || null } : r))
        );
        setRatingRide(null);
      }
    } catch (err) {
      const errAny = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = errAny?.response?.data?.detail;
      toast({
        title: '❌ Impossible d\'enregistrer la note',
        description: detail || errAny?.message || 'Réessayez plus tard.',
        variant: 'destructive',
      });
    }
    setSubmittingRating(false);
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
            <Card
              key={ride.id}
              onClick={() => setDetailRide(ride)}
              className={`card-interactive border-border/50 rounded-2xl overflow-hidden fade-scale-in stagger-${Math.min(index + 1, 6)} cursor-pointer`}
            >
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
                {ride.status === 'completed' && !ride.rating && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRatingDialog(ride);
                    }}
                  >
                    <Star className="w-3.5 h-3.5" />
                    Noter cette course
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>
      <BottomNav />

      {/* Détail de course / reçu */}
      <Dialog open={!!detailRide} onOpenChange={(open) => !open && setDetailRide(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[hsl(195,50%,25%)]" />
              Reçu de course
            </DialogTitle>
          </DialogHeader>
          {detailRide && (
            <div className="space-y-4 py-1">
              <div className="flex items-center justify-between">
                <Badge className={`${statusColors[detailRide.status] || 'bg-gray-100 text-gray-800'} rounded-full px-2.5 text-xs font-medium`}>
                  {statusLabels[detailRide.status] || detailRide.status}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {detailRide.created_at
                    ? new Date(detailRide.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : ''}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[hsl(45,65%,47%)]/10 flex items-center justify-center mt-0.5 shrink-0">
                    <MapPin className="w-3 h-3 text-[hsl(45,65%,47%)]" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Départ</p>
                    <p className="text-sm">{detailRide.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[hsl(195,50%,25%)]/10 flex items-center justify-center mt-0.5 shrink-0">
                    <Navigation className="w-3 h-3 text-[hsl(195,50%,25%)]" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Destination</p>
                    <p className="text-sm">{detailRide.destination_address}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
                {detailRide.distance_km != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Distance</p>
                    <p className="text-sm font-medium">{detailRide.distance_km} km</p>
                  </div>
                )}
                {detailRide.duration_min != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Durée</p>
                    <p className="text-sm font-medium">{detailRide.duration_min} min</p>
                  </div>
                )}
                {detailRide.co2_saved != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">CO2 économisé</p>
                    <p className="text-sm font-medium text-emerald-600">{detailRide.co2_saved} g</p>
                  </div>
                )}
                {detailRide.payment_method && (
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CreditCard className="w-3 h-3" /> Paiement
                    </p>
                    <p className="text-sm font-medium">
                      {paymentMethodLabels[detailRide.payment_method] || detailRide.payment_method}
                    </p>
                  </div>
                )}
              </div>

              {detailRide.rating && (
                <div className="border-t border-border/50 pt-3">
                  <p className="text-xs text-muted-foreground mb-1">Votre note</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`w-4 h-4 ${n <= detailRide.rating ? 'text-amber-500 fill-current' : 'text-muted-foreground/30'}`} />
                    ))}
                  </div>
                  {detailRide.comment && <p className="text-sm text-muted-foreground mt-1">« {detailRide.comment} »</p>}
                </div>
              )}

              {detailRide.payment_status === 'debt' && (
                <Badge variant="destructive" className="text-xs rounded-full">Dette non régularisée</Badge>
              )}

              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-xl font-bold text-[hsl(195,50%,25%)]">
                  {formatPrice(detailRide.final_price || detailRide.estimated_price || 0)}
                </span>
              </div>

              {detailRide.status === 'completed' && !detailRide.rating && (
                <Button
                  className="w-full gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => {
                    const ride = detailRide;
                    setDetailRide(null);
                    openRatingDialog(ride);
                  }}
                >
                  <Star className="w-4 h-4" />
                  Noter cette course
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Notation post-course */}
      <Dialog open={!!ratingRide} onOpenChange={(open) => !open && setRatingRide(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Notez votre course
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRatingValue(n)} className="p-1">
                  <Star className={`w-9 h-9 transition-colors ${n <= ratingValue ? 'text-amber-500 fill-current' : 'text-muted-foreground/30'}`} />
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Un commentaire pour le chauffeur (optionnel)"
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              rows={3}
            />
            <Button
              className="w-full bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white"
              disabled={ratingValue < 1 || submittingRating}
              onClick={submitRating}
            >
              {submittingRating ? 'Envoi...' : 'Envoyer ma note'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
