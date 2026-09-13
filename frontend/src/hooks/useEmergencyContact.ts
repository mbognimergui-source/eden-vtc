import { useState, useEffect, useCallback } from 'react';
import { client } from '@/lib/client';

export interface EmergencyContact {
  name: string | null;
  phone: string | null;
}

/** Contact de confiance du passager, prévenu automatiquement en cas d'alerte SOS. */
export function useEmergencyContact() {
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/safety/emergency-contact', method: 'GET' });
      if (res?.data) setContact(res.data as EmergencyContact);
    } catch (e) {
      console.error('Failed to load emergency contact', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (name: string, phone: string) => {
    const res = await client.apiCall.invoke({
      url: '/api/v1/safety/emergency-contact',
      method: 'PUT',
      data: { name, phone },
    });
    if (res?.data) setContact(res.data as EmergencyContact);
    return res?.data as EmergencyContact;
  }, []);

  return { contact, loading, save };
}
