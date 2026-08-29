import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { client } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, ShieldX, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'driver' | 'passenger';
  fallbackMessage?: string;
}

export default function RouteGuard({ children, requiredRole, fallbackMessage }: RouteGuardProps) {
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading } = useAuth();
  const [state, setState] = useState<'loading' | 'authenticated' | 'unauthorized' | 'unauthenticated'>('loading');
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading) return;

    const checkAccess = async () => {
      try {
        // Use cached auth result
        if (!authUser) {
          setState('unauthenticated');
          return;
        }

        // If no specific role required, just need to be authenticated
        if (!requiredRole) {
          setState('authenticated');
          return;
        }

        // Check roles
        const rolesRes = await client.apiCall.invoke({
          url: '/api/v1/access/my-roles',
          method: 'GET',
        });

        if (rolesRes?.data) {
          const roles = rolesRes.data.roles || [];
          setUserRoles(roles);

          if (requiredRole === 'admin' && rolesRes.data.is_admin) {
            setState('authenticated');
          } else if (requiredRole === 'driver' && (rolesRes.data.is_driver || rolesRes.data.is_admin)) {
            setState('authenticated');
          } else if (requiredRole === 'passenger') {
            setState('authenticated'); // Everyone can be a passenger
          } else {
            setState('unauthorized');
          }
        } else {
          // If role check fails but user is authenticated, allow passenger access
          if (requiredRole === 'passenger') {
            setState('authenticated');
          } else {
            setState('unauthorized');
          }
        }
      } catch {
        setState('unauthenticated');
      }
    };

    checkAccess();
  }, [requiredRole, authLoading, authUser]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(195,50%,25%)] mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Vérification des accès...</p>
        </div>
      </div>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <LogIn className="w-12 h-12 text-[hsl(195,50%,25%)] mx-auto mb-4" />
            <h2 className="text-xl font-bold text-[hsl(195,50%,25%)] mb-2">Connexion requise</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Vous devez être connecté pour accéder à cette page.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/')}>
                Retour à l'accueil
              </Button>
              <Button
                onClick={() => navigate('/login')}
                className="bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Se connecter
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'unauthorized') {
    const roleLabels: Record<string, string> = {
      admin: 'Administrateur',
      driver: 'Chauffeur',
      passenger: 'Passager',
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-600 mb-2">Accès refusé</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {fallbackMessage || `Cette section nécessite le rôle "${roleLabels[requiredRole || '']}" pour y accéder.`}
            </p>
            {userRoles.length > 0 && (
              <p className="text-xs text-muted-foreground mb-4">
                Vos rôles actuels : {userRoles.map(r => roleLabels[r] || r).join(', ')}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/')}>
                Retour à l'accueil
              </Button>
              <Button variant="outline" onClick={() => navigate('/book')}>
                Réserver une course
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}