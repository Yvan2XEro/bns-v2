# Spécification technique de la plateforme de petites annonces

Ce document décrit l’architecture technique complète d’une plateforme de petites annonces comparable à Leboncoin/Facebook Marketplace, développée dans un **monorepo** basé sur **Bun**.  Toutes les décisions techniques sont justifiées et chaque service est décrit avec son Dockerfile et son intégration au fichier `docker‑compose.yml`.  Les choix décrits prennent en compte les discussions précédentes et les contraintes opérationnelles : haute performance, modularité et capacité à évoluer vers des fonctionnalités avancées (paiement, recherche, chat temps réel, etc.).

## 1 Choix technologiques

### 1.1 Stack front‑end web

- **Next.js 16** est utilisé pour la partie web.  Next offre un routage basé sur le système de fichiers, un rendu côté serveur (SSR) et des pages statiques avec pré‑rendu, un système d’API intégré et une gestion avancée du SEO.  Ces fonctionnalités sont idéales pour une marketplace où le contenu est indexé par les moteurs de recherche et doit être rapidement accessible.  Pour la structuration, on s’appuie sur le dossier `app` et les fonctionnalités de composition (`layout.js`, `page.js`, segments dynamiques…).
- **Tailwind CSS** avec **shadcn/ui** pour la bibliothèque de composants.  Shadcn/ui s’appuie sur Radix UI et Tailwind CSS ; il fournit des composants accessibles et cohérents.  Les fichiers de style sont partagés dans un package `ui` pour réutiliser la même base sur web et mobile.

### 1.2 Stack mobile

- **Expo + Expo Router** est utilisé pour la partie mobile afin de partager du code React avec la version web.  Expo simplifie les builds iOS/Android, offre une intégration native des caméras, de la géolocalisation et des notifications push, et permet de déployer sur les stores via EAS.
- **Expo UI** : la bibliothèque `@expo/ui` apporte des composants natifs Jetpack Compose (Android) et SwiftUI (iOS).  Elle est conçue pour fournir des entrées entièrement natives depuis React Native ; la documentation explique que `@expo/ui` vise à fournir les composants utilisés fréquemment par une application et qu’ils sont entièrement natifs【169426030116894†L100-L105】.  Les composants Jetpack Compose sont actuellement en alpha, nécessitent un build de développement et doivent être enveloppés dans un composant `Host`【582543692272773†L105-L127】.

### 1.3 Backend et CMS

- **Payload CMS** sert de noyau API.  Ce CMS headless écrit en TypeScript propose un panneau d’administration extensible, un générateur de schémas et un système d’accès/autorisation.  Il expose des API REST et GraphQL pour consommer les ressources.
- **Plugin Better Auth** : pour l’authentification, on utilise le plugin `@payload-auth/payload-auth`.  Ce plugin intègre la bibliothèque Better Auth à Payload CMS et configure automatiquement les collections et endpoints nécessaires.  Better Auth est une solution open‑source et agnostique qui prend en charge l’authentification par e‑mail/mot de passe, les connexions via des fournisseurs OAuth (GitHub, Google, etc.), l’authentification à deux facteurs et la gestion multi‑tenant【2308565949057†L80-L138】.  Le plugin exploite la base de données de Payload pour stocker les utilisateurs et offre un écosystème de plugins pour ajouter des fonctionnalités (par exemple : sessions prolongées, politiques de mot de passe).  Les utilisateurs bénéficient ainsi d’une authentification complète et extensible.
- **Base de données** : PostgreSQL 17 est choisi comme base relationnelle.  Elle stocke les utilisateurs, annonces et autres entités.  Les fichiers médias (images des annonces) sont stockés sur un service S3 compatible (par ex. Cloudflare R2 ou MinIO).

### 1.4 Moteur de recherche

Une marketplace a besoin d’un moteur de recherche performant.  **Meilisearch** est choisi comme service dédié.  La documentation de Meilisearch décrit ses principaux atouts : réponses en moins de 50 ms, mise à jour des résultats à chaque frappe (« search as you type »), tolérance aux fautes d’orthographe, support multilingue, filtrage et recherche facettée【735167222150070†L208-L242】.  On indexe les annonces dans Meilisearch et on implémente une synchronisation via un service `indexer` : lorsqu’une annonce est créée ou modifiée dans Payload, un hook envoie les données à Meilisearch.

### 1.5 Paiement

Pour les fonctionnalités payantes (boost des annonces, abonnements pro), l’intégration se fait via **Notch Pay**.  La documentation présente Notch Pay comme une plateforme de paiement conçue pour l’Afrique : elle permet de traiter des paiements via Mobile Money et d’autres méthodes locales, prend en charge plusieurs devises et canaux【860772324498437†L95-L126】.  Notch Pay est construit pour l’écosystème africain, avec un support spécifique pour les réseaux Mobile Money et des devises multiples【860772324498437†L231-L238】.  La plateforme met l’accent sur la sécurité (infrastructure conforme PCI DSS, détection de fraudes et disponibilité 99,9 %)【860772324498437†L242-L249】 et propose une API REST et des SDK pour faciliter l’intégration【860772324498437†L253-L260】.

### 1.6 Service de chat temps réel

Afin d’isoler les responsabilités et de garantir la scalabilité, le chat temps réel est implémenté comme un **service indépendant**.  Il s’agit d’un serveur Node.js/TypeScript (pouvant être exécuté via Bun pour la performance) utilisant WebSocket (ou Socket.io) pour gérer la communication en temps réel.  Le chat stocke les messages dans PostgreSQL (ou dans une base dédiée) et utilise Redis pour la diffusion en pub/sub.  Cette séparation permet d’éviter de surcharger l’API Payload avec des connexions WebSocket et simplifie le scaling horizontal.

### 1.7 Cache et queue

- **Redis** est utilisé comme cache (pour les sessions, le contenu le plus consulté) et pour la file de tâches (BullMQ ou Kue) afin de gérer l’envoi d’e‑mails, de notifications et les tâches asynchrones.
- **BullMQ** est une file de messages basée sur Redis qui gère des jobs (ex. envoi d’e‑mails, indexation Meilisearch, notifications push).  Chaque service producteur pousse un message dans la file et un worker dédié le traite.

### 1.8 Stockage des médias

Les images et vidéos des annonces sont stockées dans un service compatible S3.  En local, on peut utiliser **MinIO** ; en production, **Cloudflare R2** ou **Amazon S3** assurent la disponibilité et la distribution via CDN.

### 1.9 Bun et monorepo

Bun est utilisé comme exécuteur et gestionnaire de paquets.  Bun supporte nativement les **workspaces** (concept de monorepo) dans le `package.json`.  La documentation explique que les workspaces permettent de développer un logiciel complexe sous la forme de plusieurs packages indépendants dans un même dépôt et qu’il est courant de placer les packages dans un dossier `packages`【318418047724717†L71-L101】.  Chaque workspace possède son propre `package.json` et peut référencer les autres packages via la syntaxe `workspace:*`【318418047724717†L131-L134】.  Bun installe les dépendances de toutes les workspaces et dé‑duplique les paquets partagés【318418047724717†L177-L186】.  Grâce au flag `--filter`, on peut n’installer ou exécuter des scripts que pour certaines workspaces【318418047724717†L147-L156】.  La documentation souligne également que les workspaces réduisent l’usage disque et minimisent les problèmes de versions multiples【318418047724717†L177-L186】, et que l’installation est très rapide : environ 28 × plus rapide qu’avec npm【318418047724717†L200-L202】.

### 1.10 Formatage et linting

Afin d’assurer une cohérence de style dans l’ensemble du monorepo, nous adoptons **Biome** comme outil unique de linting et de formatage.  Biome est un projet écrit en Rust qui combine les fonctionnalités de Prettier et d’ESLint tout en offrant d’excellentes performances.  Chaque package inclut un fichier de configuration `biome.json` et expose des scripts `format` et `lint` dans son `package.json`.  Les développeurs exécutent `biome format` pour formater automatiquement le code (TypeScript, JavaScript, JSON, CSS) et `biome lint` pour appliquer des règles de qualité.  L’intégration de Biome supprime la nécessité d’outils multiples et garantit un code uniforme sur le web, mobile et backend.

## 2 Architecture globale

### 2.1 Vue d’ensemble

```
                 ┌─────────────────────────────┐
                 │        Mobile (Expo)        │
                 └──────────────┬──────────────┘
                                │
                 ┌──────────────▼──────────────┐
                 │        Web (Next.js)        │
                 └──────────────┬──────────────┘
                                │
                                │    API REST/GraphQL
                                ▼
       ┌───────────────────────────────────────────────┐
       │              API (Payload CMS)               │
       │  • Schemas : Annonces, Utilisateurs, Catégories│
       │  • Authentification Better Auth              │
       │  • Hooks : indexation, webhooks Notch Pay    │
       │  • Stockage S3 via adaptateur Payload        │
       └──────────────┬──────────────┬────────────────┘
                      │              │
          ┌───────────▼───┐   ┌──────▼───────────┐
          │  Moteur de    │   │ Service de chat │
          │  recherche    │   │   temps réel    │
          │  (Meilisearch)│   │ (WebSocket +    │
          └───────────────┘   │  Redis pub/sub) │
                              └────────┬────────┘
                                       │
                                       ▼
                         ┌───────────────────────────┐
                         │   Base de données (PG)    │
                         │   + Redis + MinIO/S3      │
                         └───────────────────────────┘
```

### 2.2 Échanges entre services

1. **Publication d’une annonce** : un utilisateur connecté (via Better Auth) envoie la requête au backend Payload.  La création déclenche un hook qui :
   1. stocke les images via l’adaptateur S3 ;
   2. enregistre l’entité dans PostgreSQL ;
   3. pousse un message dans la file BullMQ pour indexer l’annonce dans Meilisearch.
2. **Recherche** : le client web ou mobile interroge le service `search` via un endpoint (api/routes/search) qui envoie la requête à Meilisearch.  Meilisearch retourne les identifiants des annonces ; l’API récupère ensuite les détails auprès de Payload.
3. **Boost d’une annonce** : l’utilisateur initie un paiement via Notch Pay.  Le backend crée un paiement via l’API Notch Pay ; lorsque le webhook de succès est reçu, l’annonce est marquée comme « boostée » et un job repositionne sa priorité dans Meilisearch.
4. **Chat** : les clients se connectent au service de chat via WebSocket.  Le chat authentifie le token JWT (émis par Better Auth) et gère la diffusion des messages via Redis.  Les notifications (push ou e‑mail) sont traitées via BullMQ.

## 3 Structure du monorepo

Le dépôt utilise les workspaces Bun pour organiser les services.  La structure suivante est proposée :

```
root/
├── package.json          # Configuration globale avec "workspaces"
├── bun.lockb             # Lockfile Bun
├── tsconfig.json         # Config TypeScript partagée
├── docker-compose.yml    # Composition de tous les services
├── .env*                 # Fichiers d'environnement
├── packages/
│   ├── web/              # Application Next.js
│   │   ├── app/
│   │   ├── public/
│   │   ├── tailwind.config.ts
│   │   ├── next.config.mjs
│   │   └── package.json
│   ├── mobile/           # Application Expo + Expo Router
│   │   ├── app/
│   │   ├── assets/
│   │   ├── app.config.ts
│   │   ├── package.json
│   ├── api/              # Payload CMS + hooks + config
│   │   ├── src/
│   │   │   ├── payload.config.ts
│   │   │   ├── collections/
│   │   │   ├── hooks/
│   │   │   └── indexer.ts
│   │   └── package.json
│   ├── chat-service/     # Service WebSocket
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   └── handlers/
│   │   └── package.json
│   ├── search-indexer/   # Worker d’indexation Meilisearch
│   │   ├── src/
│   │   │   └── indexer.ts
│   │   └── package.json
│   ├── ui/               # Composants partagés (shadcn/ui, Tailwind)
│   │   ├── src/
│   │   │   └── components/
│   │   └── package.json
│   └── utils/            # Utilitaires (validations, libs communes)
│       └── package.json
└── scripts/
    └── migrate.ts        # Script pour migrer la base, exécuter les migrations
```

Le fichier racine `package.json` utilise :

```json
{
  "name": "marketplace-monorepo",
  "version": "1.0.0",
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:web": "bun run --filter web dev",
    "dev:mobile": "bun run --filter mobile start",
    "dev:api": "bun run --filter api dev",
    "dev:chat": "bun run --filter chat-service dev",
    "dev:indexer": "bun run --filter search-indexer dev",
    "build": "bun run --filter web build && bun run --filter api build",
    "lint": "bun run --filter ui lint"
  },
  "devDependencies": {
    "@types/node": "latest",
    "typescript": "latest"
  }
}
```

Chaque package a son propre `package.json` avec ses dépendances spécifiques et référence les packages internes via `workspace:*` afin d’être résolu localement【318418047724717†L131-L134】.  On obtient ainsi une meilleure isolation et un versionning indépendant des modules.

## 4 Dockerfiles et docker‑compose

### 4.1 API (Payload CMS)

Créez un fichier `packages/api/Dockerfile` :

```Dockerfile
# Étape build
FROM oven/bun:1.0 AS build
WORKDIR /app
COPY . ./
RUN bun install
RUN bun run build

# Étape production
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Ce Dockerfile utilise Bun pour installer les dépendances et construire le projet.  Ensuite, l’image finale exécute le build dans un conteneur Node alpine.  Les variables d’environnement (database, JWT secret, clés Notch Pay) sont définies via le fichier `.env`.  Le serveur Payload écoute sur le port 3000.

### 4.2 Service de recherche (Meilisearch)

Le service Meilisearch se base directement sur l’image officielle :

```Dockerfile
FROM getmeili/meilisearch:v1.8
ENV MEILI_MASTER_KEY="master_key"
ENV MEILI_ENV="production"
EXPOSE 7700
```

### 4.3 Service de chat

`packages/chat-service/Dockerfile` :

```Dockerfile
FROM oven/bun:1.0 AS build
WORKDIR /app
COPY . ./
RUN bun install

EXPOSE 4000
CMD ["bun", "src/server.ts"]
```

Le serveur WebSocket écoute sur le port 4000 et utilise Redis (défini par la variable `REDIS_URL`) pour publier et souscrire aux messages.

### 4.4 Search indexer

Le worker d’indexation utilise Bun et Node :

```Dockerfile
FROM oven/bun:1.0
WORKDIR /app
COPY . ./
RUN bun install
CMD ["bun", "src/indexer.ts"]
```

### 4.5 Application web

`packages/web/Dockerfile` :

```Dockerfile
FROM oven/bun:1.0 AS build
WORKDIR /app
COPY . ./
RUN bun install
RUN bun run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
```

### 4.6 Docker Compose

Le fichier `docker‑compose.yml` à la racine décrit l’ensemble des services et leurs dépendances :

```yaml
version: '3.9'
services:
  api:
    build: ./packages/api
    environment:
      - DATABASE_URL=postgres://postgres:postgres@db:5432/marketplace
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY=minio
      - S3_SECRET_KEY=minio123
      - NOTCHPAY_SECRET=${NOTCHPAY_SECRET}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
    depends_on:
      - db
      - redis
      - minio
    ports:
      - "8000:3000"

  web:
    build: ./packages/web
    environment:
      - API_URL=http://api:3000
    depends_on:
      - api
    ports:
      - "3000:3000"

  chat:
    build: ./packages/chat-service
    environment:
      - REDIS_URL=redis://redis:6379
      - PORT=4000
    depends_on:
      - redis
    ports:
      - "4000:4000"

  indexer:
    build: ./packages/search-indexer
    environment:
      - MEILI_URL=http://search:7700
      - MEILI_MASTER_KEY=master_key
      - QUEUE_URL=redis://redis:6379
    depends_on:
      - search
      - redis

  search:
    image: getmeili/meilisearch:v1.8
    environment:
      - MEILI_MASTER_KEY=master_key
      - MEILI_ENV=production
    volumes:
      - meili_data:/data.ms
    ports:
      - "7700:7700"

  db:
    image: postgres:17
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=marketplace
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minio
      - MINIO_ROOT_PASSWORD=minio123
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  pg_data:
  meili_data:
  minio_data:
```

Ce fichier définit l’API, l’application web, le service de chat, le worker d’indexation, Meilisearch, PostgreSQL, Redis et MinIO.  Les ports exposés peuvent être adaptés en fonction de l’environnement (locally vs production).  Les secrets de Notch Pay et Better Auth sont injectés via des variables d’environnement.

## 5 Implémentation des fonctionnalités clés

### 5.1 Création et gestion d’annonces

- **Schéma Payload** : la collection `Listings` contient les champs communs (titre, description, prix, état, localisation) et un champ JSON `attributes` pour stocker des attributs dynamiques selon la catégorie (ex. marque, kilométrage).  Les images sont stockées via le champ de type `upload` configuré avec l’adaptateur S3.
- **Vérification et modération** : un champ `status` (draft, pending, published, rejected) contrôlé par un rôle administrateur.  La modération peut être automatisée (ex. via un hook anti‑spam) et/ou manuelle via l’interface admin.
- **Boost de visibilité** : un champ `boostExpiry` indique la date d’expiration du boost.  Lorsqu’un paiement Notch Pay est confirmé par webhook, ce champ est mis à jour.  Le tri par défaut dans Meilisearch prend en compte l’état `boost` et la date de création.

### 5.2 Authentification et comptes utilisateur

Le plugin Better Auth crée automatiquement les collections nécessaires et les endpoints d’authentification Better Auth【612196775257046†L320-L334】.  La configuration se fait dans `payload.config.ts` :

```ts
import { buildConfig } from 'payload';
import { betterAuthPlugin } from '@payload-auth/payload-auth';

export default buildConfig({
  collections: [ /* Users, Listings, Categories, Messages, etc. */ ],
  plugins: [
    betterAuthPlugin({
      betterAuth: {
        appName: process.env.APP_NAME,
        secret: process.env.BETTER_AUTH_SECRET,
      },
    }),
  ],
});
```

Better Auth apporte la connexion par e‑mail/mot de passe, l’authentification via les fournisseurs OAuth, la récupération de mot de passe et la possibilité d’activer l’authentification multi‑facteur.

### 5.3 Recherche et filtres

Le service Meilisearch est configuré avec des index pour les annonces.  Les champs d’index incluent : titre, description, catégorie, ville, prix, date de création et attributs dynamiques.  Les fonctionnalités offertes par Meilisearch – recherche à la frappe, tolérance aux fautes, filtres et facettes【735167222150070†L208-L242】 – permettent d’implémenter un champ de recherche avec suggestions et des filtres multi‑critères (prix, catégorie, localisation, état).  Les règles de ranking tiennent compte du boost, de la date et de la pertinence.

### 5.4 Paiement Notch Pay

Lorsqu’un utilisateur souhaite booster son annonce :

1. L’application envoie une requête à l’API qui appelle l’endpoint `/payment` de Notch Pay avec le montant correspondant.
2. Notch Pay génère un lien de paiement ou une session ; l’utilisateur est redirigé vers la page de paiement.  Notch Pay est conçu pour l’Afrique et prend en charge les moyens de paiement locaux (Mobile Money, cartes bancaires) et plusieurs devises【860772324498437†L95-L126】.  La plateforme supporte des réseaux Mobile Money et des devises africaines【860772324498437†L231-L238】.
3. Après paiement, Notch Pay appelle un webhook défini (`/api/payment/webhook`).  Le serveur valide la signature et met à jour l’annonce (champ `boostExpiry`).
4. Un job (via BullMQ) remonte l’annonce dans Meilisearch.

### 5.5 Service de chat temps réel

Le service WebSocket écoute les connexions des utilisateurs.  Au moment de la connexion, le client transmet un token JWT signé par Better Auth.  Le serveur vérifie le token, associe l’utilisateur à un canal (ex. `listing/<id>`), et utilise Redis pub/sub pour transmettre les messages.  Les messages sont stockés dans la base et peuvent être récupérés via l’API.

Un microservice de notifications s’abonne aux événements du chat et envoie des notifications push via Expo Notifications, ou des e‑mails, selon les préférences de l’utilisateur.

### 5.6 Utilisation de Bun

Bun est utilisé pour l’ensemble des packages Node/TypeScript.  Ses workspaces permettent de structurer facilement un dépôt multi‑services.  Les principales raisons sont :

- **Développement monorepo** : les workspaces permettent de développer des packages indépendants dans un même dépôt【318418047724717†L71-L101】.  On peut organiser `api`, `web`, `mobile` et `chat-service` séparément et partager du code dans `ui` et `utils`.
- **Dé‑duplication des dépendances** : Bun installe les dépendances communes au niveau racine et évite les duplications, réduisant l’espace disque et les conflits de version【318418047724717†L177-L186】.
- **Performances** : l’installation est très rapide, environ 28 × plus rapide qu’avec npm【318418047724717†L200-L202】.  Cela réduit le temps de CI/CD et accélère le développement.

## 6 Conclusion

Cette spécification décrit une architecture modulaire et scalable pour une plateforme de petites annonces.  L’utilisation d’un monorepo géré par Bun facilite le partage de code et la maintenance.  Les services sont isolés (API, recherche, chat, indexer) et communiquent via des files de messages et des appels HTTP.  Les choix techniques – Next.js pour le web, Expo pour le mobile, Payload CMS pour l’API, Meilisearch pour la recherche et Notch Pay pour les paiements – reposent sur des sources fiables et des bonnes pratiques : Meilisearch fournit des recherches instantanées avec tolérance aux fautes【735167222150070†L208-L242】, Notch Pay est conçu pour le marché africain【860772324498437†L95-L126】 et offre des méthodes de paiement locales sécurisées【860772324498437†L242-L249】, et le plugin Better Auth enrichit l’authentification de Payload【612196775257046†L320-L334】.  Cette base technique fournit un socle robuste pour développer une marketplace performante et extensible.
