import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { client } from '@/lib/client';
import { phoneLogout } from '@/lib/phoneAuth';
import { invalidateAuthCache } from '@/hooks/useAuth';

/**
 * Contexte d'authentification basé sur la connexion par téléphone + OTP SMS.
 * L'ancien flux SSO/OIDC a été retiré : plus d'email ni de mot de passe.
 */

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  last_login?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  logout: () => void;
  refetch: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await client.auth.me();
      setUser((res?.data as User) || null);
    } catch {
      // Non connecté : on affiche simplement l'interface de connexion.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    phoneLogout();
    invalidateAuthCache();
    setUser(null);
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const value: AuthContextType = {
    user,
    loading,
    error,
    logout,
    refetch: checkAuthStatus,
    isAdmin: user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};