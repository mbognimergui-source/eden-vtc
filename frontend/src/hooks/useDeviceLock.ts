/**
 * useDeviceLock — Hook that checks device lock status on login.
 * Blocks the entire app if the user has unpaid debt or the device is flagged.
 * Communicates with POST /api/v1/device-lock/check
 */
import { useState, useCallback } from 'react';
import { client } from '@/lib/client';
import { getDeviceFingerprint, getHardwareFingerprint } from '@/lib/deviceFingerprint';
import { usePolling } from '@/hooks/usePolling';

export interface DeviceLockState {
  locked: boolean;
  loading: boolean;
  debtAmount: number;
  deviceBlocked: boolean;
  blockReason: string | null;
  installCount: number;
  message: string;
  refresh: () => void;
}

const LOCK_CACHE_KEY = 'eden_device_lock_state';
// Vérification espacée : le verrouillage ne change qu'après un paiement, et
// `refresh()` permet un contrôle immédiat quand c'est nécessaire.
const LOCK_CHECK_INTERVAL = 180000; // 3 minutes

export function useDeviceLock(isAuthenticated: boolean): DeviceLockState {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [debtAmount, setDebtAmount] = useState(0);
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [installCount, setInstallCount] = useState(0);
  const [message, setMessage] = useState('');

  const checkLock = useCallback(async () => {
    if (!isAuthenticated) {
      setLocked(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get device fingerprint (combines stored + hardware)
      const deviceFp = getDeviceFingerprint();
      const hardwareFp = getHardwareFingerprint();
      const combinedFp = `${deviceFp}::${hardwareFp}`;

      const response = await client.callFunction('device-lock/check', {
        method: 'POST',
        body: { device_fingerprint: combinedFp },
      });

      if (response?.data) {
        const data = response.data;
        setLocked(data.locked || false);
        setDebtAmount(data.debt_amount || 0);
        setDeviceBlocked(data.device_blocked || false);
        setBlockReason(data.block_reason || null);
        setInstallCount(data.install_count || 0);
        setMessage(data.message || '');

        // Cache the lock state
        try {
          localStorage.setItem(LOCK_CACHE_KEY, JSON.stringify({
            locked: data.locked,
            debt_amount: data.debt_amount,
            timestamp: Date.now(),
          }));
        } catch {
          // Ignore storage errors
        }
      }
    } catch (error) {
      console.error('[DeviceLock] Failed to check lock status:', error);
      // On error, check cached state
      try {
        const cached = localStorage.getItem(LOCK_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Use cached state if less than 5 minutes old
          if (Date.now() - parsed.timestamp < 300000) {
            setLocked(parsed.locked || false);
            setDebtAmount(parsed.debt_amount || 0);
          }
        }
      } catch {
        // Ignore
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  usePolling(checkLock, {
    interval: LOCK_CHECK_INTERVAL,
    enabled: isAuthenticated,
    maxInterval: 300_000,
  });

  return {
    locked,
    loading,
    debtAmount,
    deviceBlocked,
    blockReason,
    installCount,
    message,
    refresh: checkLock,
  };
}