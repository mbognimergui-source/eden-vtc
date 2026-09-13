import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { client } from '@/lib/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Zap,
  Users,
  Car,
  Shield,
  CheckCircle2,
  Loader2,
  LogIn,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RoleStatus {
  role: string;
  status: 'created' | 'reactivated' | 'already_active';
}

interface RolesState {
  is_admin: boolean;
  is_driver: boolean;
  is_passenger: boolean;
  roles: string[];
}

const ROLE_CARDS = [
  {
    id: 'passenger',
    label: 'Client / Passager',
    description: 'Réserver des courses, gérer votre portefeuille, suivre vos trajets en temps réel.',
    icon: Users,
    color: 'hsl(195,50%,25%)',
    bgColor: 'bg-[hsl(195,50%,25%)]/10',
    borderColor: 'border-[hsl(195,50%,25%)]/30',
    path: '/book',
    pathLabel: 'Réserver une course',
  },
  {
    id: 'driver',
    label: 'Chauffeur',
    description: 'Accepter des courses, suivre vos revenus, gérer votre disponibilité.',
    icon: Car,
    color: 'hsl(45,65%,47%)',
    bgColor: 'bg-[hsl(45,65%,47%)]/10',
    borderColor: 'border-[hsl(45,65%,47%)]/30',
    path: '/driver',
    pathLabel: 'Tableau de bord chauffeur',
  },
  {
    id: 'admin',
    label: 'Administrateur',
    description: 'Gérer la flotte, les utilisateurs, les tarifs et superviser l\'activité.',
    icon: Shield,
    color: 'hsl(0,70%,50%)',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    path: '/admin',
    pathLabel: 'Panneau d\'administration',
  },
];

export default function SetupAccess() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [rolesState, setRolesState] = useState<RolesState | null>(null);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [assigningSingle, setAssigningSingle] = useState<string | null>(null);

  // Fetch current roles
  const fetchRoles = async () => {
    try {
      setLoadingRoles(true);
      const res = await client.apiCall.invoke({
        url: '/api/v1/access/my-roles',
        method: 'GET',
      });
      if (res?.data) {
        setRolesState(res.data);
      }
    } catch {
      // User might not have roles yet
      setRolesState({ is_admin: false, is_driver: false, is_passenger: false, roles: [] });
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRoles();
    } else if (!authLoading) {
      setLoadingRoles(false);
    }
  }, [user, authLoading]);

  const handleAssignAllRoles = async () => {
    try {
      setAssigning(true);
      const res = await client.apiCall.invoke({
        url: '/api/v1/access/setup-all-roles',
        method: 'POST',
      });
      if (res?.data?.success) {
        toast({
          title: '✅ Rôles attribués',
          description: 'Vous avez maintenant accès aux espaces Client et Chauffeur.',
        });
        await fetchRoles();
      }
    } catch (err: any) {
      toast({
        title: '❌ Erreur',
        description: err?.message || 'Impossible d\'attribuer les rôles.',
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignSingleRole = async (role: string) => {
    // Le rôle administrateur ne peut pas être auto-attribué (voir
    // routers/access_management.py) : le premier utilisateur du système
    // passe par /init-admin, les suivants doivent être promus par un
    // administrateur déjà en place.
    const isAdminRole = role === 'admin';
    try {
      setAssigningSingle(role);
      const res = await client.apiCall.invoke({
        url: isAdminRole ? '/api/v1/access/init-admin' : `/api/v1/access/assign-single-role?role=${role}`,
        method: 'POST',
      });
      if (res?.data?.success) {
        toast({
          title: '✅ Rôle activé',
          description: isAdminRole
            ? 'Vous êtes le premier utilisateur : le rôle administrateur vous a été attribué.'
            : `Le rôle "${role}" a été activé avec succès.`,
        });
        await fetchRoles();
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.data?.detail;
      toast({
        title: '❌ Erreur',
        description: isAdminRole
          ? (detail || 'Un administrateur existe déjà. Demandez-lui de vous accorder cet accès.')
          : (detail || err?.message || `Impossible d'activer le rôle "${role}".`),
        variant: 'destructive',
      });
    } finally {
      setAssigningSingle(null);
    }
  };

  const hasRole = (roleId: string): boolean => {
    if (!rolesState) return false;
    if (roleId === 'admin') return rolesState.is_admin;
    if (roleId === 'driver') return rolesState.is_driver;
    if (roleId === 'passenger') return rolesState.is_passenger;
    return false;
  };

  const allRolesActive = rolesState?.is_admin && rolesState?.is_driver && rolesState?.is_passenger;

  // Loading state
  if (authLoading || loadingRoles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(195,50%,25%)] mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[hsl(195,50%,25%)] to-[hsl(195,50%,15%)] p-4">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full eden-gradient flex items-center justify-center mx-auto shadow-lg">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[hsl(195,50%,25%)]">
              Connexion requise
            </h1>
            <p className="text-sm text-muted-foreground">
              Connectez-vous pour configurer vos accès et tester les différents rôles de l'application EDEN VTC.
            </p>
            <Button
              onClick={() => navigate('/login')}
              className="w-full py-5 bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Se connecter
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="w-full text-muted-foreground"
            >
              Retour à l'accueil
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 pb-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center pt-8 pb-4 space-y-3">
          <div className="w-14 h-14 rounded-full eden-gradient flex items-center justify-center mx-auto shadow-lg">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[hsl(195,50%,25%)]">
            Configuration des accès
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Activez vos rôles pour accéder aux différents espaces de l'application EDEN VTC.
          </p>
          {user && (
            <Badge variant="outline" className="text-xs">
              Connecté : {user.email || user.name || user.id}
            </Badge>
          )}
        </div>

        {/* Quick setup button */}
        {!allRolesActive && (
          <Card className="border-2 border-dashed border-[hsl(45,65%,47%)]/50 bg-[hsl(45,65%,47%)]/5">
            <CardContent className="p-6 text-center space-y-4">
              <Sparkles className="w-8 h-8 text-[hsl(45,65%,47%)] mx-auto" />
              <div>
                <h3 className="font-semibold text-[hsl(195,50%,25%)]">
                  Activer les rôles Client et Chauffeur
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Obtenez l'accès Client + Chauffeur instantanément. L'accès Administrateur se demande séparément ci-dessous.
                </p>
              </div>
              <Button
                onClick={handleAssignAllRoles}
                disabled={assigning}
                className="bg-[hsl(45,65%,47%)] hover:bg-[hsl(45,65%,52%)] text-white px-8"
              >
                {assigning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Attribution...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Activer tous les rôles
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* All roles active banner */}
        {allRolesActive && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
              <div>
                <p className="font-medium text-green-800 text-sm">
                  Tous les rôles sont actifs
                </p>
                <p className="text-xs text-green-600">
                  Vous pouvez naviguer librement entre les espaces Client, Chauffeur et Admin.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Role cards */}
        <div className="space-y-4">
          {ROLE_CARDS.map((card) => {
            const Icon = card.icon;
            const active = hasRole(card.id);
            return (
              <Card
                key={card.id}
                className={`transition-all duration-300 ${
                  active ? `${card.borderColor} border-2 shadow-md` : 'border hover:shadow-md'
                }`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${card.bgColor} flex items-center justify-center shrink-0`}>
                      <Icon className="w-6 h-6" style={{ color: card.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{card.label}</h3>
                        {active && (
                          <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                            <CheckCircle2 className="w-3 h-3 mr-0.5" />
                            Actif
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {card.description}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {active ? (
                          <Button
                            size="sm"
                            onClick={() => navigate(card.path)}
                            className="bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white"
                          >
                            {card.pathLabel}
                            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAssignSingleRole(card.id)}
                            disabled={assigningSingle === card.id}
                            className="border-[hsl(195,50%,25%)]/30 text-[hsl(195,50%,25%)]"
                          >
                            {assigningSingle === card.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                Activation...
                              </>
                            ) : (
                              <>Activer ce rôle</>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Navigation footer */}
        <div className="pt-4 flex justify-center">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-muted-foreground"
          >
            ← Retour à l'accueil
          </Button>
        </div>
      </div>
    </div>
  );
}