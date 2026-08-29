import { useState, useEffect, useCallback } from 'react';
import { client } from '@/lib/client';

export type UserRole = 'passenger' | 'driver' | 'admin';

export interface AccessState {
  roles: UserRole[];
  isAdmin: boolean;
  isDriver: boolean;
  isPassenger: boolean;
  isActive: boolean;
  loading: boolean;
  error: string | null;
  userId: string | null;
  refresh: () => void;
}

export function useAccessControl(): AccessState {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [isPassenger, setIsPassenger] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/access/my-roles',
        method: 'GET',
      });
      if (res?.data) {
        setRoles(res.data.roles || []);
        setIsAdmin(res.data.is_admin || false);
        setIsDriver(res.data.is_driver || false);
        setIsPassenger(res.data.is_passenger || true);
        setIsActive(res.data.is_active !== false);
        setUserId(res.data.user_id || null);
      }
    } catch (e: any) {
      // User might not be logged in
      setRoles([]);
      setIsAdmin(false);
      setIsDriver(false);
      setIsPassenger(true);
      setIsActive(true);
      setError(e?.message || 'Impossible de vérifier les accès');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  return {
    roles,
    isAdmin,
    isDriver,
    isPassenger,
    isActive,
    loading,
    error,
    userId,
    refresh: fetchRoles,
  };
}