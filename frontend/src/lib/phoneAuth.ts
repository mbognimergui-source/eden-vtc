import { client } from '@/lib/client';
import { invalidateAuthCache } from '@/hooks/useAuth';

/**
 * Authentification passager par téléphone + code OTP reçu par SMS.
 * Remplace l'ancien flux SSO/OIDC : aucun email ni mot de passe.
 */

const TOKEN_STORAGE_KEY = 'token';

export type OtpChannel = 'sms' | 'whatsapp';

export interface RequestCodeResult {
  sent: boolean;
  phone: string;
  masked_phone: string;
  channel: OtpChannel;
  expires_in: number;
  resend_after: number;
  code_length: number;
  dev_code?: string | null;
}

export interface PhoneAuthStatus {
  sms_ready: boolean;
  whatsapp_ready: boolean;
  dev_mode: boolean;
  code_length: number;
  expires_in: number;
}

export interface VerifyCodeResult {
  token: string;
  expires_at: number;
  profile_complete: boolean;
  first_name?: string | null;
  city?: string | null;
}

export interface PhoneProfile {
  profile_complete: boolean;
  first_name?: string | null;
  city?: string | null;
  phone?: string | null;
  masked_phone?: string | null;
}

/** Extrait un message d'erreur lisible depuis une erreur SDK/axios. */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const e = error as {
    data?: { detail?: string };
    response?: { data?: { detail?: string } };
    message?: string;
  };
  return e?.response?.data?.detail || e?.data?.detail || e?.message || fallback;
}

/** Affichage local d'un numéro camerounais : +237 6XX XX XX XX */
export function formatPhoneForDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^237/, '');
  const groups = [digits.slice(0, 1), digits.slice(1, 4), digits.slice(4, 6), digits.slice(6, 8), digits.slice(8, 9)];
  return groups.filter(Boolean).join(' ');
}

/** Vérifie la plausibilité du numéro avant l'appel réseau. */
export function isPlausiblePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '').replace(/^237/, '').replace(/^0+/, '');
  return digits.length === 9 && digits.startsWith('6');
}

/** Demande l'envoi d'un code OTP par SMS ou WhatsApp, selon le canal choisi. */
export async function requestPhoneCode(phone: string, channel: OtpChannel = 'sms'): Promise<RequestCodeResult> {
  const response = await client.apiCall.invoke({
    url: '/api/v1/auth/phone/request-code',
    method: 'POST',
    data: { phone, channel },
  });
  return response.data as RequestCodeResult;
}

/** Indique quels canaux (SMS, WhatsApp) sont opérationnels côté serveur. */
export async function fetchPhoneAuthStatus(): Promise<PhoneAuthStatus> {
  const response = await client.apiCall.invoke({
    url: '/api/v1/auth/phone/status',
    method: 'GET',
  });
  return response.data as PhoneAuthStatus;
}

/** Valide le code OTP et enregistre le jeton de session. */
export async function verifyPhoneCode(phone: string, code: string): Promise<VerifyCodeResult> {
  const response = await client.apiCall.invoke({
    url: '/api/v1/auth/phone/verify-code',
    method: 'POST',
    data: { phone, code },
  });

  const result = response.data as VerifyCodeResult;

  if (result?.token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
    invalidateAuthCache();
  }

  return result;
}

/** Récupère le profil minimal du passager connecté. */
export async function fetchPhoneProfile(): Promise<PhoneProfile> {
  const response = await client.apiCall.invoke({
    url: '/api/v1/auth/phone/profile',
    method: 'GET',
  });
  return response.data as PhoneProfile;
}

/** Enregistre le profil minimal : prénom + ville. */
export async function savePhoneProfile(firstName: string, city: string): Promise<PhoneProfile> {
  const response = await client.apiCall.invoke({
    url: '/api/v1/auth/phone/profile',
    method: 'POST',
    data: { first_name: firstName, city },
  });
  return response.data as PhoneProfile;
}

/** Déconnexion locale : suppression du jeton et du cache d'authentification. */
export function phoneLogout(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  invalidateAuthCache();
}

/** Indique si un jeton de session est présent localement. */
export function hasStoredToken(): boolean {
  return !!localStorage.getItem(TOKEN_STORAGE_KEY);
}