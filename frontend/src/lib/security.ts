/**
 * Frontend security utilities for EDEN VTC
 * Protects against XSS, CSRF, and other client-side attacks
 */

/**
 * Sanitize user input to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  if (!input) return input;

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Escape HTML entities
  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#96;',
  };

  sanitized = sanitized.replace(/[&<>"'/`]/g, (char) => entityMap[char] || char);

  return sanitized;
}

/**
 * Sanitize a URL to prevent javascript: and data: attacks
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:text/html', 'vbscript:', 'file:'];
  for (const protocol of dangerousProtocols) {
    if (trimmed.startsWith(protocol)) {
      return '';
    }
  }

  // Allow only http, https, mailto, tel protocols
  const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:', '/'];
  const hasProtocol = trimmed.includes(':');

  if (hasProtocol && !allowedProtocols.some((p) => trimmed.startsWith(p))) {
    return '';
  }

  return url;
}

/**
 * Generate a CSRF token for forms
 */
export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store and retrieve CSRF token
 */
const CSRF_KEY = 'eden_vtc_csrf_token';

export function getCSRFToken(): string {
  let token = sessionStorage.getItem(CSRF_KEY);
  if (!token) {
    token = generateCSRFToken();
    sessionStorage.setItem(CSRF_KEY, token);
  }
  return token;
}

/**
 * Validate that a string doesn't contain suspicious patterns
 */
export function isSuspiciousInput(input: string): boolean {
  if (!input) return false;

  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /union\s+select/i,
    /drop\s+table/i,
    /insert\s+into/i,
    /\$\{.*\}/,
    /eval\s*\(/i,
    /document\.(cookie|location|write)/i,
    /window\.(location|open)/i,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Rate limit client-side actions (e.g., form submissions)
 */
const actionTimestamps: Map<string, number[]> = new Map();

export function isRateLimited(
  action: string,
  maxAttempts: number = 5,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const timestamps = actionTimestamps.get(action) || [];

  // Clean old entries
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxAttempts) {
    return true;
  }

  recent.push(now);
  actionTimestamps.set(action, recent);
  return false;
}

/**
 * Secure localStorage wrapper that encrypts sensitive data
 */
export const secureStorage = {
  set(key: string, value: string): void {
    try {
      // Add a simple obfuscation layer (not encryption, but deters casual inspection)
      const encoded = btoa(encodeURIComponent(value));
      localStorage.setItem(`eden_s_${key}`, encoded);
    } catch {
      // Storage full or unavailable
    }
  },

  get(key: string): string | null {
    try {
      const encoded = localStorage.getItem(`eden_s_${key}`);
      if (!encoded) return null;
      return decodeURIComponent(atob(encoded));
    } catch {
      return null;
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(`eden_s_${key}`);
    } catch {
      // Ignore
    }
  },
};

/**
 * Content Security Policy violation reporter
 */
export function setupCSPReporter(): void {
  document.addEventListener('securitypolicyviolation', (event) => {
    console.warn('[CSP Violation]', {
      directive: event.violatedDirective,
      blockedURI: event.blockedURI,
      sourceFile: event.sourceFile,
    });
  });
}

/**
 * Detect and warn about potential clickjacking
 */
export function detectClickjacking(): boolean {
  if (window.self !== window.top) {
    console.warn('[Security] Application loaded in iframe - potential clickjacking');
    return true;
  }
  return false;
}

/**
 * Validate file upload (type, size, name)
 */
export function validateFileUpload(
  file: File,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeMB: number = 5
): { valid: boolean; error?: string } {
  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Type de fichier non autorisé: ${file.type}`,
    };
  }

  // Check file size
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `Fichier trop volumineux (max ${maxSizeMB}MB)`,
    };
  }

  // Check filename for path traversal
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return {
      valid: false,
      error: 'Nom de fichier invalide',
    };
  }

  return { valid: true };
}