# Guide UI/UX pour l’application web marketplace

Ce document décrit les recommandations d’interface (UI) et d’expérience utilisateur (UX) pour la version web de la plateforme de petites annonces.  L’objectif est de proposer une interface intuitive, accessible et optimisée pour le référencement, tout en offrant un parcours utilisateur fluide et agréable.

## 1 Principes généraux

1. **Responsive design** : l’interface doit s’adapter à toutes les tailles d’écran.  Utilisez des grilles flexibles et des composants responsives (Tailwind CSS, Radix UI via shadcn/ui) afin que le site soit utilisable sur ordinateurs, tablettes et mobiles.
2. **Accessibilité (A11y)** : respectez les normes WCAG 2.1.  Les composants doivent être navigables au clavier, disposer de contrastes suffisants, et être compatibles avec les lecteurs d’écran.  Utilisez les hooks ARIA de shadcn/ui pour ajouter des attributs ARIA appropriés.
3. **Performance et SEO** : exploitez le rendu côté serveur de Next.js pour pré‑rendre les pages importantes (accueil, pages de catégories, pages d’annonces).  Ajoutez les balises `meta` (OG, description) pour chaque annonce et générez un sitemap.  Prévoyez l’optimisation des images (Next Image) et la mise en cache (ISR) pour améliorer le temps de chargement.
4. **Cohérence visuelle** : utilisez une charte graphique définie (couleurs, typographie, espacement).  Le design doit être minimaliste, avec beaucoup d’espace blanc et des cartes claires afin de mettre en valeur les annonces.  Les boutons et liens doivent être facilement identifiables.

## 2 Parcours utilisateur

### 2.1 Accueil

- Afficher un bandeau principal avec un champ de recherche global et, éventuellement, des suggestions (ex. « Rechercher une voiture d’occasion », « Voir les annonces près de chez vous »).
- Proposer une navigation claire vers les grandes catégories (Immobilier, Véhicules, Électronique, etc.).  Une grille de cartes illustrées facilite la découverte.
- Mettre en avant les annonces boostées ou les catégories populaires dans une section dédiée.
- Ajouter des appels à l’action pour inciter l’utilisateur à publier une annonce (« Déposer une annonce »).

### 2.2 Recherche et liste des annonces

- **Barre de recherche** : implantée en haut de page et présente sur toutes les pages.  Utiliser l’autocomplétion via Meilisearch (recherche à la frappe).  Les filtres fréquents (catégorie, localisation, prix, état) doivent être accessibles sous la barre de recherche.
- **Filtres et tri** : affichés dans une barre latérale ou un panneau pliable sur mobile.  Inclure des curseurs de prix, des sélecteurs multi‑catégories, un champ de localisation (avec auto‑complétion), un sélecteur d’état (neuf/occasion), la distance (en km) et un ordre de tri (plus récent, prix croissant, distance).
- **Affichage des annonces** : sous forme de grille de cartes.  Chaque carte présente une photo principale, le titre, le prix, la localisation et la date.  Utiliser un skeleton loader pendant le chargement.
- **Pagination vs scroll infini** : choisir le scroll infini pour une navigation fluide.  Charger des lots d’annonces au fur et à mesure que l’utilisateur descend la page.  Conserver la position de scroll lorsque l’utilisateur revient à la liste après avoir consulté une annonce.

### 2.3 Page d’annonce (détail)

- **Galerie d’images** : un carrousel avec zoom.  Privilégier un ratio 4:3 ou 1:1.  L’utilisateur peut défiler ou cliquer pour agrandir.
- **Informations clés** : afficher en tête le titre, le prix, la localisation et la date de mise en ligne.  Ajouter un badge si l’annonce est boostée ou vérifiée.
- **Description** : proposer une mise en page claire (textes courts, listes pour les caractéristiques).  Afficher les attributs dynamiques propres à la catégorie (kilométrage, surface, etc.).
- **Actions** : boutons pour contacter le vendeur (ouvrir le chat), sauvegarder l’annonce (favori), signaler ou partager.  Les actions doivent être visibles et différenciées (ex. bouton principal « Envoyer un message » coloré, bouton secondaire pour sauvegarder).
- **Recommandations** : en bas de page, afficher des annonces similaires basées sur la catégorie, la localisation ou le prix.  Utiliser Meilisearch pour cette fonctionnalité.

### 2.4 Publication d’une annonce

- **Processus en plusieurs étapes** : demander d’abord la catégorie, puis le titre, la description, le prix, la localisation et enfin l’upload des photos.  Diviser en étapes améliore la complétion.
- **Aide contextuelle** : afficher des indications (par ex. « Max 10 photos », « Soyez précis dans la description »).  Valider les champs en temps réel et afficher des messages d’erreur clairs.
- **Progression** : utiliser une barre de progression ou des étapes numérotées pour guider l’utilisateur.
- **Action finale** : bouton « Publier » qui envoie la requête à l’API.  Informer l’utilisateur qu’une modération est en cours si nécessaire.

### 2.5 Compte utilisateur et tableau de bord

- **Tableau de bord** : fournir une vue d’ensemble des annonces en cours, vendues, expirées et sauvegardées.  Afficher les statistiques d’affichage et les messages reçus.
- **Profil** : l’utilisateur peut modifier ses informations (nom, photo, numéro de téléphone, préférences).  Indiquer clairement son niveau de vérification (badge vérifié).
- **Messages** : afficher la liste des conversations de chat.  Utiliser des badges de notification pour les messages non lus.  Lors de la consultation d’une conversation, permettre l’envoi de photos et offrir un champ de texte avec auto‑ajustement.

### 2.6 Favoris et alertes

Pour améliorer la rétention, la plateforme doit offrir des fonctionnalités de **favoris** et d’**alertes** :

- **Espace Favoris** : accessible depuis le tableau de bord ou le menu principal, il regroupe toutes les annonces sauvegardées par l’utilisateur.  Les cartes y reprennent le même design que la liste générale avec possibilité de supprimer le favori.  
- **Alertes de recherche** : permettre à l’utilisateur d’enregistrer des critères (mots‑clés, filtres, localisation).  Les nouvelles annonces correspondant à ces critères déclenchent une notification ou un e‑mail.  Les lignes directrices expliquent que des fonctionnalités comme les **saved searches** et les recommandations personnalisées améliorent l’expérience en ligne et la conversion【906002409455280†L150-L167】.  
- **Suggestions personnalisées** : proposer des annonces similaires ou des catégories recommandées en fonction des favoris et des recherches de l’utilisateur.

### 2.7 Notes, avis et réputation

La confiance est essentielle dans les marketplaces.  L’interface doit intégrer des éléments de **social proof** :

- **Système de notation** : chaque annonce et chaque vendeur affichent une note moyenne (étoiles) et le nombre d’avis.  Les utilisateurs peuvent laisser une note et un commentaire après une transaction ou une conversation aboutie.  
- **Badge et vérification** : montrer le statut vérifié du vendeur et son badge (ex. « Vendeur top »).  
- **Page de profil vendeur** : afficher la photo du vendeur, sa note, ses avis publics et un bouton « Signaler »【487079287601171†L587-L602】.  Mettre en avant la réputation et la transparence encourage l’achat【906002409455280†L249-L270】.

### 2.8 Paiement et boost de visibilité

Lorsque les vendeurs souhaitent augmenter la visibilité de leurs annonces, l’interface propose un parcours de **paiement** intuitif :

- **Bouton « Booster l’annonce »** dans la page d’annonce et dans le tableau de bord.  Cliquer ouvre un panneau latéral ou une modale résumant les offres (durée de mise en avant, coût).  
- **Flux de paiement Notch Pay** : redirection ou intégration in‑app vers la page de paiement.  Les meilleures pratiques de checkout recommandent de proposer plusieurs options de paiement et d’utiliser des indicateurs de progression clairs【906002409455280†L211-L234】.  Prévoir le paiement en tant qu’invité pour éviter de forcer l’inscription【906002409455280†L211-L234】.  
- **Confirmation et expiration** : afficher un message de succès et indiquer la date d’expiration du boost.  Permettre au vendeur de renouveler facilement l’option.

### 2.9 Onboarding et authentification

Le processus d’inscription doit réduire la friction :

- **Navigation sans inscription** : laisser les acheteurs parcourir les annonces, ajouter des favoris ou créer des alertes avant de s’inscrire.  La recherche recommande d’éviter les logins obligatoires trop tôt pour améliorer la conversion【906002409455280†L116-L127】.  
- **Inscription en plusieurs étapes** : demander l’e‑mail, le mot de passe et des informations de base sur une seule page pour les acheteurs.  Pour les vendeurs, utiliser un flux guidé avec des barres de progression (création du profil, ajout des informations bancaires, vérification d’identité)【906002409455280†L131-L136】.  
- **Authentification sociale** : proposer des connexions via Google, Facebook ou Apple.  Inclure la récupération de mot de passe et l’authentification à deux facteurs via le plugin Better Auth.

### 2.10 Modération et sécurité

Pour préserver un environnement sûr, l’interface doit intégrer des mécanismes de **signalement** et de **modération** :

- **Boutons de signalement** : sur les pages d’annonce, de profil et de conversation, un lien « Signaler » ouvre un formulaire permettant de sélectionner un motif (spam, contenu inapproprié, fraude).  
- **Affichage des règles** : rappeler les règles de la communauté lors de la création d’une annonce et dans le chat.  Le guide de modération de Stream conseille d’afficher les guidelines là où les décisions sont prises et de prévoir des flux de signalement et d’appel transparents【261606220854261†L330-L359】.  
- **Moderation hybride** : combiner une modération automatisée (détection de spam, filtres grossiers) et une revue humaine pour les cas litigieux【261606220854261†L362-L470】.  
- **Audit et historique** : stocker les signalements et leur résolution afin de garantir la transparence.

### 2.11 Tableau de bord vendeur

Le tableau de bord doit fournir à un vendeur tous les éléments nécessaires pour gérer ses annonces :

- **Statistiques** : nombre de vues, de favoris, de messages, de transactions réalisées.  
- **Gestion rapide** : boutons pour modifier, dupliquer, mettre en pause ou supprimer une annonce.  Proposer également un accès direct au renouvellement du boost.  
- **Revenue et paiement** : afficher un historique des paiements reçus (si la plateforme gère les transactions), la date de versement et les frais éventuels.  
- **Avis reçus** : permettre au vendeur de consulter les commentaires et notes laissés par les acheteurs afin d’améliorer la qualité de ses annonces.  
- **Notifications** : signaler les actions à effectuer (annonce expirée, nouvelle offre).  Les lignes directrices recommandent des dashboards clairs avec des labels d’état et un accès rapide aux actions principales【906002409455280†L169-L173】.  

### 2.12 Notifications

Le site doit informer l’utilisateur des événements importants :

- **Notifications en temps réel** : via WebSocket ou SSE, informer des nouveaux messages, des réponses à une annonce, des alertes de recherche et des confirmations de paiement.  
- **Toasts et badges** : afficher des toasts pour confirmer les actions (annonce publiée, favori ajouté) et utiliser des badges numérotés dans le menu pour indiquer les messages non lus.  
- **Centre de notifications** : accessible depuis le tableau de bord, il regroupe l’historique des notifications (boosts expirés, alertes, avis reçus).  

## 3 Composants et design system

- **Composants shadcn/ui** : utiliser les composants existants (Button, Input, Select, Dialog, Card, Tabs, DropdownMenu, Tooltip, Avatar…).  Les étendre via un package `ui` commun afin de personnaliser la palette et les styles.
- **Couleurs** : définir une palette principale (couleur d’accent, arrière‑plan clair/sombre, couleurs secondaires).  Prévoir un thème sombre dès le départ ; Next.js permet de détecter la préférence système.
- **Typographie** : choisir deux polices (titre et texte) et gérer les tailles via des classes Tailwind (`text-sm`, `text-lg`, etc.).  Respecter une hiérarchie claire (H1 : titre de page, H2 : sous‑titre, etc.).
- **Icônes** : utiliser `lucide-react` ou `heroicons` pour les icônes.  Assurer la cohérence des tailles et des marges.

## 4 Interactions et micro‑animations

- **Feedback visuel** : utiliser des états `hover` et `active` sur les boutons, des transitions douces lorsque l’utilisateur ouvre des menus ou des modales.  Les animations doivent être subtiles pour ne pas distraire.
- **Notifications** : afficher une toast lors de la réussite ou de l’échec d’une action (par ex. annonce publiée, message envoyé).  Les erreurs doivent être explicites et aider l’utilisateur à corriger la saisie.
- **Gestion des formulaires** : valider les données côté client avant de les envoyer (taille des images, format des champs).  Afficher les erreurs près des champs concernés.

## 5 Accessibilité et inclusivité

- Ajouter des labels et `aria-describedby` pour tous les champs de formulaire.
- Utiliser des contrastes suffisants (ratio WCAG AA minimum) pour les textes et les boutons.
- Tester la navigation au clavier et fournir des indications visuelles (focus rings).
- Prévoir l’internationalisation : toutes les chaînes de texte doivent être prêtes à être traduites.

## 6 Optimisation de la performance

- **Chargement des images** : utiliser le composant `next/image` pour un chargement optimisé et un redimensionnement automatique.  Prévoir un placeholder flou.
- **Priorité du contenu** : charger en priorité les éléments visibles et différer le reste.  Utiliser `loading="lazy"` pour les images hors écran.
- **Caching** : tirer parti de l’ISR et de la mise en cache des pages Next.js pour les listings et les catégories.  Coupler avec un CDN.

## 7 Sécurité et confiance

- Les actions sensibles (suppression d’annonce, édition) doivent demander une confirmation (modale).  Utiliser des tokens CSRF pour les formulaires.
- Afficher clairement les politiques de confidentialité et les conditions d’utilisation.
- Mettre en avant les badges de vérification des utilisateurs et les scores de réputation pour instaurer la confiance.

## Conclusion

Ce guide UI/UX fournit les lignes directrices essentielles pour concevoir l’interface web d’une marketplace moderne.  En combinant les composants shadcn/ui, Tailwind CSS et Next.js, il est possible de créer une expérience accessible, performante et attrayante.  Ces principes doivent être adaptés en fonction des feedbacks des utilisateurs et des évolutions futures de l’application.
