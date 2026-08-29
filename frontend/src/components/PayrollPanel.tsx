import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { client } from '@/lib/client';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import { useToast } from '@/hooks/use-toast';
import { Banknote, RefreshCw, Loader2, CheckCircle2, CircleDollarSign } from 'lucide-react';

interface Driver {
  id: number;
  first_name: string;
  last_name: string;
  monthly_base_salary?: number;
}

interface PayrollRecord {
  id: number;
  driver_id: number;
  period_year: number;
  period_month: number;
  base_salary: number;
  worked_days: number | null;
  daily_target: number | null;
  days_target_met: number | null;
  total_ride_revenue: number | null;
  performance_bonus: number | null;
  deductions: number | null;
  net_pay: number;
  status: string | null;
  payment_reference: string | null;
}

interface Summary {
  driver_count: number;
  total_base_salary: number;
  total_performance_bonus: number;
  total_deductions: number;
  total_net_pay: number;
  paid_count: number;
  validated_count: number;
  draft_count: number;
}

const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-gray-100 text-gray-800' },
  validated: { label: 'Validé', className: 'bg-blue-100 text-blue-800' },
  paid: { label: 'Payé', className: 'bg-green-100 text-green-800' },
};

interface Props {
  drivers: Driver[];
}

export default function PayrollPanel({ drivers }: Props) {
  const { formatPrice } = useCountryTariff();
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [payDialog, setPayDialog] = useState<PayrollRecord | null>(null);
  const [paymentRef, setPaymentRef] = useState('');

  const driverName = useMemo(() => {
    const map: Record<number, string> = {};
    drivers.forEach((d) => { map[d.id] = `${d.first_name} ${d.last_name}`; });
    return map;
  }, [drivers]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsRes, summaryRes] = await Promise.all([
        client.apiCall.invoke({
          url: `/api/v1/payroll/records?period_year=${year}&period_month=${month}`,
          method: 'GET',
        }),
        client.apiCall.invoke({
          url: `/api/v1/payroll/summary?period_year=${year}&period_month=${month}`,
          method: 'GET',
        }),
      ]);
      if (recordsRes?.data?.records) setRecords(recordsRes.data.records);
      if (summaryRes?.data) setSummary(summaryRes.data);
    } catch (err) {
      console.error('Error loading payroll data:', err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/payroll/generate',
        method: 'POST',
        data: { period_year: year, period_month: month },
      });
      toast({ title: 'Bulletins de paie générés' });
      loadData();
    } catch (err: any) {
      toast({ title: err?.message || 'Erreur lors de la génération', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async (record: PayrollRecord) => {
    try {
      await client.apiCall.invoke({ url: `/api/v1/payroll/${record.id}/validate`, method: 'POST' });
      toast({ title: 'Bulletin validé' });
      loadData();
    } catch (err: any) {
      toast({ title: err?.message || 'Erreur', variant: 'destructive' });
    }
  };

  const handleMarkPaid = async () => {
    if (!payDialog) return;
    try {
      await client.apiCall.invoke({
        url: `/api/v1/payroll/${payDialog.id}/mark-paid`,
        method: 'POST',
        data: { payment_reference: paymentRef || null },
      });
      toast({ title: 'Paiement enregistré' });
      setPayDialog(null);
      setPaymentRef('');
      loadData();
    } catch (err: any) {
      toast({ title: err?.message || 'Erreur', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(195,50%,25%)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-[hsl(195,50%,25%)]" />
          <h2 className="text-lg font-bold text-[hsl(195,50%,25%)]">Paie des chauffeurs salariés</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, idx) => (
                <SelectItem key={idx} value={String(idx + 1)}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            className="w-24"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1 bg-[hsl(195,50%,25%)] text-white">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CircleDollarSign className="w-3.5 h-3.5" />}
            Générer la paie du mois
          </Button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Salaires de base</p>
              <p className="text-lg font-bold text-[hsl(195,50%,25%)]">{formatPrice(summary.total_base_salary)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Primes de performance</p>
              <p className="text-lg font-bold text-green-700">{formatPrice(summary.total_performance_bonus)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Net à payer</p>
              <p className="text-lg font-bold text-[hsl(45,65%,37%)]">{formatPrice(summary.total_net_pay)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Statut</p>
              <p className="text-sm font-semibold">
                {summary.paid_count} payé(s) / {summary.validated_count} validé(s) / {summary.draft_count} brouillon(s)
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Records table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bulletins — {MONTH_LABELS[month - 1]} {year}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Aucun bulletin pour cette période. Cliquez sur « Générer la paie du mois ».
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chauffeur</TableHead>
                    <TableHead>Jours travaillés</TableHead>
                    <TableHead>Objectif atteint</TableHead>
                    <TableHead>Salaire de base</TableHead>
                    <TableHead>Prime</TableHead>
                    <TableHead>Retenues</TableHead>
                    <TableHead>Net à payer</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{driverName[r.driver_id] || `#${r.driver_id}`}</TableCell>
                      <TableCell>{r.worked_days ?? 0}</TableCell>
                      <TableCell>{r.days_target_met ?? 0} j ≥ {formatPrice(r.daily_target || 30000)}</TableCell>
                      <TableCell>{formatPrice(r.base_salary)}</TableCell>
                      <TableCell className="text-green-700">+{formatPrice(r.performance_bonus || 0)}</TableCell>
                      <TableCell className="text-red-600">-{formatPrice(r.deductions || 0)}</TableCell>
                      <TableCell className="font-bold">{formatPrice(r.net_pay)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_LABELS[r.status || 'draft']?.className}>
                          {STATUS_LABELS[r.status || 'draft']?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === 'draft' && (
                          <Button size="sm" variant="outline" onClick={() => handleValidate(r)}>Valider</Button>
                        )}
                        {r.status === 'validated' && (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setPayDialog(r)}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Marquer payé
                          </Button>
                        )}
                        {r.status === 'paid' && r.payment_reference && (
                          <span className="text-xs text-muted-foreground">Réf: {r.payment_reference}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!payDialog} onOpenChange={(open) => !open && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer le paiement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {payDialog && `${driverName[payDialog.driver_id]} — ${formatPrice(payDialog.net_pay)}`}
            </p>
            <div>
              <Label>Référence de paiement (optionnel)</Label>
              <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Ex: virement, référence Orange Money..." />
            </div>
            <Button onClick={handleMarkPaid} className="w-full bg-[hsl(195,50%,25%)] text-white">Confirmer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
