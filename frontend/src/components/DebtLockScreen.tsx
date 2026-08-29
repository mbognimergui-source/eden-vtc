/**
 * DebtLockScreen — Full-screen lock overlay that blocks ALL app navigation
 * when the user has unpaid debt. Cannot be dismissed or bypassed.
 * 
 * Anti-contournement features:
 * - No navigation possible (no back button, no links)
 * - Cannot close or minimize
 * - Only action: go to payment page (Wallet)
 * - Shows device block warning if fraud detected
 */
import { Shield, Lock, AlertTriangle, Phone, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface DebtLockScreenProps {
  debtAmount: number;
  deviceBlocked: boolean;
  blockReason: string | null;
  installCount: number;
  message: string;
  onPayDebt: () => void;
}

export default function DebtLockScreen({
  debtAmount,
  deviceBlocked,
  blockReason,
  installCount,
  message,
  onPayDebt,
}: DebtLockScreenProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-red-950 via-red-900 to-gray-900 flex items-center justify-center p-4 overflow-y-auto">
      {/* Prevent any interaction behind */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Lock Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-red-800/50 flex items-center justify-center border-4 border-red-500 animate-pulse">
              <Lock className="w-12 h-12 text-red-200" />
            </div>
            <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-900" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">
            Application Verrouillée
          </h1>
          <p className="text-red-200 text-sm">
            Votre accès est suspendu pour dette impayée
          </p>
        </div>

        {/* Debt Amount Card */}
        <Card className="bg-red-800/30 border-red-500/50 backdrop-blur">
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-red-200 text-sm uppercase tracking-wider font-medium">
              Montant de la dette
            </p>
            <p className="text-4xl font-bold text-white">
              {debtAmount.toLocaleString('fr-FR')} <span className="text-xl">FCFA</span>
            </p>
            <div className="h-px bg-red-500/30 my-2" />
            <p className="text-red-200 text-sm leading-relaxed">
              {message}
            </p>
          </CardContent>
        </Card>

        {/* Device Fraud Warning */}
        {deviceBlocked && (
          <Card className="bg-yellow-900/30 border-yellow-500/50 backdrop-blur">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-yellow-400" />
                <p className="text-yellow-200 font-semibold text-sm">
                  ⚠️ Alerte Anti-Fraude
                </p>
              </div>
              <p className="text-yellow-300/80 text-xs leading-relaxed">
                {blockReason || "Tentative de contournement détectée. Cet appareil est associé à un compte avec dette impayée."}
              </p>
              {installCount > 1 && (
                <p className="text-yellow-400/60 text-xs">
                  Installations détectées sur cet appareil : {installCount}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={onPayDebt}
            className="w-full h-14 bg-[#C9A227] hover:bg-[#b8921f] text-white font-bold text-lg shadow-lg"
          >
            <CreditCard className="w-5 h-5 mr-2" />
            Régulariser ma dette
          </Button>

          <Button
            variant="outline"
            className="w-full h-12 border-red-500/50 text-red-200 hover:bg-red-800/30 hover:text-white"
            onClick={() => window.open('tel:+237600000000')}
          >
            <Phone className="w-4 h-4 mr-2" />
            Contacter le support
          </Button>
        </div>

        {/* Legal Notice */}
        <div className="text-center space-y-1">
          <p className="text-red-300/50 text-xs">
            La désinstallation de l'application ne supprime pas votre dette.
          </p>
          <p className="text-red-300/50 text-xs">
            Votre compte reste verrouillé jusqu'à régularisation complète.
          </p>
          <p className="text-red-300/40 text-[10px] mt-2">
            EDEN VTC — Système anti-fraude v1.0
          </p>
        </div>
      </div>
    </div>
  );
}