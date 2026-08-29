import { useState, useEffect } from 'react';
import { client } from '@/lib/client';

/**
 * Shared auth state with caching to avoid redundant /auth/me calls.
 * Multiple components mounting simultaneously will share the same promise.
 */

let cachedUser: any = null;
let cacheTimestamp = 0;
let pendingPromise: Promise<any> | null = null;

const CACHE_DURATION = 30_000; // 30 seconds cache

async function fetchAuthWithRetry(retries = 2, delay = 2000): Promise<any> {
  try {
    const res = await client.auth.me();
    if (res?.data) {
      cachedUser = res.data;
      cacheTimestamp = Date.now();
      return res.data;
    }
    cachedUser = null;
    cacheTimestamp = Date.now();
    return null;
  } catch (err: any) {
    // Handle 429 Too Many Requests with retry
    if (err?.status === 429 || err?.response?.status === 429) {
      if (retries > 0) {
        const retryAfter = err?.data?.retry_after || err?.response?.data?.retry_after || delay / 1000;
        const waitMs = Math.min(retryAfter * 1000, 10000);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return fetchAuthWithRetry(retries - 1, delay * 2);
      }
    }
    cachedUser = null;
    cacheTimestamp = Date.now();
    return null;
  }
}

function getAuth(): Promise<any> {
  const now = Date.now();

  // Return cached result if still fresh
  if (cacheTimestamp && now - cacheTimestamp < CACHE_DURATION) {
    return Promise.resolve(cachedUser);
  }

  // Deduplicate concurrent calls
  if (pendingPromise) {
    return pendingPromise;
  }

  pendingPromise = fetchAuthWithRetry().finally(() => {
    pendingPromise = null;
  });

  return pendingPromise;
}

export function invalidateAuthCache() {
  cachedUser = null;
  cacheTimestamp = 0;
  pendingPromise = null;
}

export function useAuth() {
  const [user, setUser] = useState<any>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);

  useEffect(() => {
    let mounted = true;

    getAuth().then((data) => {
      if (mounted) {
        setUser(data);
        setLoading(false);
      }
    });

    return () => { mounted = false; };
  }, []);

  return { user, loading };
}