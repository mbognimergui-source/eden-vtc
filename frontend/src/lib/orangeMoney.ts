import { apiBaseUrl } from '@/lib/client';

// Client HTTP direct (fetch) pour les endpoints Orange Money : ce sont des
// routes FastAPI "classiques" (pas des entités CRUD génériques), donc en
// dehors du helper client.entities.* du SDK.
const TOKEN_STORAGE_KEY = 'token';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJsonOrThrow(response: Response) {
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // réponse vide/non-JSON : on retombe sur le statut HTTP
  }
  if (!response.ok) {
    throw new Error(body?.detail || `Erreur Orange Money (HTTP ${response.status})`);
  }
  return body;
}

export interface OrangeMoneyTopupResult {
  order_id: string;
  pay_token: string;
  status: string;
  message: string;
}

export interface OrangeMoneyStatusResult {
  order_id: string;
  status: 'pending' | 'successful' | 'failed';
  amount: number;
  credited: boolean;
  new_balance: number | null;
  failure_reason: string | null;
}

export async function initiateOrangeMoneyTopup(amount: number): Promise<OrangeMoneyTopupResult> {
  const response = await fetch(`${apiBaseUrl === '/' ? '' : apiBaseUrl}/api/v1/payments/orange-money/topup`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ amount }),
  });
  return parseJsonOrThrow(response);
}

export async function checkOrangeMoneyStatus(orderId: string): Promise<OrangeMoneyStatusResult> {
  const response = await fetch(
    `${apiBaseUrl === '/' ? '' : apiBaseUrl}/api/v1/payments/orange-money/status/${encodeURIComponent(orderId)}`,
    { headers: authHeaders() }
  );
  return parseJsonOrThrow(response);
}

/**
 * Sonde le statut d'un paiement Orange Money jusqu'à confirmation, échec, ou
 * expiration du délai imparti (le client doit valider sur son téléphone).
 */
export async function pollOrangeMoneyStatus(
  orderId: string,
  { intervalMs = 3000, timeoutMs = 90_000 }: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<OrangeMoneyStatusResult> {
  const deadline = Date.now() + timeoutMs;
  // Premier essai immédiat, puis à intervalle régulier.
  while (true) {
    const result = await checkOrangeMoneyStatus(orderId);
    if (result.status !== 'pending') {
      return result;
    }
    if (Date.now() >= deadline) {
      return result; // toujours pending : le frontend affichera un message de délai dépassé
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
