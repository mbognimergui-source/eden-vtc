import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Zap, Phone, ShieldCheck, ArrowLeft, Loader2, MessageSquare, MessageCircle, User, MapPin } from 'lucide-react';
import {
  requestPhoneCode,
  verifyPhoneCode,
  savePhoneProfile,
  extractErrorMessage,
  formatPhoneForDisplay,
  isPlausiblePhone,
  type OtpChannel,
} from '@/lib/phoneAuth';

type Step = 'phone' | 'code' | 'profile';

const CITIES = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Bamenda', 'Kribi'];

export default function PhoneLogin() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('phone');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [phoneInput, setPhoneInput] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [usedChannel, setUsedChannel] = useState<OtpChannel>('sms');
  const [codeLength, setCodeLength] = useState(6);
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [city, setCity] = useState('Douala');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const timerRef = useRef<number | null>(null);

  // Compte à rebours avant de pouvoir redemander un code
  useEffect(() => {
    if (resendIn <= 0) return;
    timerRef.current = window.setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [resendIn]);

  const sendCode = useCallback(
    async (rawPhone: string, isResend = false, sendChannel: OtpChannel = channel) => {
      setError('');

      if (!isPlausiblePhone(rawPhone)) {
        setError('Numéro invalide. Format attendu : 6XX XX XX XX (Cameroun).');
        return;
      }

      setSubmitting(true);
      try {
        const result = await requestPhoneCode(
          `+237${rawPhone.replace(/\D/g, '').replace(/^237/, '').replace(/^0+/, '')}`,
          sendChannel
        );
        setNormalizedPhone(result.phone);
        setMaskedPhone(result.masked_phone);
        setUsedChannel(result.channel || sendChannel);
        setCodeLength(result.code_length || 6);
        setResendIn(result.resend_after || 60);
        setStep('code');
        setCode('');

        const channelLabel = (result.channel || sendChannel) === 'whatsapp' ? 'WhatsApp' : 'SMS';
        if (result.dev_code) {
          toast.info(`Mode test : code ${result.dev_code}`, { duration: 15000 });
        } else {
          toast.success(isResend ? `Nouveau code envoyé par ${channelLabel}.` : `Code envoyé par ${channelLabel}.`);
        }
      } catch (err) {
        setError(extractErrorMessage(err, "Impossible d'envoyer le code. Réessayez."));
      } finally {
        setSubmitting(false);
      }
    },
    [channel]
  );

  const handleVerify = async () => {
    setError('');
    const cleaned = code.replace(/\D/g, '');

    if (cleaned.length !== codeLength) {
      setError(`Le code contient ${codeLength} chiffres.`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await verifyPhoneCode(normalizedPhone, cleaned);
      if (result.profile_complete) {
        toast.success('Connexion réussie. Bienvenue chez EDEN VTC !');
        navigate('/book');
        return;
      }
      setFirstName(result.first_name || '');
      setCity(result.city || 'Douala');
      setStep('profile');
    } catch (err) {
      setError(extractErrorMessage(err, 'Code incorrect. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async () => {
    setError('');

    if (firstName.trim().length < 2) {
      setError('Veuillez saisir votre prénom.');
      return;
    }
    if (city.trim().length < 2) {
      setError('Veuillez indiquer votre ville.');
      return;
    }

    setSubmitting(true);
    try {
      await savePhoneProfile(firstName.trim(), city.trim());
      toast.success(`Bienvenue ${firstName.trim()} !`);
      navigate('/book');
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer le profil."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(195,50%,25%)] to-[hsl(195,45%,18%)] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <span className="text-2xl font-bold text-white tracking-tight">EDEN VTC</span>
      </div>

      <Card className="w-full max-w-md border-0 shadow-2xl rounded-3xl">
        <CardContent className="p-7 space-y-5">
          {/* Étape 1 : numéro de téléphone */}
          {step === 'phone' && (
            <>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[hsl(195,50%,25%)]/10 flex items-center justify-center mx-auto">
                  <Phone className="w-6 h-6 text-[hsl(195,50%,25%)]" />
                </div>
                <h1 className="text-xl font-bold text-[hsl(195,50%,25%)]">Connexion par téléphone</h1>
                <p className="text-sm text-muted-foreground">
                  Saisissez votre numéro. Vous recevrez un code de confirmation par {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Recevoir le code par</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel('sms')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors ${
                      channel === 'sms'
                        ? 'bg-[hsl(195,50%,25%)] text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannel('whatsapp')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors ${
                      channel === 'whatsapp'
                        ? 'bg-[hsl(142,45%,32%)] text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Numéro de téléphone</Label>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2.5 rounded-xl bg-muted text-sm font-semibold text-foreground shrink-0">
                    +237
                  </span>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="6XX XX XX XX"
                    value={formatPhoneForDisplay(phoneInput)}
                    onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !submitting) sendCode(phoneInput);
                    }}
                    className="rounded-xl"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Exemple : 6 90 12 34 56</p>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>}

              <Button
                onClick={() => sendCode(phoneInput)}
                disabled={submitting}
                className="w-full btn-press bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white rounded-xl py-6 text-base"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : channel === 'whatsapp' ? (
                  <MessageCircle className="w-5 h-5 mr-2" />
                ) : (
                  <MessageSquare className="w-5 h-5 mr-2" />
                )}
                {submitting ? 'Envoi en cours...' : 'Recevoir mon code'}
              </Button>

              <button
                onClick={() => navigate('/')}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Retour à l'accueil
              </button>
            </>
          )}

          {/* Étape 2 : code OTP */}
          {step === 'code' && (
            <>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <h1 className="text-xl font-bold text-[hsl(195,50%,25%)]">Saisissez votre code</h1>
                <p className="text-sm text-muted-foreground">
                  Code à {codeLength} chiffres envoyé par {usedChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} au{' '}
                  <span className="font-semibold">{maskedPhone}</span>. Il expire dans 5 minutes.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Code de confirmation</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, codeLength))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !submitting) handleVerify();
                  }}
                  className="rounded-xl text-center text-2xl tracking-[0.4em] font-bold py-6"
                />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>}

              <Button
                onClick={handleVerify}
                disabled={submitting}
                className="w-full btn-press bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white rounded-xl py-6 text-base"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {submitting ? 'Vérification...' : 'Valider et me connecter'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => {
                    setStep('phone');
                    setError('');
                  }}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Changer de numéro
                </button>
                <button
                  onClick={() => sendCode(phoneInput, true, usedChannel)}
                  disabled={resendIn > 0 || submitting}
                  className="font-medium text-[hsl(195,50%,25%)] disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  {resendIn > 0 ? `Renvoyer (${resendIn}s)` : 'Renvoyer le code'}
                </button>
              </div>
            </>
          )}

          {/* Étape 3 : profil minimal */}
          {step === 'profile' && (
            <>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[hsl(45,65%,47%)]/15 flex items-center justify-center mx-auto">
                  <User className="w-6 h-6 text-[hsl(45,65%,47%)]" />
                </div>
                <h1 className="text-xl font-bold text-[hsl(195,50%,25%)]">Dernière étape</h1>
                <p className="text-sm text-muted-foreground">
                  Votre prénom et votre ville permettent au chauffeur de vous identifier.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first-name">Prénom</Label>
                <Input
                  id="first-name"
                  type="text"
                  autoComplete="given-name"
                  placeholder="Ex : Aline"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value.slice(0, 60))}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  type="text"
                  placeholder="Ex : Douala"
                  value={city}
                  onChange={(e) => setCity(e.target.value.slice(0, 60))}
                  className="rounded-xl"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  {CITIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCity(c)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        city === c
                          ? 'bg-[hsl(195,50%,25%)] text-white'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <MapPin className="w-3 h-3" />
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>}

              <Button
                onClick={handleSaveProfile}
                disabled={submitting}
                className="w-full btn-press bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white rounded-xl py-6 text-base"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {submitting ? 'Enregistrement...' : 'Commencer à commander'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-white/50 mt-6 text-center max-w-sm">
        En continuant, vous acceptez de recevoir un message de vérification par SMS ou WhatsApp selon votre choix. Ne
        partagez jamais votre code avec un tiers.
      </p>
    </div>
  );
}