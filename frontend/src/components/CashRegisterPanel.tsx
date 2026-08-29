import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { client } from '@/lib/client';
import { useCountryTariff } from '@/hooks/useCountryTariff';
import { Wallet, TrendingUp, ArrowDownRight, ArrowUpRight, RefreshCw, Loader2, Clock, Building2 } from 'lucide-react';
import CashAlertNotifications from './CashAlertNotifications';

interface Account {
  id: number;
  type: string;
  label: string;
  balance: number;
  description: string;
  last_updated_reason: string;
  updated_at: string | null;
}

interface Transaction {
  id: number;
  account_type: string;
  operation: string;
  amount: number;
  ride_id: number | null;
  passenger_id: number | null;
  description: string;
  balance_after: number;
  created_at: string | null;
}

interface Summary {
  encours: number;
  caisse: number;
  total_fonds: number;
  today_transactions: number;
  today_revenue: number;
}

export default function CashRegisterPanel() {
  const { formatPrice } = useCountryTariff();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [txFilter, setTxFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, summaryRes, txRes] = await Promise.all([
        client.apiCall.invoke({ url: '/api/v1/cash-register/accounts', method: 'GET' }),
        client.apiCall.invoke({ url: '/api/v1/cash-register/summary', method: 'GET' }),
        client.apiCall.invoke({ url: '/api/v1/cash-register/transactions', method: 'GET', params: { limit: 30 } }),
      ]);

      if (accountsRes?.data?.accounts) setAccounts(accountsRes.data.accounts);
      if (summaryRes?.data) setSummary(summaryRes.data);
      if (txRes?.data?.transactions) setTransactions(txRes.data.transactions);
    } catch (err) {
      console.error('Error loading cash register data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredTransactions = txFilter === 'all'
    ? transactions
    : transactions.filter(t => t.account_type === txFilter);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-[hsl(195,50%,25%)]" />
          <h2 className="text-lg font-bold text-[hsl(195,50%,25%)]">Caisse Centralisée</h2>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1">
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </Button>
      </div>

      {/* Two Accounts Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Compte Encours */}
        <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Compte des Encours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-900">
              {formatPrice(summary?.encours || 0)}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Soldes des portefeuilles clients
            </p>
            {accounts.find(a => a.type === 'encours')?.last_updated_reason && (
              <p className="text-[10px] text-blue-500 mt-2 italic">
                {accounts.find(a => a.type === 'encours')?.last_updated_reason}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Compte Caisse */}
        <Card className="border-2 border-[hsl(45,65%,47%)]/30 bg-gradient-to-br from-[hsl(45,65%,47%)]/5 to-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[hsl(45,65%,37%)] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Compte Caisse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[hsl(195,50%,25%)]">
              {formatPrice(summary?.caisse || 0)}
            </p>
            <p className="text-xs text-[hsl(45,65%,37%)] mt-1">
              Recettes reversées après validation
            </p>
            {accounts.find(a => a.type === 'caisse')?.last_updated_reason && (
              <p className="text-[10px] text-[hsl(45,65%,47%)] mt-2 italic">
                {accounts.find(a => a.type === 'caisse')?.last_updated_reason}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Fonds</p>
            <p className="text-lg font-bold text-[hsl(195,50%,25%)]">
              {formatPrice(summary?.total_fonds || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Recettes du jour</p>
            <p className="text-lg font-bold text-green-700">
              {formatPrice(summary?.today_revenue || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Mouvements du jour</p>
            <p className="text-lg font-bold">{summary?.today_transactions || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Notifications / Alertes */}
      <CashAlertNotifications />

      {/* Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Journal des mouvements</CardTitle>
            <Tabs value={txFilter} onValueChange={setTxFilter}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs px-2 h-6">Tous</TabsTrigger>
                <TabsTrigger value="encours" className="text-xs px-2 h-6">Encours</TabsTrigger>
                <TabsTrigger value="caisse" className="text-xs px-2 h-6">Caisse</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              Aucun mouvement enregistré
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    tx.operation === 'credit'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {tx.operation === 'credit' ? (
                      <ArrowDownRight className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {tx.account_type === 'encours' ? '📋 Encours' : '💰 Caisse'}
                      </Badge>
                      {tx.ride_id && (
                        <span className="text-[10px] text-muted-foreground">Course #{tx.ride_id}</span>
                      )}
                      {tx.created_at && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(tx.created_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${tx.operation === 'credit' ? 'text-green-700' : 'text-red-600'}`}>
                      {tx.operation === 'credit' ? '+' : '-'}{formatPrice(tx.amount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Solde: {formatPrice(tx.balance_after)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}