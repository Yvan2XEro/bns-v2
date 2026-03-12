# Setup Local - Notes & Corrections

## Prérequis

- **Bun** v1.3.10+
- **Docker & Docker Compose**

## 1. docker-compose.override.yml (obligatoire pour le dev local)

Le `docker-compose.yml` est configuré pour la production (réseau `dokploy-network` externe, pas de ports exposés). Il faut créer un fichier `docker-compose.override.yml` à la racine :

```yaml
services:
  postgres:
    ports:
      - "5432:5432"
  redis:
    ports:
      - "6379:6379"
  meilisearch:
    ports:
      - "7700:7700"

networks:
  dokploy-network:
    external: false
```

Sans ce fichier, les services Docker ne sont pas accessibles depuis `localhost`.

## 2. Variables d'environnement

### `.env` racine

Le `.env.example` à la racine est incomplet. Ajouter ces variables pour le dev local :

```env
DATABASE_URL=postgres://postgres:root@localhost:5432/bns_db
REDIS_URL=redis://default:changeme@localhost:6379
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=changeme-master-key
```

### `.env` par package (important)

Bun charge le `.env` du **dossier courant**, pas celui du parent. Turbo lance chaque package depuis son propre dossier. Il faut donc des `.env` dans chaque package :

- `packages/api/.env` — existe déjà, vérifier que `MEILI_MASTER_KEY` a la bonne valeur
- `packages/search-indexer/.env` — à créer :
  ```env
  MEILISEARCH_HOST=http://localhost:7700
  MEILISEARCH_API_KEY=changeme-master-key
  REDIS_URL=redis://default:changeme@localhost:6379
  ```
- `packages/chat-service/.env` — à créer :
  ```env
  REDIS_URL=redis://default:changeme@localhost:6379
  PORT=4000
  CORS_ORIGIN=http://localhost:3001
  PAYLOAD_API_URL=http://localhost:3000/api
  ```

## 3. Lancement

```bash
# 1. Installer les dépendances
bun install

# 2. Créer le réseau Docker + lancer l'infra
docker network create dokploy-network
docker compose up -d postgres redis meilisearch

# 3. Lancer les services en dev
bun run dev

# 4. Seed de la base (dans un autre terminal, après que l'API soit lancée)
cd packages/api && bun run seed

# 5. Indexer les listings dans Meilisearch
cd packages/search-indexer && bun run reindex
```

## 4. Bugs corrigés

### Meilisearch - primaryKey manquant

`packages/search-indexer/src/meilisearch.ts` : les appels `addDocuments()` doivent spécifier `{ primaryKey: "id" }` sinon Meilisearch échoue car il trouve plusieurs champs finissant par `id` (`id`, `categoryId`, `sellerId`).

### Seed - process qui ne se termine pas

`packages/api/src/seed/seed.ts` : le script ne faisait pas `process.exit(0)` après le seed. Payload CMS garde la connexion DB ouverte, donc le processus restait bloqué.

### search-indexer - Bun.RedisClient.subscribe incompatible

`packages/search-indexer/src/redis.ts` : l'API `Bun.RedisClient.subscribe(channel, callback)` ne supporte pas le pattern callback utilisé. Le service crash au démarrage. A corriger.

---

## 5. Redesign Frontend — Marketplace-Inspired (v2)

Redesign complet inspiré des grands sites marketplace : **Leboncoin**, **Vinted**, **OLX**, **Mercari**, **Facebook Marketplace**. Palette bleu/jaune, design épuré et professionnel.

### Palette de couleurs

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Background | `#F8FAFC` | `#0B1120` | Page background (slate très clair) |
| Foreground | `#0F172A` | `#E2E8F0` | Texte principal |
| Card | `#ffffff` | `#1E293B` | Fond des cartes |
| Primary | `#1E40AF` | `#3B82F6` | CTA, liens, boutons |
| Secondary | `#F1F5F9` | `#1E293B` | Fond secondaire |
| Accent Gold | `#F59E0B` | `#FCD34D` | "N" du logo, bouton Sell, badges boost |
| Muted | `#64748B` / `#94A3B8` | idem | Texte secondaire, captions |
| Border | `#E2E8F0` | `#1E3A5F` | Séparateurs, borders |
| Destructive | `#DC2626` | idem | Erreurs, signalements |

### Fichiers modifiés

| Fichier | Changements |
|---------|-------------|
| `globals.css` | Variables CSS slate-based, dark mode via `prefers-color-scheme`, animations fadeInUp/shimmer/float, pas de scrollbar custom |
| `layout.tsx` | Inter + Plus Jakarta Sans, Footer component, metadata BuyNSell |
| `header.tsx` | **Style Vinted** : compact (h-14), search bar centrée, logo "Buy**N**Sell" (carré bleu + N doré), bouton "Sell now" jaune, scroll detection, mobile menu simplifié |
| `footer.tsx` | **Style Leboncoin** : fond blanc, grille 4 colonnes (brand, marketplace, support, legal), pas d'icônes sociales, copyright centré |
| `button.tsx` | rounded-xl, variant "accent" (jaune `#F59E0B`), focus ring bleu |
| `card.tsx` | rounded-2xl, border bleu clair `#DBEAFE`, shadow subtile |
| `badge.tsx` | rounded-full, variants : warning (jaune), boost (gradient or), success (emerald) |
| `input.tsx` | rounded-xl, fond `#F8FAFF`, focus ring bleu |
| `listing-card.tsx` | **Style Vinted/Leboncoin** : prix en premier (gros, bleu), `timeAgo()` helper, badge nombre d'images, label condition, grille 5 colonnes, ring dorée pour boosted, bouton favoris coeur |
| `page.tsx` | **Hero bleu** avec barre de recherche multi-champs inline (recherche + localisation + bouton), pills de recherche rapide, barre de confiance (users/listings/cities/verified), grille catégories circulaires, section featured fond ambre, listings récents, guide vente 3 étapes, témoignages, CTA bleu |
| `search-client.tsx` | **Sidebar Leboncoin** : panneau filtres 56w sticky à gauche, drawer mobile bottom-sheet, barre search + sort en haut, badge compteur filtres actifs, `filterPanel` réutilisable |
| `listing/[id]/page.tsx` | Layout 3+2 colonnes, breadcrumb, galerie images + thumbnails, prix en premier, `timeAgo`, carte vendeur avec avatar/rating, panneau "Safety tips", lien signalement, badges condition/catégorie |
| `auth/login/page.tsx` | Background gradient dark + blobs flottants, carte blanche centrée avec logo |
| `auth/register/page.tsx` | Même style que login |

### Design patterns marketplace

| Pattern | Inspiration | Implémentation |
|---------|-------------|----------------|
| **Prix en premier** | Leboncoin, Vinted | Prix gros et bleu en haut de chaque carte listing |
| **Sidebar filtres desktop** | Leboncoin | Panneau 56w sticky à gauche sur `/search`, avec catégorie, prix, localisation, attributs dynamiques |
| **Bottom-sheet filtres mobile** | Vinted, OLX | Drawer plein écran depuis le bas avec overlay sombre |
| **Search bar multi-champs** | Leboncoin | Hero avec input recherche + input localisation + bouton dans une seule barre |
| **Quick search pills** | Mercari | Tags cliquables sous la search bar ("iPhone", "Nike", etc.) |
| **Trust bar** | OLX, Mercari | Bande de stats : utilisateurs, annonces, villes, vendeurs vérifiés |
| **Catégories circulaires** | Facebook Marketplace | Grille d'icônes rondes avec fond coloré par catégorie |
| **Carte vendeur sticky** | Leboncoin | Colonne droite sticky avec avatar, rating, boutons message/save, safety tips |
| **timeAgo** | Vinted | "5m ago", "2h ago", "3d ago" au lieu de dates complètes |
| **Header compact** | Vinted | h-14, search centrée, actions à droite, logo à gauche |
| **Footer light** | Leboncoin | Fond blanc, texte gris, structure simple 4 colonnes |
| **Image count badge** | Vinted | Badge "1/5" sur les photos des listings |
