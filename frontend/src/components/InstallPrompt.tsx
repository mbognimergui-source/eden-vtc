import React, { useState } from 'react';
import { Download, Share, Plus, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/usePwaInstall';

/**
 * Invitation discrète à installer EDEN VTC sur l'écran d'accueil.
 * Sur Android/Chrome l'invite native est utilisée ; sur iOS les étapes
 * manuelles « Partager → Sur l'écran d'accueil » sont expliquées.
 */
const InstallPrompt: React.FC = () => {
  const { shouldPrompt, canInstall, needsManualIosSteps, promptInstall, dismiss } =
    usePwaInstall();
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (!shouldPrompt) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div className="rounded-2xl border border-[hsl(195,50%,25%)]/15 bg-white p-4 shadow-xl shadow-black/10">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(195,50%,25%)]">
            <Smartphone className="h-5 w-5 text-[#C9A227]" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[hsl(195,50%,25%)]">
              Installer EDEN VTC
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ajoutez l'application à votre écran d'accueil : ouverture plus
              rapide, plein écran et moins de données consommées.
            </p>

            {showIosSteps && (
              <ol className="mt-3 space-y-2 rounded-xl bg-muted/60 p-3 text-xs text-foreground">
                <li className="flex items-center gap-2">
                  <Share className="h-4 w-4 shrink-0 text-[hsl(195,50%,25%)]" />
                  <span>1. Touchez le bouton « Partager » de Safari</span>
                </li>
                <li className="flex items-center gap-2">
                  <Plus className="h-4 w-4 shrink-0 text-[hsl(195,50%,25%)]" />
                  <span>2. Choisissez « Sur l'écran d'accueil »</span>
                </li>
                <li className="flex items-center gap-2">
                  <Download className="h-4 w-4 shrink-0 text-[hsl(195,50%,25%)]" />
                  <span>3. Validez avec « Ajouter »</span>
                </li>
              </ol>
            )}

            <div className="mt-3 flex items-center gap-2">
              {canInstall ? (
                <Button
                  size="sm"
                  className="h-9 bg-[hsl(195,50%,25%)] text-white hover:bg-[hsl(195,50%,20%)]"
                  onClick={() => {
                    void promptInstall();
                  }}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Installer
                </Button>
              ) : null}

              {needsManualIosSteps && !showIosSteps ? (
                <Button
                  size="sm"
                  className="h-9 bg-[hsl(195,50%,25%)] text-white hover:bg-[hsl(195,50%,20%)]"
                  onClick={() => setShowIosSteps(true)}
                >
                  <Share className="mr-1.5 h-4 w-4" />
                  Comment faire
                </Button>
              ) : null}

              <Button
                size="sm"
                variant="ghost"
                className="h-9 text-muted-foreground"
                onClick={dismiss}
              >
                Plus tard
              </Button>
            </div>
          </div>

          <button
            type="button"
            aria-label="Fermer l'invitation d'installation"
            onClick={dismiss}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;