import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { setLangManual, Lang } from '@/lib/i18n';
import { Zap, Globe } from 'lucide-react';

const LANGUAGES: { code: Lang; label: string; flag: string; description: string }[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷', description: 'Continuer en français' },
  { code: 'en', label: 'English', flag: '🇬🇧', description: 'Continue in English' },
];

export default function Welcome() {
  const navigate = useNavigate();
  const [selectedLang, setSelectedLang] = useState<Lang | null>(null);

  const handleContinue = () => {
    if (selectedLang) {
      setLangManual(selectedLang);
      // Mark that the user has completed the welcome/language selection
      try {
        localStorage.setItem('eden_vtc_welcome_done', 'true');
      } catch { /* ignore */ }
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(195,50%,25%)] to-[hsl(195,50%,15%)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardContent className="p-8 space-y-8">
          {/* Logo & Title */}
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full eden-gradient flex items-center justify-center mx-auto shadow-lg">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[hsl(195,50%,25%)]">
              Bienvenue sur EDEN VTC
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome to EDEN VTC
            </p>
          </div>

          {/* Language Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[hsl(195,50%,25%)]">
              <Globe className="w-4 h-4" />
              <span>Choisissez votre langue / Choose your language</span>
            </div>

            <div className="grid gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLang(lang.code)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                    selectedLang === lang.code
                      ? 'border-[hsl(45,65%,47%)] bg-[hsl(45,65%,47%)]/5 shadow-md'
                      : 'border-gray-200 hover:border-[hsl(195,50%,25%)]/30 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-3xl">{lang.flag}</span>
                  <div className="text-left">
                    <p className="font-semibold text-[hsl(195,50%,25%)]">{lang.label}</p>
                    <p className="text-xs text-muted-foreground">{lang.description}</p>
                  </div>
                  {selectedLang === lang.code && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-[hsl(45,65%,47%)] flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Continue Button */}
          <Button
            onClick={handleContinue}
            disabled={!selectedLang}
            className="w-full py-6 text-lg bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white disabled:opacity-50"
          >
            {selectedLang === 'en' ? 'Continue' : 'Continuer'}
          </Button>

          {/* Skip link */}
          <p className="text-center text-xs text-muted-foreground">
            <button
              onClick={() => {
                try { localStorage.setItem('eden_vtc_welcome_done', 'true'); } catch { /* ignore */ }
                navigate('/');
              }}
              className="underline hover:text-[hsl(195,50%,25%)]"
            >
              Passer / Skip
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}