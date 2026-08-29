# Architecture Design

## System Overview
Application VTC full-stack avec frontend React (mobile-first PWA) et backend Atoms Cloud. Trois espaces : Passager, Chauffeur, Administration.

## Tech Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS + Shadcn/ui
- Backend: Atoms Cloud (Auth, PostgreSQL, Object Storage, Edge Functions)
- SDK: @metagptx/web-sdk pour l'accès aux données et l'authentification

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| Accueil | Landing page, navigation, branding | src/pages/Index.tsx |
| Commande | Estimation prix, commande course, paiement | src/pages/BookRide.tsx |
| Portefeuille | Solde, rechargement, dette, historique | src/pages/Wallet.tsx |
| Historique | Liste des courses passager | src/pages/MyRides.tsx |
| Chauffeur | Dashboard, objectif, recharge, véhicule | src/pages/DriverDashboard.tsx |
| Admin | Flotte, KPIs, alertes, exports | src/pages/AdminDashboard.tsx |
| i18n | Traductions fr/en | src/lib/i18n.ts |
| Client | SDK Atoms Cloud | src/lib/client.ts |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| State management | React useState + SDK queries | Simple, pas besoin de store global |
| Routing | React Router v6 | Standard, léger |
| Styling | Tailwind + Shadcn/ui | Rapide, composants prêts |
| Backend | Atoms Cloud entities | CRUD auto-généré, auth intégrée |
| Export | CSV côté client | Pas besoin de backend pour l'export |

## File Tree Plan
```
app/frontend/src/
├── App.tsx              # Routes principales
├── index.css            # Thème EDEN VTC
├── lib/
│   ├── client.ts        # SDK Atoms Cloud
│   └── i18n.ts          # Internationalisation
├── pages/
│   ├── Index.tsx        # Page d'accueil
│   ├── BookRide.tsx     # Commande de course
│   ├── Wallet.tsx       # Portefeuille
│   ├── MyRides.tsx      # Historique courses
│   ├── DriverDashboard.tsx  # Espace chauffeur
│   └── AdminDashboard.tsx   # Administration
app/backend/
├── models/              # ORM auto-généré
├── services/            # Logique métier auto-générée
└── routers/             # API REST auto-générées
```

## Implementation Guide
1. Auth via Atoms Cloud (client.auth.toLogin / client.auth.me)
2. Entities CRUD via web-sdk (client.entities.*)
3. Tarification calculée côté frontend (base + km + min)
4. Wallet avec gestion de dette (has_pending_debt flag)
5. Export CSV aligné sur colonnes TDB EDEN VTC