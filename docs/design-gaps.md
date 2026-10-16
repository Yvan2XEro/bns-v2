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
| M4 | Catégories / attributs | Libellés en français | Certains libellés en anglais, venant de la base | Données |

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
| W19 | Commande | Fiche vendeur avec adresse de la boutique et « boutique depuis 2024 » | Fiche vendeur avec logo, badge, note et téléphone ; ni adresse de rue ni ancienneté de la boutique (non renvoyées par le panier ni le devis) | Données |
| W20 | Mes achats | Heure d'arrivée du livreur en direct (« Arrivée vers 15:40 »), logo et badge de la boutique, mode de paiement (« à la livraison » / « payé ») sur chaque carte | Actions et date prévue / délai estimé / date limite de retour sur chaque carte ; pas d'heure en direct du livreur, ni logo, ni badge, ni statut de paiement sur la carte | Données |

### Vendeur

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W25 | Catalogue | Recherche par code-barres ; stock de revente « 320 chez le fournisseur » | Recherche nom, SKU ou fournisseur (pas de champ code-barres sur les variantes) ; la revente affiche « chez le fournisseur » / « Indisponible » sans quantité (stock du fournisseur non exposé au revendeur) | Données |
| W29 | Inventaire | Filtre « Emplacement » qui restreint la liste ; recherche code-barres | Le stock n'est pas réparti par emplacement : le choix est enregistré sur la session sans filtrer les lignes ; pas de champ code-barres ; l'impression ne sort que la page affichée | Données |
| W33 | Paiements | Bouton « Relevé du prestataire » ouvrant le relevé de NotchPay | Bouton présent mais désactivé (infobulle « pas encore disponible ») : aucune route API ne fournit de relevé ou de lien vers le tableau de bord du prestataire | Fonction |
| W35 | Statistiques vendeur | Action « Vendre en lot » sur le stock dormant | Dernière vente et « Mettre en avant » affichés ; pas de lots dans le modèle, donc pas de bouton | Fonction |
| W35 | Statistiques vendeur | Comparaison de prix avec les annonces similaires dans l'encart de conversion ; détail du délai de réponse par jour | Encart limité à vues/commandes du produit ; délai de réponse = tranche médiane uniquement | Fonction |
| W36 | Revente (revendeur) | Filtres catégorie et « Expédié depuis Douala » ; vignettes produit dans le tableau revendu ; « min. … depuis le 14/09 » | Recherche et filtre « Paiement à la livraison » seulement ; icône à la place de la vignette (les images ne sont pas chargées dans ces réponses) ; pas de date de changement du minimum (non conservée) | Données |
| W36 | Revente (revendeur) | Fournisseurs : « Expédition médiane », « Réponse habituelle sous 2 jours » | Non calculé (l'annulation de la demande est faite) | Fonction |
| W37 | Revente (fournisseur) | Vignette produit dans la colonne Articles ; « 3 bons à expédier aujourd'hui » | Icône générique ; le compteur porte sur tous les bons à expédier, pas seulement ceux du jour | Données |
| W37 | Bon de commande (OpsWebPurchaseOrder) | Carte Revendeur (commande client BNS-…, contact, « Écrire au revendeur »), « Joignable de 8:00 à 18:00 », aperçu A6 du bon de livraison dans la page | Pas de numéro de commande client ni de contact du revendeur dans la vue du bon ; l'étiquette s'ouvre dans un nouvel onglet (page imprimable existante) | Données |

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
