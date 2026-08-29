import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { client } from '@/lib/client';
import { t } from '@/lib/i18n';
import { Wallet as WalletIcon, ArrowLeft, Plus, ArrowUpRight, ArrowDownLeft, AlertTriangle, CreditCard, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import BottomNav from '@/components/BottomNav';
import DebtAlertBanner from '@/components/DebtAlertBanner';

// Mode paiement : tant que VITE_PAYMENT_LIVE_MODE n'est pas explicitement à
// "true", les rechargements et régularisations sont des opérations de
// démonstration (aucun prélèvement réel chez Orange Money / MTN MoMo).
const PAYMENT_LIVE_MODE =
  String(import.meta.env.VITE_PAYMENT_LIVE_MODE ?? '').trim().toLowerCase() === 'true';

export default function Wallet() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { formatPrice, tariff } = useCountryTariff();
  const [balance, setBalance] = useState(0);
  const [debtAmount, setDebtAmount] = useState(0);
  const [hasDebt, setHasDebt] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupMethod, setTopupMethod] = useState('orange_money');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [passenger, setPassenger] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [debtPayMethod, setDebtPayMethod] = useState('orange_money');
  const [debtPayAmount, setDebtPayAmount] = useState('');
  const [payingDebt, setPayingDebt] = useState(false);
  const [debtPaid, setDebtPaid] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const pRes = await client.entities.passengers.query({ query: {} });
      if (pRes?.data?.items?.length > 0) {
        const p = pRes.data.items[0];
        setPassenger(p);
        setBalance(p.wallet_balance || 0);
        setHasDebt(p.has_pending_debt || false);
        setDebtAmount(p.debt_amount || 0);
      }
      const tRes = await client.entities.wallet_transactions.query({ query: {}, sort: '-created_at', limit: 20 });
      if (tRes?.data?.items) {
        setTransactions(tRes.data.items);
      }
    } catch (e) {
      console.error('Failed to load wallet data', e);
    }
  };

  const handleTopup = async () => {
    const amount = parseInt(topupAmount);
    if (!amount || amount < 500) {
      toast({ title: `Montant minimum : ${formatPrice(500)}`, variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Create transaction
      await client.entities.wallet_transactions.create({
        data: {
          amount,
          type: 'topup',
          payment_method: topupMethod,
          description: `Rechargement ${topupMethod === 'orange_money' ? 'Orange Money' : 'MTN MoMo'}`,
          passenger_id: passenger?.id,
        }
      });

      // Update balance
      let newBalance = balance + amount;
      let newDebt = debtAmount;
      let newHasDebt = hasDebt;

      // If has debt, deduct from topup
      if (hasDebt && debtAmount > 0) {
        if (amount >= debtAmount) {
          newBalance = balance + (amount - debtAmount);
          newDebt = 0;
          newHasDebt = false;
        } else {
          newBalance = balance;
          newDebt = debtAmount - amount;
        }
      }

      if (passenger) {
        await client.entities.passengers.update({
          id: String(passenger.id),
          data: {
            wallet_balance: newBalance,
            debt_amount: newDebt,
            has_pending_debt: newHasDebt,
          }
        });
      }

      setBalance(newBalance);
      setDebtAmount(newDebt);
      setHasDebt(newHasDebt);
      setTopupAmount('');
      toast({ title: 'Rechargement effectué !' });
      loadData();
    } catch (e: any) {
      toast({ title: e?.message || 'Erreur', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePayDebt = async () => {
    const amount = debtPayAmount ? parseInt(debtPayAmount) : debtAmount;
    if (!amount || amount <= 0) {
      toast({ title: 'Montant invalide', variant: 'destructive' });
      return;
    }
    setPayingDebt(true);
    try {
      const response = await client.callFunction('cash-register/pay-debt', {
        amount,
        payment_method: debtPayMethod,
      });

      if (response?.data?.success) {
        setDebtAmount(response.data.remaining_debt || 0);
        setHasDebt(!response.data.debt_cleared);
        setDebtPayAmount('');
        setDebtPaid(true);
        toast({ title: response.data.message || 'Paiement effectué !' });
        setTimeout(() => setDebtPaid(false), 3000);
        loadData();
      } else {
        toast({ title: response?.data?.detail || 'Erreur lors du paiement', variant: 'destructive' });
      }
    } catch (e: any) {
      // Try alternative approach via entity update
      try {
        const paymentAmount = Math.min(amount, debtAmount);
        const newDebt = debtAmount - paymentAmount;

        if (passenger) {
          await client.entities.passengers.update({
            id: String(passenger.id),
            data: {
              debt_amount: newDebt,
              has_pending_debt: newDebt > 0,
            }
          });

          // Record the transaction
          await client.entities.wallet_transactions.create({
            data: {
              amount: paymentAmount,
              type: 'debt_payment',
              payment_method: debtPayMethod,
              description: `Régularisation dette ${paymentAmount} FCFA via ${debtPayMethod === 'orange_money' ? 'Orange Money' : debtPayMethod === 'mtn_momo' ? 'MTN MoMo' : 'Espèces'}`,
              passenger_id: passenger?.id,
            }
          });

          setDebtAmount(newDebt);
          setHasDebt(newDebt > 0);
          setDebtPayAmount('');
          setDebtPaid(true);
          toast({ title: newDebt === 0 ? 'Dette entièrement régularisée !' : `Paiement effectué. Reste : ${formatPrice(newDebt)}` });
          setTimeout(() => setDebtPaid(false), 3000);
          loadData();
        }
      } catch (e2: any) {
        toast({ title: e2?.message || e?.message || 'Erreur', variant: 'destructive' });
      }
    } finally {
      setPayingDebt(false);
    }
  };

  const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000];

  return (
    <div className="min-h-screen bg-background pb-bottom-nav">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-border/40 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-muted/60 rounded-xl transition-colors duration-200">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">{t('wallet.title')}</h1>
        </div>
      </header>

      {/* Debt Alert Banner - detailed mode on wallet page */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <DebtAlertBanner />
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 page-enter">
        {/* Balance Card */}
        <Card className="eden-gradient text-white overflow-hidden relative rounded-2xl border-0 shadow-xl shadow-[hsl(195,50%,25%)]/20">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-6 -translate-x-6" />
          <CardContent className="p-6 space-y-4 relative z-10">
            <div className="flex items-center gap-2 text-white/80">
              <WalletIcon className="w-5 h-5" />
              <span className="text-sm font-medium">{t('wallet.balance')}</span>
            </div>
            <p className="text-4xl font-bold count-up">{formatPrice(balance)}</p>
            {hasDebt && (
              <div className="flex items-center gap-2 bg-red-500/20 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-red-400/20">
                <AlertTriangle className="w-4 h-4 text-red-200" />
                <span className="text-sm text-red-100 font-medium">{t('wallet.debt')} : {formatPrice(debtAmount)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Debt Payment Section - Only shown when debt exists */}
        {hasDebt && debtAmount > 0 && (
          <Card className="border-red-200 bg-red-50/50 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="w-5 h-5" />
                Régulariser ma dette
              </CardTitle>
              <p className="text-sm text-red-600/80 mt-1">
                Vous devez régler votre dette avant de pouvoir commander une nouvelle course.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Debt amount display */}
              <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-red-200 shadow-sm">
                <div>
                  <p className="text-sm text-muted-foreground">Montant de la dette</p>
                  <p className="text-2xl font-bold text-red-600">{formatPrice(debtAmount)}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-red-500" />
                </div>
              </div>

              {/* Payment amount - default to full debt */}
              <div className="space-y-2">
                <Label className="text-red-700">Montant à payer</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDebtPayAmount(String(debtAmount))}
                    className={`border-red-300 hover:bg-red-50 ${debtPayAmount === String(debtAmount) ? 'bg-red-100 border-red-500' : ''}`}
                  >
                    Tout payer ({formatPrice(debtAmount)})
                  </Button>
                  {debtAmount > 1000 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDebtPayAmount(String(Math.ceil(debtAmount / 2 / 100) * 100))}
                      className="border-red-300 hover:bg-red-50"
                    >
                      Moitié ({formatPrice(Math.ceil(debtAmount / 2 / 100) * 100)})
                    </Button>
                  )}
                </div>
                <Input
                  type="number"
                  placeholder={String(debtAmount)}
                  value={debtPayAmount}
                  onChange={(e) => setDebtPayAmount(e.target.value)}
                  className="border-red-200 focus:border-red-400"
                />
              </div>

              {/* Payment method */}
              <div className="space-y-2">
                <Label className="text-red-700">Mode de paiement</Label>
                <Select value={debtPayMethod} onValueChange={setDebtPayMethod}>
                  <SelectTrigger className="border-red-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orange_money">🟠 Orange Money</SelectItem>
                    <SelectItem value="mtn_momo">🟡 MTN MoMo</SelectItem>
                    <SelectItem value="cash">💵 Espèces (en agence)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Pay button */}
              <Button
                onClick={handlePayDebt}
                disabled={payingDebt}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold h-12 text-base shadow-lg shadow-red-200"
              >
                {payingDebt ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Traitement en cours...
                  </span>
                ) : debtPaid ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Paiement réussi !
                  </span>
                ) : (
                  `Payer ${debtPayAmount ? formatPrice(parseInt(debtPayAmount) || 0) : formatPrice(debtAmount)}`
                )}
              </Button>

              {/* Info notice */}
              <p className="text-xs text-red-500/70 text-center">
                💡 Une fois la dette réglée, vous pourrez à nouveau commander des courses.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Top up */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('wallet.topup')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!PAYMENT_LIVE_MODE && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <span className="font-semibold">Mode test</span> — aucun paiement réel n'est débité.
                Les rechargements et régularisations sont simulés pour la démonstration.
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setTopupAmount(String(amount))}
                  className={topupAmount === String(amount) ? 'border-[hsl(45,65%,47%)] bg-[hsl(45,65%,47%)]/10' : ''}
                >
                  {formatPrice(amount)}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Montant personnalisé ({tariff.currency_symbol})</Label>
              <Input
                type="number"
                placeholder="5000"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Mode de paiement</Label>
              <Select value={topupMethod} onValueChange={setTopupMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orange_money">Orange Money</SelectItem>
                  <SelectItem value="mtn_momo">MTN MoMo</SelectItem>
                  <SelectItem value="cash">Espèces (en agence)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleTopup}
              disabled={loading}
              className="w-full bg-[hsl(45,65%,47%)] hover:bg-[hsl(45,65%,52%)] text-[hsl(195,50%,10%)] font-semibold"
            >
              {loading ? t('common.loading') : `Recharger ${topupAmount ? formatPrice(parseInt(topupAmount) || 0) : ''}`}
            </Button>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>{t('wallet.history')}</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Aucune transaction</p>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      {tx.type === 'topup' || tx.type === 'refund' ? (
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <ArrowDownLeft className="w-4 h-4 text-green-600" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                          <ArrowUpRight className="w-4 h-4 text-red-600" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium">{tx.description || tx.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.payment_method && <Badge variant="outline" className="text-xs">{tx.payment_method}</Badge>}
                        </p>
                      </div>
                    </div>
                    <span className={`font-semibold text-sm ${tx.type === 'topup' || tx.type === 'refund' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.type === 'topup' || tx.type === 'refund' ? '+' : '-'}{formatPrice(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}