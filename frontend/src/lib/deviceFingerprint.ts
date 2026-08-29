/**
 * Device Fingerprinting — Generates a unique device identifier
 * that persists across app reinstalls (stored in multiple locations).
 * Uses browser/device characteristics to create a stable fingerprint.
 */

const FINGERPRINT_KEY = 'eden_device_fp';
const FINGERPRINT_BACKUP_KEY = 'eden_dfp_backup';

/**
 * Collect device characteristics for fingerprinting
 */
function collectDeviceSignals(): string {
  const signals: string[] = [];

  // Screen resolution
  signals.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

  // Timezone
  signals.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Language
  signals.push(navigator.language);

  // Platform
  signals.push(navigator.platform || 'unknown');

  // Hardware concurrency (CPU cores)
  signals.push(String(navigator.hardwareConcurrency || 0));

  // Device memory (if available)
  signals.push(String((navigator as any).deviceMemory || 0));

  // Max touch points
  signals.push(String(navigator.maxTouchPoints || 0));

  // User agent (partial - stable parts only)
  const ua = navigator.userAgent;
  const uaStable = ua.replace(/Chrome\/[\d.]+/, 'Chrome/X').replace(/Firefox\/[\d.]+/, 'Firefox/X');
  signals.push(uaStable);

  // Canvas fingerprint
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('EDEN VTC fp', 2, 15);
      signals.push(canvas.toDataURL().slice(-50));
    }
  } catch {
    signals.push('no-canvas');
  }

  return signals.join('|');
}

/**
 * Simple hash function (FNV-1a variant)
 */
function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Convert to hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generate a stable device fingerprint
 */
function generateFingerprint(): string {
  const signals = collectDeviceSignals();
  const hash = hashString(signals);
  // Add a random component for uniqueness (generated once, then stored)
  const random = Math.random().toString(36).substring(2, 10);
  return `${hash}-${random}-${Date.now().toString(36)}`;
}

/**
 * Get or create the device fingerprint.
 * Persists in localStorage and sessionStorage for redundancy.
 */
export function getDeviceFingerprint(): string {
  // Try to recover from multiple storage locations
  let fp = localStorage.getItem(FINGERPRINT_KEY)
    || sessionStorage.getItem(FINGERPRINT_KEY)
    || localStorage.getItem(FINGERPRINT_BACKUP_KEY);

  if (fp) {
    // Ensure it's stored in all locations
    try {
      localStorage.setItem(FINGERPRINT_KEY, fp);
      sessionStorage.setItem(FINGERPRINT_KEY, fp);
      localStorage.setItem(FINGERPRINT_BACKUP_KEY, fp);
    } catch {
      // Storage might be full or blocked
    }
    return fp;
  }

  // Generate new fingerprint
  fp = generateFingerprint();

  // Store in multiple locations for persistence
  try {
    localStorage.setItem(FINGERPRINT_KEY, fp);
    sessionStorage.setItem(FINGERPRINT_KEY, fp);
    localStorage.setItem(FINGERPRINT_BACKUP_KEY, fp);
  } catch {
    // Storage might be full or blocked
  }

  return fp;
}

/**
 * Get a deterministic hardware-based fingerprint (no random component).
 * Used as secondary verification — same hardware = same hash.
 */
export function getHardwareFingerprint(): string {
  const signals = collectDeviceSignals();
  return hashString(signals) + '-' + hashString(signals.split('').reverse().join(''));
}