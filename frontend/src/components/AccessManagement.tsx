import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { client } from '@/lib/client';
import { useToast } from '@/hooks/use-toast';
import { Shield, UserPlus, Users, ShieldCheck, ShieldX, Car, User, Crown, Search, RefreshCw, AlertTriangle } from 'lucide-react';

interface RoleAssignment {
  id: number;
  user_id: string;
  role: string;
  is_active: boolean;
  granted_by: string;
  permissions: string;
}

const ROLE_CONFIG = {
  admin: { label: 'Administrateur', icon: Crown, color: 'bg-red-100 text-red-800 border-red-200' },
  driver: { label: 'Chauffeur', icon: Car, color: 'bg-blue-100 text-blue-800 border-blue-200' },
  passenger: { label: 'Passager', icon: User, color: 'bg-green-100 text-green-800 border-green-200' },
};

export default function AccessManagement() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<string>('passenger');
  const [assigning, setAssigning] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/access/users-roles',
        method: 'GET',
      });
      if (res?.data) {
        setAssignments(Array.isArray(res.data) ? res.data : []);
      }
    } catch (e: any) {
      toast({ title: 'Erreur de chargement', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const handleAssignRole = async () => {
    if (!newUserId.trim()) {
      toast({ title: 'Veuillez entrer l\'ID utilisateur', variant: 'destructive' });
      return;
    }
    setAssigning(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/access/assign-role',
        method: 'POST',
        data: {
          target_user_id: newUserId.trim(),
          role: newRole,
          permissions: '{}',
        },
      });
      toast({ title: `✅ Rôle "${ROLE_CONFIG[newRole as keyof typeof ROLE_CONFIG]?.label}" attribué avec succès` });
      setNewUserId('');
      setNewRole('passenger');
      setShowAssignDialog(false);
      loadAssignments();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Erreur inconnue';
      toast({ title: 'Erreur d\'attribution', description: detail, variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  };

  const handleToggleActive = async (assignment: RoleAssignment) => {
    try {
      if (assignment.is_active) {
        await client.apiCall.invoke({
          url: '/api/v1/access/revoke-role',
          method: 'POST',
          data: { role_id: assignment.id },
        });
        toast({ title: `🚫 Rôle "${assignment.role}" désactivé` });
      } else {
        await client.apiCall.invoke({
          url: '/api/v1/access/update-role',
          method: 'PUT',
          data: { role_id: assignment.id, is_active: true },
        });
        toast({ title: `✅ Rôle "${assignment.role}" réactivé` });
      }
      loadAssignments();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Erreur';
      toast({ title: 'Erreur', description: detail, variant: 'destructive' });
    }
  };

  const filteredAssignments = assignments.filter((a) => {
    const matchesSearch = !searchFilter || a.user_id.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesRole = roleFilter === 'all' || a.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Stats
  const stats = {
    total: assignments.length,
    admins: assignments.filter(a => a.role === 'admin' && a.is_active).length,
    drivers: assignments.filter(a => a.role === 'driver' && a.is_active).length,
    passengers: assignments.filter(a => a.role === 'passenger' && a.is_active).length,
    inactive: assignments.filter(a => !a.is_active).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[hsl(195,50%,25%)]/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[hsl(195,50%,25%)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[hsl(195,50%,25%)]">Gestion des Accès</h2>
            <p className="text-xs text-muted-foreground">Gérer les rôles et permissions des utilisateurs</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAssignments} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white">
                <UserPlus className="w-4 h-4 mr-1" />
                Attribuer un rôle
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[hsl(45,65%,47%)]" />
                  Attribuer un rôle
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>ID Utilisateur</Label>
                  <Input
                    placeholder="Entrez l'identifiant de l'utilisateur"
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    L'ID unique de l'utilisateur dans le système EDEN VTC
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Rôle à attribuer</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passenger">
                        <span className="flex items-center gap-2">
                          <User className="w-4 h-4" /> Passager
                        </span>
                      </SelectItem>
                      <SelectItem value="driver">
                        <span className="flex items-center gap-2">
                          <Car className="w-4 h-4" /> Chauffeur
                        </span>
                      </SelectItem>
                      <SelectItem value="admin">
                        <span className="flex items-center gap-2">
                          <Crown className="w-4 h-4" /> Administrateur
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Alert>
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    {newRole === 'admin'
                      ? '⚠️ Le rôle Administrateur donne un accès complet à la gestion de la plateforme.'
                      : newRole === 'driver'
                      ? '🚗 Le rôle Chauffeur donne accès au tableau de bord chauffeur et à la gestion des courses.'
                      : '👤 Le rôle Passager permet de commander des courses et gérer le portefeuille.'}
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={handleAssignRole}
                  disabled={assigning || !newUserId.trim()}
                  className="w-full bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white"
                >
                  {assigning ? 'Attribution en cours...' : '✓ Attribuer le rôle'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <Users className="w-5 h-5 mx-auto text-[hsl(195,50%,25%)] mb-1" />
            <p className="text-lg font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="border-red-200/50">
          <CardContent className="p-3 text-center">
            <Crown className="w-5 h-5 mx-auto text-red-600 mb-1" />
            <p className="text-lg font-bold text-red-600">{stats.admins}</p>
            <p className="text-xs text-muted-foreground">Admins</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200/50">
          <CardContent className="p-3 text-center">
            <Car className="w-5 h-5 mx-auto text-blue-600 mb-1" />
            <p className="text-lg font-bold text-blue-600">{stats.drivers}</p>
            <p className="text-xs text-muted-foreground">Chauffeurs</p>
          </CardContent>
        </Card>
        <Card className="border-green-200/50">
          <CardContent className="p-3 text-center">
            <User className="w-5 h-5 mx-auto text-green-600 mb-1" />
            <p className="text-lg font-bold text-green-600">{stats.passengers}</p>
            <p className="text-xs text-muted-foreground">Passagers</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200/50">
          <CardContent className="p-3 text-center">
            <ShieldX className="w-5 h-5 mx-auto text-orange-500 mb-1" />
            <p className="text-lg font-bold text-orange-500">{stats.inactive}</p>
            <p className="text-xs text-muted-foreground">Désactivés</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par ID utilisateur..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrer par rôle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            <SelectItem value="admin">Administrateurs</SelectItem>
            <SelectItem value="driver">Chauffeurs</SelectItem>
            <SelectItem value="passenger">Passagers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Role Assignments List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            Attributions de rôles ({filteredAssignments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2" />
              Chargement des attributions...
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune attribution de rôle trouvée</p>
              <p className="text-xs mt-1">Utilisez le bouton "Attribuer un rôle" pour commencer</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAssignments.map((assignment) => {
                const config = ROLE_CONFIG[assignment.role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.passenger;
                const IconComp = config.icon;
                return (
                  <div
                    key={assignment.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      assignment.is_active
                        ? 'border-border/50 hover:border-[hsl(195,50%,25%)]/30 bg-background'
                        : 'border-red-200/50 bg-red-50/30 opacity-60'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      assignment.is_active ? 'bg-[hsl(195,50%,25%)]/10' : 'bg-red-100'
                    }`}>
                      <IconComp className={`w-4 h-4 ${assignment.is_active ? 'text-[hsl(195,50%,25%)]' : 'text-red-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">{assignment.user_id}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className={`text-xs ${config.color}`}>
                          {config.label}
                        </Badge>
                        {!assignment.is_active && (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
                            Désactivé
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={assignment.is_active}
                        onCheckedChange={() => handleToggleActive(assignment)}
                        className="data-[state=checked]:bg-green-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}