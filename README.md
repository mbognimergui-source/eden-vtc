# Project Summary
EDEN VTC est une plateforme de réservation et de suivi de courses prépayées destinée aux villes africaines. Elle permet aux passagers de commander une course, suivre son état et sa position GPS, gérer leur portefeuille et recevoir des alertes. L’accès passager utilise un numéro camerounais et un code OTP SMS, tandis que la tarification est désormais calculée et contrôlée exclusivement par le serveur.

La zone actuellement desservie est limitée à Douala dans un rayon de 35 km. Les courses sans chauffeur disponible restent en attente. Le paiement portefeuille demeure simulé jusqu’à l’intégration d’Orange Money et de MTN MoMo.

# Project Module Description
- **Application passager**
  - Accueil, commande et attente de course.
  - Suivi du statut et de la position GPS.
  - Wallet, dette, historique et alertes.
  - Connexion par téléphone, validation OTP et création du profil.
- **Authentification téléphone**
  - Normalisation des numéros camerounais au format international.
  - OTP à six chiffres envoyé par Twilio, valable cinq minutes et utilisable une seule fois.
  - Cinq tentatives maximum, délai de renvoi de 60 secondes.
  - Quotas par numéro et par adresse IP.
  - Stockage des empreintes cryptographiques uniquement.
  - Émission du JWT applicatif après validation.
- **Profil passager**
  - Création automatique du compte et de la fiche passager.
  - Collecte du prénom et de la ville lors de la première connexion.
  - Consultation et mise à jour du profil.
- **Dispatch et suivi**
  - Recherche de chauffeurs réels, connectés et disponibles.
  - Maintien de la course en attente lorsqu’aucun chauffeur n’est disponible.
  - Polling coordonné pour le dispatch, le statut, le GPS et les alertes.
  - Pause globale et reprise après les erreurs HTTP 429.
- **Tarification**
  - Calcul du montant côté serveur lors de la commande et de la fin de course.
  - Le montant transmis par le client n’est jamais utilisé pour facturer.
  - Estimation affichée clairement côté client avant validation.
  - Zone limitée à Douala et à un rayon de 35 km.
- **Portefeuille et paiements**
  - Gestion du solde, de la dette et des alertes.
  - Paiement actuellement simulé et signalé comme tel.
  - Intégrations Orange Money et MTN MoMo non encore branchées.
- **Administration et sécurité**
  - Authentification JWT applicative conservée.
  - Ancien parcours navigateur SSO/OIDC retiré, avec routes historiques refusées explicitement.
  - Échange de jeton plateforme conservé pour les accès administrateur.
  - Routes et gardes adaptées au flux téléphonique.

# Directory Tree
- `app/backend/`
  - `alembic/versions/` : migrations de schéma.
  - `core/` : configuration, JWT et base de données.
  - `data_models/` : définitions de données et schémas JSON.
  - `dependencies/` : dépendances FastAPI et utilisateur courant.
  - `middleware/` : sécurité et limitation de débit.
  - `models/` : modèles ORM utilisateurs, passagers et OTP.
  - `routers/` : routes REST d’authentification, téléphone, passagers, courses, wallet, GPS, alertes et dispatch.
  - `services/` : logique métier d’authentification, OTP, tarification, courses et alertes.
  - `tests/` : tests backend.
  - `main.py` : point d’entrée de l’API.
- `app/frontend/src/`
  - `pages/` : écrans passager, connexion téléphone, commande et wallet.
  - `components/` : composants partagés et gardes de routes.
  - `contexts/` : contexte d’authentification.
  - `lib/` : clients API, téléphone et ordonnanceur de polling.
  - `hooks/` : hooks de statut, dispatch, GPS, alertes et authentification.
  - `App.tsx` : montage et routage de l’application.
  - `index.css` : styles globaux.
- `app/frontend/public/` : manifest, mode hors ligne et service worker.
- `app/frontend/package.json` : dépendances et scripts frontend.
- `uploads/paste-text.txt` : document texte joint, non utilisé par le runtime.

# File Description Inventory
- `app/backend/core/auth.py` : création, validation et journalisation sécurisée des JWT applicatifs.
- `app/backend/models/auth.py` : modèle utilisateur compatible avec l’authentification par téléphone.
- `app/backend/services/auth.py` : émission des jetons applicatifs et gestion d’authentification.
- `app/backend/routers/auth.py` : routes `/me`, déconnexion, refus explicite de l’ancien SSO et échange de jeton plateforme pour l’administration.
- `app/backend/services/phone_auth.py` : normalisation des numéros, génération, hachage, quotas, expiration et envoi des OTP Twilio.
- `app/backend/routers/phone_auth.py` : demande et validation des codes SMS ainsi que gestion du profil passager.
- `app/backend/services/pricing.py` : calcul serveur des tarifs et contrôle de la zone desservie.
- `app/backend/services/ride_completion.py` : finalisation des courses et application du tarif serveur.
- `app/backend/routers/ride_dispatch.py` : dispatch des courses vers les chauffeurs réellement disponibles.
- `app/backend/models/phone_otp_requests.py` : modèle ORM des demandes OTP.
- `app/backend/data_models/phone_otp_requests.json` : définition des données OTP.
- `app/backend/models/passengers.py` : modèle passager avec téléphone et ville.
- `app/backend/alembic/env.py` : configuration Alembic excluant les états OIDC historiques.
- `app/frontend/src/lib/phoneAuth.ts` : client du flux téléphone, gestion du JWT, profil et déconnexion.
- `app/frontend/src/pages/PhoneLogin.tsx` : parcours téléphone, code SMS et configuration du profil.
- `app/frontend/src/pages/BookRide.tsx` : commande, estimation tarifaire et attente d’un chauffeur réel.
- `app/frontend/src/pages/Wallet.tsx` : affichage du portefeuille et indication du paiement simulé.
- `app/frontend/src/contexts/AuthContext.tsx` : contexte d’authentification JWT.
- `app/frontend/src/components/RouteGuard.tsx` : protection des routes utilisateur.
- `app/frontend/src/components/ProtectedAdminRoute.tsx` : protection de l’espace administrateur.
- `app/frontend/src/components/SecurityPanel.tsx` : informations de sécurité et d’authentification.
- `app/frontend/src/pages/SetupAccess.tsx` : accès de configuration adapté au parcours actuel.
- `app/frontend/src/pages/Index.tsx` : page d’accueil et accès à la connexion téléphone.
- `app/frontend/src/App.tsx` : déclaration des routes et intégration globale.
- `app/frontend/src/lib/pollingScheduler.ts` : quota global et pause coordonnée des sondages.
- `app/frontend/src/hooks/usePolling.ts` : polling avec repli exponentiel et pause en arrière-plan.
- `app/frontend/src/hooks/useRideStatus.ts` : suivi du statut jusqu’aux états terminaux.
- `app/frontend/src/hooks/useVehicleTracking.ts` : suivi GPS coordonné.
- `app/frontend/src/hooks/useRideDispatch.ts` : suivi coordonné du dispatch.
- `app/frontend/src/hooks/useCashAlerts.ts`, `useSecurityAlerts.ts`, `useUserAlerts.ts` : sondage des alertes.
- `app/frontend/src/hooks/useDebtAlerts.ts` : suivi coordonné de la dette.
- `app/frontend/src/hooks/useDeviceLock.ts` : suivi du verrouillage appareil.
- `app/frontend/src/pages/AuthCallback.tsx` : supprimé avec le parcours OIDC navigateur.
- `app/frontend/src/pages/LogoutCallbackPage.tsx` : supprimé avec le parcours OIDC navigateur.

# Technology Stack
- **Frontend** : React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Leaflet.
- **Backend** : FastAPI, SQLAlchemy asynchrone, Alembic, PostgreSQL.
- **Plateforme** : Atoms Cloud pour l’authentification plateforme, la base de données, le stockage et les fonctions Edge.
- **Authentification** : JWT applicatif, téléphone camerounais et OTP SMS Twilio.
- **Tarification** : service métier serveur dédié.
- **SDK** : `@metagptx/web-sdk`.
- **Intégration SMS** : API REST Twilio via `httpx`.

# Usage
1. Installer les dépendances backend depuis `app/backend/`.
2. Installer les dépendances frontend depuis `app/frontend/`.
3. Configurer `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` et un expéditeur via `TWILIO_PHONE_NUMBER` ou `TWILIO_MESSAGING_SERVICE_SID`.
4. Vérifier que le SID commence par `AC` et comporte 34 caractères, que le token comporte 32 caractères et que l’expéditeur est configuré au format international. Les valeurs actuelles sont invalides ; le service reste donc en état « SMS non prêt ».
5. Configurer les variables JWT, base de données et plateforme nécessaires à l’environnement.
6. Appliquer les migrations backend.
7. Construire le frontend avec le script du projet.
8. Lancer le backend et le frontend avec leurs scripts standards.
9. Activer explicitement `OTP_DEV_MODE` uniquement pour les tests locaux.
10. Vérifier le parcours téléphone, la réception SMS, la validation OTP et la création du profil prénom/ville.
11. Tester les quotas, l’expiration, l’usage unique et les tentatives invalides.
12. Vérifier que le tarif serveur est appliqué à la commande et à la fin de course, indépendamment du montant envoyé par le client.
13. Tester les commandes dans et hors de la zone de Douala.
14. Tester le dispatch sans chauffeur, puis avec un chauffeur réel disponible.
15. Vérifier le comportement du portefeuille et l’indication du paiement simulé.
16. Tester la pause globale des sondages sur HTTP 429 et la reprise après `retry_after`.
17. Exécuter la compilation backend, le lint frontend et le build de production.
