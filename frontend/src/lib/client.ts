import { createClient } from '@metagptx/web-sdk';

// Par défaut, le SDK utilise baseURL '/' (relatif à l'origine de la page) —
// correct uniquement quand le frontend et le backend sont servis depuis le
// même domaine. Quand ils sont déployés séparément (ex. Vercel + Railway),
// VITE_API_BASE_URL doit pointer vers l'URL publique du backend.
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/';

export const client = createClient({ baseURL: apiBaseUrl });