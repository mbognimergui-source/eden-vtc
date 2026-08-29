# CAHIER DES CHARGES — APPLICATION « EDEN VTC » (à coller dans Emergent)

CONFIDENTIEL — ET PUIS QUOI ENCORE SARL · Programme TACO EDEN MOBILITY · 23/07/2026

> Copier-coller le bloc ci-dessous dans le chat de l'agent Emergent (ou dans un fichier `REQUIREMENTS.md` à la racine du projet VS Code), puis lui demander de construire l'application étape par étape.

---

## PROMPT À COLLER DANS EMERGENT

Construis une application de VTC nommée **EDEN VTC** (programme TACO EDEN MOBILITY, Cameroun). Renomme le projet : le nom technique ne doit contenir ni « didi » ni aucune marque tierce (DiDi, Uber, Yango…). Slug recommandé : `eden-vtc-app`.

### 1. Identité et contraintes
- Marque : EDEN VTC — flotte VTC 100 % électrique à Douala (pilote de 35 véhicules).
- Éditeur : ET PUIS QUOI ENCORE SARL, Yaoundé, Cameroun. Contact public : mbogni@epq-cameroun.com · +237 695 27 70 88.
- Langue : français d'abord, anglais en second (i18n prévue dès le départ).
- Monnaie : FCFA (XAF), sans décimales. Fuseau : Africa/Douala.
- INTERDIT dans l'application : tout montant du plan de financement, toute mention de banques ou d'investisseurs, tout document interne. L'app est publique : elle ne contient QUE des contenus clients.
- Couleurs : bleu profond #1F4E5F (principal), or #C9A227 (accent), blanc. Ton sobre et premium.

### 2. Trois espaces
**A. Passager (web mobile-first + PWA)**
- Inscription/connexion par numéro de téléphone (OTP SMS) ; profil minimal.
- Commande de course : départ (GPS ou saisie), destination, estimation du prix AVANT commande, choix immédiat ou réservation planifiée.
- Tarification paramétrable côté admin : prise en charge + FCFA/km + FCFA/min, arrondi aux 100 FCFA ; majorations plages horaires ; courses aéroport/forfaits.
- Suivi du chauffeur en temps réel sur carte, plaque et modèle du véhicule, bouton d'appel masqué.
- Paiement : espèces, Orange Money, MTN MoMo (intégrations à préparer en interfaces/mocks dans un premier temps, activables ensuite).
- Historique des courses, reçus PDF par email, notation du chauffeur (1–5) + commentaire.
- Argument écologique visible : « course 100 % électrique » + CO₂ évité estimé par course (paramètre admin g CO₂/km évité vs thermique).

**B. Chauffeur (web mobile-first + PWA)**
- Connexion par téléphone + code ; statut En ligne / Hors ligne / En course.
- Réception d'une proposition de course (son + décompte 20 s), acceptation/refus, navigation vers le client (lien Google Maps/Waze).
- Journal de la journée : nb courses, recettes du jour, comparaison à l'OBJECTIF de 30 000 FCFA/jour (barre de progression), km parcourus.
- Déclaration de session de recharge : borne, kWh, montant — données alignées sur le tableau de bord Excel EDEN VTC (mêmes champs : date, borne, kWh, prix/kWh, km compteur).
- Fiche véhicule : ID flotte (format EDEN-VTC-001 à 035), modèle, immatriculation, échéance de maintenance.

**C. Administration (web desktop)**
- Tableau de bord flotte : courses du jour, recettes/jour/véhicule vs objectif 30 000 FCFA, taux de disponibilité de la flotte (objectif ≥ 95 %), coût énergie, carte des véhicules.
- ALERTE « règle des −15 % » : si la recette moyenne/véhicule sur 90 jours glissants < 25 500 FCFA/jour, bannière d'alerte visible (paramètres modifiables).
- Gestion : chauffeurs (recrutement, pièces, statut), véhicules (35 max au pilote), grille tarifaire, zones desservies (Douala au lancement ; Yaoundé préparé mais désactivé).
- Exports CSV/Excel des courses, recettes et recharges par véhicule et par mois — colonnes IDENTIQUES au classeur « TDB EDEN VTC » (Date, Nb courses, Espèces, Orange Money, MTN MoMo, Plateforme, Total recettes, Km début, Km fin, kWh, Coût énergie) pour alimenter la feuille FLOTTE sans ressaisie.
- Rôles : superadmin (Gérant), opérateur, lecture seule.

### 3. Exigences techniques
- Stack au choix d'Emergent (React + FastAPI/Node + MongoDB/Postgres), mais : API REST documentée, données horodatées Africa/Douala, sauvegarde quotidienne, variables sensibles en .env (jamais en dur).
- Sécurité : OTP avec limitation de tentatives, chiffrement en transit, journal d'audit des actions admin, RGPD-like (suppression de compte sur demande).
- Hors ligne toléré côté chauffeur (file d'attente des déclarations de recharge).
- Performance cible : utilisable sur Android d'entrée de gamme et réseau 3G.

### 4. Ordre de construction demandé à Emergent
1. Maquettes des 3 espaces (validation avant code).
2. Espace admin + modèle de données + API.
3. Espace chauffeur (dont déclaration de recharge et objectif 30 000).
4. Espace passager (commande, estimation, suivi).
5. Intégrations paiement mobile (interfaces d'abord, activation ensuite).
6. Exports Excel alignés sur le TDB EDEN VTC.
À chaque étape : livrer une version testable et attendre validation avant de continuer.

---

## NOTES POUR LE PROMOTEUR (ne pas coller dans Emergent)
- Renommer le projet Emergent existant (« didi-africa-hub ») ou en créer un nouveau avec le slug `eden-vtc-app`.
- Ne jamais saisir dans Emergent les montants du programme, les lettres bancaires ni la fiche partenaires : l'app et son environnement de prévisualisation sont accessibles par lien.
- L'audit de conformité de l'application existante reste en attente de vos captures d'écran (grille déjà fournie).
- Quand une première version tourne, m'envoyer le lien de prévisualisation « app » (pas le VS Code) et des captures : je ferai la revue de conformité et de qualité.
