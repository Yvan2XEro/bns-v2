# Guide UI/UX pour l’application mobile (Expo)

Ce document décrit les bonnes pratiques d’interface et d’expérience utilisateur pour la version mobile de la plateforme de petites annonces, développée avec **Expo**, **Expo Router** et **Expo UI**.  L’objectif est d’offrir une expérience native fluide et cohérente sur iOS et Android, en tirant parti des composants Jetpack Compose et SwiftUI fournis par `@expo/ui`.

## 1 Principes fondamentaux

1. **Unicité de l’expérience** : l’application doit se comporter comme une application native.  Les utilisateurs attendent une navigation fluide, des animations réactives et une intégration profonde (Push notifications, caméra, géolocalisation).  `@expo/ui` fournit des composants d’entrée entièrement natifs qui permettent de construire des interfaces Jetpack Compose et SwiftUI depuis React Native【169426030116894†L100-L105】.
2. **Support multi‑plateforme** : respecter les conventions iOS et Android.  Utiliser des composants spécifiques (Navigation Bar iOS, AppBar Android) via Expo Router.  Adapter les icônes et interactions selon la plateforme (switch : à glissière sur iOS vs case à cocher sur Android, menus contextuels, etc.).
3. **Performance** : privilégier les animations natives (via `react-native-reanimated`) et éviter de bloquer le fil principal.  Utiliser de préférence `FlashList` (de Shopify) pour les listes d’annonces longues, avec chargement progressif des images ; utiliser `FlatList` seulement en fallback lorsque `FlashList` n’est pas disponible.  Précharger les données lorsque c’est pertinent.
4. **Accessibilité** : respectez les guidelines iOS/Android pour l’accessibilité : taille minimale des cibles tactiles (48 dp), contrastes suffisants, balises d’accessibilité.  Expo offre des API pour la narration et l’agrandissement du texte.

## 2 Architecture de navigation

### 2.1 Expo Router et navigation

- **Navigation principale** : utiliser un **tab navigator** en bas de l’écran avec quatre onglets : « Accueil », « Rechercher », « Publier » et « Messages ».  Chaque onglet correspond à une pile de navigation distincte gérée par Expo Router.
- **Navigation dans un onglet** : la pile « Accueil » affiche les catégories et les annonces populaires.  La pile « Rechercher » comprend un écran de recherche global avec des filtres avancés.  La pile « Messages » montre les conversations et les détails du chat.  La pile « Publier » lance un flux multi‑étapes pour créer une annonce.
- **Navigation dynamique** : Expo Router permet de définir des routes dynamiques (`(listing)/[id].tsx`) et de gérer les paramètres.  Les segments `(listing)` ou `(profile)` permettent d’organiser les écrans sans refléter directement l’URL.

### 2.2 Transitions et animations

- Utiliser les transitions natives proposées par Expo Router (glissées, fondues) pour passer d’un écran à un autre.  Les modales (ex. sélection de catégorie, filtre avancé) doivent apparaître depuis le bas de l’écran et être fermables par glissement.
- Éviter les animations coûteuses ; préférer `react-native-reanimated` et `expo-moti` pour des animations fluides.  Les micro‑animations (bouton qui grossit légèrement au toucher, liste qui rebondit) améliorent la perception.

## 3 Écrans principaux

### 3.1 Accueil

- **Bannière de recherche** : un champ de recherche en haut, visible dès l’arrivée, avec un placeholder instructif et une icône de recherche.  En cliquant, l’utilisateur est redirigé vers l’écran « Rechercher ».
- **Catégories** : afficher des boutons ou vignettes illustrées représentant les grandes catégories (Immobilier, Véhicules…).  Utiliser un `ScrollView` horizontal pour naviguer rapidement.
- **Annonces en vedette** : carrousel d’annonces boostées.  Les cartes doivent être grandes avec une image principale, le prix et la localisation.

### 3.2 Recherche

- **Champ de recherche** : barre en haut avec saisie directe.  L’API Meilisearch permet la recherche à la frappe (affichage des suggestions dès la saisie).  Afficher immédiatement les résultats sous la barre.
- **Filtres** : placer un bouton « Filtres » accessible.  Ouvrir un **Bottom Sheet** permettant de définir les critères (prix, distance, catégorie, état).  Sur iOS, utiliser une feuille de présentation (`modalPresentationStyle=pageSheet`), sur Android un `BottomSheet`.
- **Liste des résultats** : afficher les annonces sous forme de liste verticale (adaptée au mobile).  Utiliser `FlashList` et configurer le nombre de colonnes en fonction de la taille de l’écran : `numColumns=1` sur téléphone et `numColumns=2` sur tablette ou grand écran.

### 3.3 Détail d’une annonce

- **Galerie** : carrousel horizontal plein écran pouvant être zoomé.  Utiliser `expo-image` avec un indicateur de page.
- **Informations** : présenter le titre, le prix, la localisation et les attributs dans des sections distinctes.  Les attributs spécifiques à la catégorie doivent être regroupés et présentés sous forme de liste.
- **Actions** : un bouton principal « Contacter » qui ouvre la conversation dans le chat.  Un bouton « Sauvegarder » (icône de cœur) et un menu pour signaler l’annonce.
- **Annonces similaires** : liste horizontale en bas.  Permet à l’utilisateur de découvrir d’autres annonces pertinentes.

### 3.4 Publication d’une annonce

- **Étapes** : 1 Catégorie ; 2 Informations de base ; 3 Détails ; 4 Photos ; 5 Résumé & publication.  Indiquer l’étape en cours via un composant de progression.
- **Upload de photos** : utiliser `expo-image-picker` pour accéder à la galerie ou à la caméra.  Afficher les vignettes sélectionnées avec la possibilité de réordonner (drag & drop) et de supprimer.
- **Validation** : vérifier les champs obligatoires et afficher un message d’erreur en temps réel.  Prévoir une sauvegarde en brouillon en cas d’interruption.

### 3.5 Chat

- **Liste des conversations** : afficher les conversations avec la photo du vendeur, le titre de l’annonce et un aperçu du dernier message.  Utiliser des badges pour les messages non lus.
- **Écran de conversation** : présenter les messages dans des bulles.  Offrir la possibilité d’envoyer du texte, des photos (via `expo-image-picker`) et, éventuellement, un emplacement.  Afficher les indicateurs de lecture (messages vus/non vus).
- **Notifications** : activer les notifications push via `expo-notifications`.  Demander la permission dès la première utilisation et expliquer la valeur ajoutée (être averti des nouveaux messages).

### 3.6 Tableau de bord du vendeur

Le vendeur doit disposer d’un écran dédié pour gérer ses annonces et suivre ses performances :

- **Vue d’ensemble** : afficher les annonces actives, en cours, expirées ou vendues, avec des indicateurs visuels (étiquettes de couleur).  
- **Statistiques** : mettre en avant le nombre de vues, de favoris, de contacts et de transactions pour chaque annonce.  
- **Actions rapides** : proposer des boutons pour éditer, dupliquer, mettre en pause ou supprimer l’annonce.  Afficher un bouton « Booster » pour acheter de la visibilité.  
- **Avis et réputation** : l’écran montre la note moyenne du vendeur ainsi que les commentaires reçus.  
- **Paiement et revenus** : si l’application gère le paiement, inclure une section récapitulative (revenus cumulés, virements).  
- **Navigation** : l’accès à ce tableau de bord peut se faire via un onglet « Compte » ou via un menu latéral.

### 3.7 Favoris et alertes

L’application doit permettre aux utilisateurs de sauvegarder des annonces et de définir des alertes :

- **Liste des favoris** : accessible depuis l’onglet « Compte » ou via une icône dans le header.  Elle présente toutes les annonces sauvegardées.  L’utilisateur peut retirer un favori d’un simple tap.  
- **Alertes de recherche** : possibilité de créer une alerte en sauvegardant une recherche (mots‑clés, filtres, localisation).  Les nouvelles annonces correspondantes déclenchent des notifications push ou des e‑mails.  Les fonctionnalités de **saved searches** améliorent l’expérience et les recommandations personnelles【906002409455280†L150-L167】.  
- **Recommendations personnalisées** : sur cette page, afficher également des suggestions basées sur l’historique de favoris et les alertes.

### 3.8 Notes, avis et réputation

Pour renforcer la confiance, l’UI mobile intègre un système de notation :

- **Notation des annonces et des vendeurs** : chaque carte et page de détail affiche des étoiles et le nombre d’avis.  Les utilisateurs peuvent laisser un avis après une transaction.  
- **Profil vendeur** : afficher la photo ou l’avatar, le statut vérifié, les avis et la note globale.  Fournir un bouton « Signaler »【487079287601171†L587-L602】.  
- **Avis dans le chat** : après un échange réussi, proposer de noter l’expérience dans la conversation.  
- **Affichage dans la liste** : mettre en évidence les vendeurs les mieux notés par un badge.

### 3.9 Paiement et boost de visibilité

- **CTA « Booster »** : depuis la page d’annonce et le tableau de bord, l’utilisateur peut déclencher un boost.  Afficher un écran ou un bottom sheet présentant les options (durée, coût) et expliquant les avantages.  
- **Intégration Notch Pay** : rediriger vers le formulaire de paiement Notch Pay via WebView ou débrayage natif.  Les bonnes pratiques de checkout recommandent des étapes claires, des options multiples et des indicateurs de progression【906002409455280†L211-L234】.  
- **Confirmation** : afficher la réussite du paiement et indiquer la durée restante du boost.  Envoyer une notification à l’expiration pour inciter au renouvellement.

### 3.10 Authentification et onboarding

- **Accès sans inscription** : laisser les utilisateurs parcourir et rechercher des annonces sans créer de compte.  Ne demander l’inscription que lorsqu’ils souhaitent contacter un vendeur, publier une annonce ou créer une alerte.  Les recherches suggèrent qu’éviter les logins précoces améliore la conversion【906002409455280†L116-L127】.  
- **Flux d’inscription simplifié** : pour les acheteurs, demander l’e‑mail et le mot de passe, puis valider par e‑mail.  Pour les vendeurs, un processus en plusieurs étapes guidé (coordonnées, photo, validation d’identité) avec barre de progression【906002409455280†L131-L136】.  
- **Options de connexion** : intégrer des fournisseurs OAuth (Google, Facebook, Apple) et l’authentification à deux facteurs via Better Auth.  
- **Explication des permissions** : demander l’accès à la caméra, à la localisation et aux notifications au moment où la fonctionnalité est nécessaire, en expliquant la valeur ajoutée (ex. « Accédez à la caméra pour ajouter des photos de votre article »).

### 3.11 Modération et sécurité

- **Signalement** : inclure un bouton « Signaler » sur les pages d’annonce, de profil et dans chaque conversation.  L’utilisateur sélectionne un motif et envoie le rapport.  
- **Guidelines visibles** : afficher les règles communautaires lors de la création d’une annonce et insérer des messages d’avertissement dans le chat en cas de comportement à risque【261606220854261†L330-L359】.  
- **Modération automatique** : le backend vérifie les images, filtre les mots interdits et détecte les spams.  Les cas douteux sont transmis à un modérateur humain【261606220854261†L362-L470】.  
- **Historique des signalements** : dans le tableau de bord, permettre à l’utilisateur de voir l’état de ses signalements et les mesures prises.

### 3.12 Notifications et messages

- **Push notifications** : utiliser `expo-notifications` pour informer des nouveaux messages, des réponses à une annonce, des alertes de recherche et des confirmations de paiement.  Demander l’autorisation de manière contextuelle.  
- **Centre de notifications** : un écran regroupant toutes les notifications récentes (messages, boosts expirés, avis reçus).  
- **Badges** : afficher un badge sur l’icône de l’onglet correspondant (Messages, Compte) pour indiquer le nombre d’éléments non consultés.  
- **Toast** : lors d’actions rapides (ajout d’un favori, publication d’annonce), afficher des toasts pour confirmer la réussite ou indiquer un échec.

## 4 Design et composants

- **Bibliothèque Expo UI** : utiliser les composants natifs Jetpack Compose et SwiftUI lorsque cela est pertinent.  La documentation souligne que la bibliothèque est en alpha et nécessite un build de développement, et que les composants doivent être enveloppés dans un `Host`【582543692272773†L105-L127】.  Utiliser ces composants pour des éléments critiques (boutons, champs texte) afin de bénéficier de la fluidité native.
- **Composants personnalisés** : pour les cartes d’annonces, créer un composant réutilisable dans le package `ui` partagé (tailwind, Radix).  Adapter le design à l’écran (ex. grille 2 colonnes sur tablette, 1 colonne sur téléphone).
- **Thème** : définir un système de thèmes (clair/sombre) partagé avec la version web.  Implémenter un context `ThemeContext` pour gérer le changement de thème et respecter les préférences système.
- **Icônes** : utiliser `lucide-react-native` pour garantir une cohérence avec la version web.  Adapter les tailles et marges pour respecter les guidelines natives.

## 5 Performances et bonnes pratiques

- **Optimisation des listes** : utiliser `FlashList` (de Shopify) lorsque les listes d’annonces sont longues.  `FlashList` offre de meilleures performances que `FlatList` pour de grandes quantités de données.
- **Préchargement** : charger les données critiques (ex. messages non lus, annonces boostées) dès la connexion.  Prévenir l’utilisateur via un indicateur de chargement.
- **Gestion de la mémoire** : libérer les images ou composants non utilisés en naviguant ; utiliser `useFocusEffect` pour déclencher l’actualisation des données uniquement lorsque l’écran est actif.
- **Deep Links** : configurer Expo Router pour gérer les liens profonds afin que l’ouverture d’une URL depuis un e‑mail ou une notification ouvre directement l’annonce ou la conversation.

## 6 Accessibilité et internationalisation

- Utiliser des zones d’appui suffisamment grandes (48 × 48 dp) et espacées.
- Fournir des labels accessibles via `accessibilityLabel` et `accessibilityHint` pour les boutons et champs personnalisés.
- Prendre en charge le changement de taille de police (Dynamic Type sur iOS, Font Scaling sur Android).
- Préparer les chaînes de texte pour la traduction (support multilingue, y compris les langues à écriture de droite à gauche).

## 7 Sécurité et confiance

- Protéger les écrans sensibles (profil, paiement) par des transitions sécurisées.  Verrouiller l’accès au chat si l’utilisateur n’est pas authentifié.
- Demander les autorisations (géolocalisation, caméra) de manière contextuelle.  Expliquer l’usage pour rassurer l’utilisateur.
- Afficher clairement les badges de vérification et la réputation des vendeurs pour renforcer la confiance.

## Conclusion

Ce guide fournit les recommandations UI/UX pour la version mobile de la marketplace.  En utilisant Expo Router, Expo UI et des composants natifs Jetpack Compose/SwiftUI, l’application mobile offrira une expérience fluide et conforme aux attentes des utilisateurs iOS et Android.  L’adoption d’une navigation claire, d’interactions cohérentes et d’un design adapté aux contraintes mobiles contribuera à la réussite de l’application.
