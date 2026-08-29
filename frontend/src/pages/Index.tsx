import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { phoneLogout } from '@/lib/phoneAuth';
import { t, getLang } from '@/lib/i18n';
import { useAutoLang } from '@/hooks/useAutoLang';
import { Zap, MapPin, Shield, Leaf, Car, Users, ChevronRight, Globe, Sparkles, Clock, ArrowRight } from 'lucide-react';
import CitySelector from '@/components/CitySelector';
import { useGeolocation } from '@/hooks/useGeolocation';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/hooks/useAuth';
import DebtAlertBanner from '@/components/DebtAlertBanner';

export default function HomePage() {
  const navigate = useNavigate();
  const { lang, switchLang } = useAutoLang();
  const { user, loading } = useAuth();
  const { location, isAvailable } = useGeolocation();

  const handleLogin = () => {
    navigate('/login');
  };

  const handleLogout = () => {
    phoneLogout();
    navigate('/');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background pb-bottom-nav">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-border/40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl eden-gradient flex items-center justify-center shadow-md shadow-[hsl(195,50%,25%)]/20">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-xl font-bold text-[hsl(195,50%,25%)] tracking-tight">EDEN VTC</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {user && (
              <>
                {[
                  { path: '/book', label: t('nav.book') },
                  { path: '/rides', label: t('nav.rides') },
                  { path: '/wallet', label: t('nav.wallet') },
                  { path: '/driver', label: t('nav.driver') },
                  { path: '/admin', label: t('nav.admin') },
                  { path: '/setup-access', label: 'Accès' },
                  { path: '/feedback', label: 'Retours' },
                ].map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg transition-all duration-200"
                  >
                    {item.label}
                  </button>
                ))}
              </>
            )}
          </nav>
          <div className="flex items-center gap-2.5">
            {/* Language toggle */}
            <button
              onClick={() => switchLang(lang === 'fr' ? 'en' : 'fr')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-foreground/70 hover:text-foreground transition-all duration-200 text-xs font-semibold"
              title={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
            >
              <Globe className="w-3.5 h-3.5" />
              {lang === 'fr' ? 'EN' : 'FR'}
            </button>
            {/* Location indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
              <MapPin className="w-3.5 h-3.5" />
              <span className="text-xs font-medium max-w-[100px] truncate">
                {location?.city || (lang === 'fr' ? 'Détection...' : 'Detecting...')}
              </span>
              {isAvailable && <span className="w-1.5 h-1.5 rounded-full status-dot-online" />}
            </div>
            {loading ? null : user ? (
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
                {t('nav.logout')}
              </Button>
            ) : (
              <Button onClick={handleLogin} className="btn-press bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white rounded-xl shadow-md shadow-[hsl(195,50%,25%)]/20">
                {t('nav.login')}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Debt Alert Banner */}
      {user && <DebtAlertBanner compact className="fixed top-16 left-0 right-0 z-40" />}

      {/* Hero Section */}
      <section className="pt-24 pb-12 px-4 page-enter">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Eco badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 fade-scale-in">
              <Leaf className="w-4 h-4" />
              <span className="text-sm font-medium">{t('home.eco')}</span>
              <Sparkles className="w-3.5 h-3.5 text-[hsl(45,65%,47%)]" />
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-[hsl(195,50%,25%)] leading-[1.1] tracking-tight slide-up-enter">
              {t('home.title')}
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto slide-up-enter stagger-1">
              {location?.city
                ? `Transport 100% électrique à ${location.city}`
                : t('home.subtitle')}
            </p>
            {!isAvailable && location && (
              <div className="inline-flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-4 py-2.5 rounded-xl border border-amber-100 fade-scale-in stagger-2">
                <Globe className="w-4 h-4 flex-shrink-0" />
                <span>EDEN VTC arrive bientôt à {location.city} ! Consultez nos villes disponibles.</span>
              </div>
            )}
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-6 slide-up-enter stagger-2">
              <Button
                size="lg"
                onClick={() => user ? navigate('/book') : handleLogin()}
                className="btn-press bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white text-base sm:text-lg px-8 py-6 rounded-2xl shadow-lg shadow-[hsl(195,50%,25%)]/25 group"
              >
                {t('home.cta')}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
              </Button>
              {user && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate('/track')}
                  className="btn-press text-base sm:text-lg px-8 py-6 rounded-2xl border-2 border-[hsl(195,50%,25%)]/20 text-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,25%)]/5"
                >
                  <MapPin className="mr-2 w-5 h-5" />
                  Suivre ma course
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions (logged in) */}
      {user && (
        <section className="px-4 pb-8 md:hidden">
          <div className="max-w-lg mx-auto">
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Car, label: 'Commander', path: '/book', color: 'bg-[hsl(195,50%,25%)]', textColor: 'text-white' },
                { icon: Clock, label: 'Historique', path: '/rides', color: 'bg-[hsl(45,65%,47%)]/10', textColor: 'text-[hsl(45,65%,47%)]' },
                { icon: MapPin, label: 'Suivi GPS', path: '/track', color: 'bg-emerald-50', textColor: 'text-emerald-700' },
              ].map((action, i) => (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className={`card-interactive flex flex-col items-center gap-2 p-4 rounded-2xl border border-border/50 fade-scale-in stagger-${i + 1}`}
                >
                  <div className={`w-12 h-12 rounded-xl ${action.color} flex items-center justify-center`}>
                    <action.icon className={`w-5 h-5 ${action.textColor}`} />
                  </div>
                  <span className="text-xs font-medium text-foreground">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-[hsl(195,50%,25%)] slide-up-enter">
              Pourquoi choisir EDEN VTC ?
            </h2>
            <p className="text-muted-foreground mt-2 slide-up-enter stagger-1">Un service premium, responsable et transparent</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Zap,
                title: '100% Électrique',
                desc: 'Flotte entièrement électrique. Zéro émission, confort premium et silence absolu.',
                gradient: 'from-emerald-50 to-teal-50',
                iconBg: 'bg-emerald-100',
                iconColor: 'text-emerald-600',
              },
              {
                icon: Shield,
                title: 'Courses prépayées',
                desc: 'Rechargez votre portefeuille. Possibilité de commander même à solde nul.',
                gradient: 'from-blue-50 to-indigo-50',
                iconBg: 'bg-blue-100',
                iconColor: 'text-blue-600',
              },
              {
                icon: MapPin,
                title: 'Suivi en temps réel',
                desc: 'Suivez votre chauffeur sur la carte avec GPS en direct. Plaque et modèle visibles.',
                gradient: 'from-amber-50 to-orange-50',
                iconBg: 'bg-amber-100',
                iconColor: 'text-amber-600',
              },
            ].map((feature, i) => (
              <Card key={feature.title} className={`card-interactive border-0 shadow-sm bg-gradient-to-br ${feature.gradient} overflow-hidden fade-scale-in stagger-${i + 1}`}>
                <CardContent className="p-7 space-y-4">
                  <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center`}>
                    <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-[hsl(195,50%,25%)] to-[hsl(195,45%,20%)] rounded-3xl p-8 sm:p-12 shadow-xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
              {[
                { icon: Car, value: '1000', label: 'Véhicules', color: 'text-white' },
                { icon: Users, value: '500+', label: 'Chauffeurs', color: 'text-white' },
                { icon: Leaf, value: '0g', label: 'CO₂ / course', color: 'text-[hsl(45,65%,70%)]' },
                { icon: MapPin, value: location?.city || 'Douala', label: 'Zone active', color: 'text-white' },
              ].map((stat, i) => (
                <div key={stat.label} className={`text-center space-y-2 count-up stagger-${i + 1}`}>
                  <stat.icon className={`w-7 h-7 mx-auto ${stat.color} opacity-80`} />
                  <p className={`text-2xl sm:text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-sm text-white/60">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-[hsl(195,50%,25%)]">
              Comment ça marche ?
            </h2>
            <p className="text-muted-foreground mt-2">3 étapes simples pour votre course</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { step: '1', title: 'Indiquez votre destination', desc: 'Entrez votre adresse ou utilisez le GPS automatique', icon: MapPin },
              { step: '2', title: 'Confirmez et payez', desc: 'Prix fixe affiché à l\'avance, paiement par portefeuille', icon: Shield },
              { step: '3', title: 'Suivez votre chauffeur', desc: 'Suivi GPS en temps réel jusqu\'à votre arrivée', icon: Car },
            ].map((item, i) => (
              <div key={item.step} className={`relative flex flex-col items-center text-center space-y-3 p-6 fade-scale-in stagger-${i + 1}`}>
                <div className="w-14 h-14 rounded-2xl bg-[hsl(195,50%,25%)] flex items-center justify-center shadow-lg shadow-[hsl(195,50%,25%)]/20">
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-[hsl(45,65%,47%)] flex items-center justify-center text-xs font-bold text-white shadow-sm md:static md:absolute md:-top-1 md:-right-1">
                  {item.step}
                </div>
                <h3 className="font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t bg-[hsl(195,50%,25%)]">
        <div className="max-w-7xl mx-auto text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-semibold">EDEN VTC</span>
          </div>
          <p className="text-white/70 text-sm">
            © 2026 EDEN VTC — Programme TACO EDEN MOBILITY
          </p>
          <p className="text-white/50 text-xs">
            ET PUIS QUOI ENCORE SARL · Yaoundé, Cameroun
          </p>
        </div>
      </footer>

      {/* Bottom Navigation (mobile) */}
      {user && <BottomNav />}
    </div>
  );
}