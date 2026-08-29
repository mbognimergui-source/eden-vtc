import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { client } from '@/lib/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Star, Send, MessageSquare, CheckCircle2, Loader2 } from 'lucide-react';
import BottomNav from '@/components/BottomNav';

const CATEGORIES = [
  { value: 'app', label: '📱 Application', description: 'Interface, navigation, bugs' },
  { value: 'ride', label: '🚗 Course', description: 'Réservation, trajet, temps d\'attente' },
  { value: 'driver', label: '👨‍✈️ Chauffeur', description: 'Comportement, conduite, ponctualité' },
  { value: 'payment', label: '💳 Paiement', description: 'Portefeuille, tarifs, facturation' },
  { value: 'other', label: '💬 Autre', description: 'Suggestions, questions, remarques' },
];

export default function Feedback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [myFeedbacks, setMyFeedbacks] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadMyFeedbacks();
  }, []);

  const loadMyFeedbacks = async () => {
    try {
      const res = await client.entities.feedbacks.query({
        query: {},
        sort: '-created_at',
        limit: 10,
      });
      if (res?.data?.items) {
        setMyFeedbacks(res.data.items);
      }
    } catch (e) {
      // User might not be logged in
    }
    setLoadingHistory(false);
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({ title: 'Veuillez donner une note', variant: 'destructive' });
      return;
    }
    if (!category) {
      toast({ title: 'Veuillez choisir une catégorie', variant: 'destructive' });
      return;
    }
    if (!message.trim()) {
      toast({ title: 'Veuillez écrire votre message', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await client.entities.feedbacks.create({
        data: {
          rating,
          category,
          message: message.trim(),
          status: 'pending',
        },
      });
      setSubmitted(true);
      toast({ title: '✅ Merci pour votre retour !', description: 'Votre avis nous aide à améliorer EDEN VTC.' });
      loadMyFeedbacks();
    } catch (e: any) {
      toast({ title: e?.message || 'Erreur lors de l\'envoi', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setRating(0);
    setCategory('');
    setMessage('');
    setSubmitted(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reviewed':
        return <Badge className="bg-blue-100 text-blue-800 text-xs">Examiné</Badge>;
      case 'resolved':
        return <Badge className="bg-green-100 text-green-800 text-xs">Résolu</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 text-xs">En attente</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-bottom-nav">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-border/40 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-muted/60 rounded-xl transition-colors duration-200">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Vos retours</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Submission form */}
        {!submitted ? (
          <Card className="border-[#1F4E5F]/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="w-5 h-5 text-[#1F4E5F]" />
                Donnez-nous votre avis
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Votre retour nous aide à améliorer l'expérience EDEN VTC pour tous.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Rating */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Note globale</Label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 transition-colors ${
                          star <= (hoverRating || rating)
                            ? 'fill-[#C9A227] text-[#C9A227]'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      {rating === 1 ? 'Très insatisfait' :
                       rating === 2 ? 'Insatisfait' :
                       rating === 3 ? 'Correct' :
                       rating === 4 ? 'Satisfait' : 'Très satisfait'}
                    </span>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Catégorie</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        category === cat.value
                          ? 'border-[#1F4E5F] bg-[#1F4E5F]/5 ring-1 ring-[#1F4E5F]'
                          : 'border-gray-200 hover:border-[#1F4E5F]/30'
                      }`}
                    >
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Votre message</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Décrivez votre expérience, suggestion ou problème rencontré..."
                  className="min-h-[120px] resize-none"
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground text-right">{message.length}/1000</p>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={loading || rating === 0 || !category || !message.trim()}
                className="w-full bg-[#1F4E5F] hover:bg-[#1F4E5F]/90 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Envoyer mon retour
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Success state */
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-800">Merci pour votre retour !</h3>
                <p className="text-sm text-green-600 mt-1">
                  Votre avis a été enregistré et sera examiné par notre équipe.
                </p>
              </div>
              <Button onClick={resetForm} variant="outline" className="border-green-300 text-green-700">
                Envoyer un autre retour
              </Button>
            </CardContent>
          </Card>
        )}

        {/* History */}
        {myFeedbacks.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Mes retours précédents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {myFeedbacks.map((fb) => (
                  <div key={fb.id} className="p-3 rounded-lg border bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${
                                s <= fb.rating ? 'fill-[#C9A227] text-[#C9A227]' : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORIES.find(c => c.value === fb.category)?.label || fb.category}
                        </Badge>
                      </div>
                      {getStatusBadge(fb.status)}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{fb.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {fb.created_at ? new Date(fb.created_at).toLocaleDateString('fr-FR') : ''}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}