# Écarts maquettes ↔ apps

Registre des différences relevées en comparant les apps aux maquettes
(`statics/bns-design/` sur le stockage S3) et laissées de côté volontairement :
fonctionnalités à construire, choix produit ou sécurité à trancher, données à
corriger. Les simples écarts visuels sont corrigés directement, ils n'ont pas
leur place ici.

Quand un point est traité, le supprimer de cette liste dans le même commit.

Légende : **Fonction** = code à écrire · **Décision** = arbitrage produit/sécurité
· **Données** = à corriger dans l'admin.

## Mobile

### Navigation

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| M2 | Mode vendeur | Barre d'onglets dédiée au vendeur | Hub vendeur dans le compte, pas de mode séparé | Fonction |

### Accueil et recherche

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|

### Annonces et boutiques

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|

### Achat

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| M9 | Tunnel, étape adresse | Adresses enregistrées + carte | Grille de puces de quartiers | Fonction |
| M15 | Suivi de livraison | Carte en direct, position du livreur, fiche coursier, « Appeler le livreur » | Bloc de suivi de l'envoi sans carte | Fonction |

### Vendeur

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| M22 | Vérification entreprise | Prise de vue du document dans l'app (cadre, détection des bords, plusieurs pages) | Choix d'une photo dans la galerie | Fonction |

## Web

Ce qui reste après le passage d'octobre 2026 sur toutes les lignes web : la
plupart des écrans suivent désormais la maquette ; les lignes ci-dessous sont
les restes précis.

### Accueil et recherche

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|

### Annonces et boutiques

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|

### Achat

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W1 | Commande | Une seule page : adresse, livraison et paiement en sections, adresses enregistrées, carte | Page unique en sections avec récapitulatif ; l'API ne garde pas d'adresses : la dernière adresse de commande est reprise ; position GPS sans aperçu de carte ; la carte « paiement protégé — bientôt disponible » n'apparaît pas tant que le serveur ne l'active pas | Données |
| W20 | Mes achats | Heure d'arrivée du livreur en direct (« Arrivée vers 15:40 ») | Logo, badge et mode de paiement affichés ; pas d'heure d'arrivée en direct (lot suivi de livraison) | Fonction |

### Vendeur

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|

## Décisions prises (octobre 2026)

L'app garde son comportement sur ces points ; ne pas les rouvrir sans
élément nouveau.

| # | Décision | Raison |
|---|----------|--------|
| M1 | L'onglet reste « Favoris » | L'accueil et la recherche servent déjà à explorer ; les favoris sont un raccourci qu'on rouvre souvent |
| M3 | La carte de localisation reste sous les catégories | Demandée explicitement ; la ville dans la barre se décidera avec une refonte complète de l'accueil |
| M8 | Les badges restent sur les boutiques | Depuis P2 c'est la boutique qui est vérifiée ; un badge sur la personne affirmerait une vérification qui n'a pas eu lieu |
| M18 | L'éditeur produit complet reste | Il enregistre automatiquement et valide chaque étape ; une vue d'ensemble ajouterait un écran |
| W35 | Seuils affichés : 10 % de commandes annulées ou refusées par la boutique, 20 % de colis refusés à la livraison | Ce sont les seuils que l'API applique ; l'écran dit la règle réelle |
| W37 | Les règles de revente restent par produit ; un niveau minimum du revendeur (2 ou 3) est réglable par produit | Plus souple qu'une règle unique par boutique ; délai par variante et zone d'expédition hors périmètre |
| M10 | Le code de remise n'est pas affiché à la demande | L'API n'en garde qu'une empreinte, impossible à relire ; « Renvoyer le code par SMS » (3 fois par commande) affiche le nouveau code au toucher |
| M21 | Les illustrations animées restent ; un bandeau « Hors ligne » s'affiche et l'app garde les données déjà chargées | Les illustrations ont été demandées ; le bandeau sert avec un réseau instable |
| W17 | La livraison se choisit dans le tunnel ; le panier montre une estimation « à partir de » | Le devis exige une adresse complète que le panier n'a pas |
| W24 | Mode de paiement et zone visibles par tous les membres qui voient les commandes | Ce ne sont pas des montants ; les montants restent réservés à la permission paiements |
| W29 | Pas de stock par emplacement ; l'emplacement reste une note de la session d'inventaire | Refonte du modèle de stock, utile seulement avec plusieurs entrepôts, ce qui n'est pas le cas des boutiques au lancement |
| W33 | Pas de bouton « Relevé du prestataire » | Les vendeurs n'ont pas de compte NotchPay : l'argent passe par la plateforme, et le relevé de la plateforme (avec export CSV) fait foi |
| W35 | Pas d'action « Vendre en lot » | Les lots sont une fonction produit à part entière (prix groupé, stock combiné, commande), à reprendre si les vendeurs la demandent |
| W25 | Le stock du fournisseur reste plafonné pour le revendeur (chiffre exact jusqu'à 10, sinon « En stock ») | Le stock exact d'un fournisseur est une information commerciale ; le code-barres, lui, est livré |
| W37 | Pas d'aperçu A6 du bon de livraison dans la page du bon de commande | L'étiquette imprimable existe déjà dans un onglet dédié |

## Écrans pas encore comparés

- Achat : paiement en attente (demande de paiement réelle requise), étapes
  paiement et récapitulatif du tunnel.
- Vendeur : fiche produit en revente (la revente est désactivée et aucune boutique de niveau 3 n'existe dans les données de démo).
- Ops : zones et échecs de livraison, produits revendus (fonctions désactivées
  dans les données de démo), revue de vérification côté modération.
- Web : écrans réservés à l'équipe BuyNSellem.

## Points ouverts relevés en route

- Avis avec photos : les fichiers envoyés ne gardent pas leur auteur, donc
  l'API vérifie qu'une photo jointe existe et est une image, mais pas qu'elle
  a été envoyée par l'auteur de l'avis. Les fichiers restent lisibles par
  quiconque a leur adresse, même ceux d'un avis masqué.
- L'avis laissé sur une personne (hors commande) n'a pas de sélecteur de
  photos sur le web, alors que l'API les accepte.
- Noms de catégories localisés : les résultats de recherche (Meilisearch,
  indexés sans langue) et les catégories d'une boutique (`lib/publicShop.ts`)
  restent en français, comme les noms d'attributs dans les messages de
  validation. Les cartes d'annonces, elles, suivent la langue du lecteur.
