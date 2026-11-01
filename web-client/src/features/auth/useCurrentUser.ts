'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: 'CUSTOMER' | 'ADMIN' | 'GUEST';
  phone?: string;
  permissions?: string[];
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await apiFetch<CurrentUser>('auth/me', { retries: 0 });
      if (res.success && res.data && res.data.id) {
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('auth/logout', { method: 'POST', retries: 0 });
    } catch {
      // Ignored
    }
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, []);

  return { user, isLoading, refetch: fetchUser, logout };
}

