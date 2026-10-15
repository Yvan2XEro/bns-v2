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
| M1 | Barre d'onglets | Onglet « Explorer » | Onglet « Favoris » | Décision |
| M2 | Mode vendeur | Barre d'onglets dédiée au vendeur | Hub vendeur dans le compte, pas de mode séparé | Fonction |

### Accueil et recherche

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| M3 | Accueil | Ville affichée dans la barre de recherche | Carte de localisation sous les catégories (demandée explicitement) | Décision |
| M4 | Catégories / attributs | Libellés en français | Certains libellés en anglais, venant de la base | Données |

### Annonces et boutiques

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| M5 | Fiche annonce | Bouton « Appeler » | Absent : la révélation du téléphone passe par le flux protégé | Décision |
| M6 | Page boutique | Bouton « Contacter la boutique » | Absent : l'API n'ouvre une conversation qu'à partir d'une annonce | Fonction |
| M7 | Page boutique | Onglets Annonces / Avis / À propos | Une seule page déroulante | Fonction |
| M8 | Profil / boutique | Badge « Identité vérifiée » sur l'utilisateur | Les badges appartiennent aux boutiques depuis P2 | Décision |

### Achat

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| M9 | Tunnel, étape adresse | Adresses enregistrées + carte | Grille de puces de quartiers | Fonction |
| M10 | Suivi de commande | Code de remise affiché en clair | Code envoyé uniquement par SMS | Décision (sécurité) |
| M12 | Avis | Photos jointes à l'avis (5 max.) | Note et commentaire seulement | Fonction |
| M14 | Signaler un problème | Une seule page, preuves (photos, vidéo) jointes dès l'envoi | Parcours en 5 étapes ; les justificatifs s'ajoutent ensuite dans le dossier | Décision |
| M15 | Suivi de livraison | Carte en direct, position du livreur, fiche coursier, « Appeler le livreur » | Bloc de suivi de l'envoi sans carte | Fonction |
| M16 | Détail de commande | Barre fixe « Un problème ? » + « Écrire à la boutique » | Actions empilées en haut de l'écran | Décision |
| M17 | Litige | Pièces jointes affichées en vignettes dans les messages, menu « … » | Justificatifs comptés, sans aperçu | Fonction |
| M13 | Commande passée | Ligne « Reçu de commande » ouvrant le reçu | Reçu accessible depuis le détail de la commande | Fonction |

### Vendeur

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| M11 | Liste des commandes | Boutons Accepter / Refuser sur chaque carte | Actions seulement dans le détail de la commande | Fonction |
| M19 | Vérification | Liste des documents demandés sous le niveau suivant, bouton fixe « Vérifier mon entreprise » | Documents listés dans le parcours de vérification | Décision |
| M20 | Paramètres de la boutique | Lignes « libellé · valeur › » qui ouvrent chaque champ, logo posé sur la bannière | Formulaires dépliés en cartes | Décision |
| M21 | États vides / erreur | Pastille d'icône dans un rond, bouton secondaire en lien, bandeau « Hors ligne » avec données en cache | Illustrations, pas de mode hors ligne | Décision |
| M22 | Vérification entreprise | Prise de vue du document dans l'app (cadre, détection des bords, plusieurs pages) | Choix d'une photo dans la galerie | Fonction |
| M23 | Commandes (refus) | Récapitulatif de la commande et conséquences du refus dans la feuille | Motifs et note seulement | Décision |
| M18 | Fiche produit | Vue d'ensemble (variantes avec stock et marge, menu « … », bouton Aperçu) | Éditeur complet du produit sur un seul écran | Décision |

## Web

Ce qui reste après le passage d'octobre 2026 sur toutes les lignes web : la
plupart des écrans suivent désormais la maquette ; les lignes ci-dessous sont
les restes précis.

### Accueil et recherche

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W8 | Accueil | Badge « À LA UNE » sur l'annonce boostée | La carte affiche « Boosté » (clé `Listing.listingBoosted`, composant ListingCard hors de ce périmètre) | Fonction |
| W10 | Accueil | Nouveautés de la ville dès l'affichage | Le serveur rend toutes les villes, puis le navigateur bascule sur la ville mémorisée (squelette bref) ; avec Meilisearch, `location` est une égalité exacte, donc une annonce dont le lieu n'est pas exactement le nom de la ville n'apparaît pas | Fonction |
| W15 | Recherche | Compteurs des deux onglets avec les mêmes filtres | L'onglet inactif ne compte que sur le mot recherché (ville et filtres non repris, comme le lien de l'onglet) ; total Meilisearch estimé | Fonction |

### Annonces et boutiques

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W4 | Page boutique | Onglet « Avis » avec le nombre d'avis | Le nombre affiché sur l'onglet est le compteur `totalReviews` de la boutique (avis publiés), alors que la liste ne montre que les avis encore « achat vérifié » : un avis dont la vérification a été retirée après un litige est compté mais pas listé | Données |
| W5 | Fiche annonce | Puces de couleur pour toute couleur | Un nom de couleur inconnu du dictionnaire (ex. « Sierra ») reste une puce texte sans pastille | Fonction |
| W12 | Fiche annonce (mobile) | Badge « Garantie boutique 3 mois » | Le champ garantie n'est saisissable que dans l'éditeur web, pas dans l'éditeur produit mobile | Fonction |
| W13 | Fiche annonce | « Livraison à Douala · 2 000 XAF — Sous 24 h » | Le sous-titre affiche le délai de préparation de l'article (« Préparée sous 24 h »), aucun délai de livraison n'existe hors zones de livraison | Fonction |
| W38 | Boutique web | Bouton « Contacter » qui ouvre aussi la messagerie avec la boutique | Le menu « Contacter » propose WhatsApp et Appeler (selon ce que la boutique a renseigné) ; « Écrire à la boutique » absent : l'API n'ouvre une conversation qu'à partir d'une annonce (même manque que M6) | Fonction |

### Achat

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W1 | Commande | Une seule page : adresse, livraison et paiement en sections, adresses enregistrées, carte | Page unique en sections avec récapitulatif ; l'API ne garde pas d'adresses : la dernière adresse de commande est reprise ; position GPS sans aperçu de carte ; la carte « paiement protégé — bientôt disponible » n'apparaît pas tant que le serveur ne l'active pas | Données |
| W17 | Panier | Choix du mode de livraison et total livraison comprise dans le panier | Le panier affiche « Livraison — Calculée à l'étape suivante » : le devis exige une adresse complète que le panier n'a pas | Décision |
| W19 | Commande | Fiche vendeur avec adresse de la boutique et « boutique depuis 2024 » | Fiche vendeur avec logo, badge, note et téléphone ; ni adresse de rue ni ancienneté de la boutique (non renvoyées par le panier ni le devis) | Données |
| W20 | Mes achats | Heure d'arrivée du livreur en direct (« Arrivée vers 15:40 »), logo et badge de la boutique, mode de paiement (« à la livraison » / « payé ») sur chaque carte | Actions et date prévue / délai estimé / date limite de retour sur chaque carte ; pas d'heure en direct du livreur, ni logo, ni badge, ni statut de paiement sur la carte | Données |

### Vendeur

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W2 | Commandes vendeur | Bouton « Refuser » dans la barre de sélection multiple | Refus groupé non proposé : chaque refus exige un motif (dialogue par commande) ; seule l'acceptation groupée existe, et les commandes « placed » (non confirmées) n'ont ni case ni bouton | Fonction |
| W6 | Paramètres boutique | Onglets Profil, Adresse, Contacts, Politique de retour, Fermeture | Onglets Profil, Adresse, Contacts, Informations légales, Annonces, Fermeture (pas d'onglet Politique de retour) | Décision |
| W22 | Barre latérale vendeur | Le sélecteur de boutique change toute la boutique active | Le sélecteur (désormais dans l'en-tête sombre) ne change que la boutique de la messagerie, comme avant | Fonction |
| W24 | Commandes vendeur | Sous-titre « N à traiter · paiement à la livraison · livraison dans Douala » pour tous | Les mentions paiement / zone ne s'affichent qu'avec la permission payments.view (le staff voit seulement « N à traiter ») | Décision |
| W24 | Commandes vendeur | Colonne Articles « titre ×2 » pour une ligne de 2 unités | Plusieurs unités affichées « titre · N articles » (la liste ne distingue pas lignes et unités) | Fonction |
| W25 | Catalogue | Recherche par code-barres ; stock de revente « 320 chez le fournisseur » | Recherche nom, SKU ou fournisseur (pas de champ code-barres sur les variantes) ; la revente affiche « chez le fournisseur » / « Indisponible » sans quantité (stock du fournisseur non exposé au revendeur) | Données |
| W29 | Inventaire | Filtre « Emplacement » qui restreint la liste ; recherche code-barres | Le stock n'est pas réparti par emplacement : le choix est enregistré sur la session sans filtrer les lignes ; pas de champ code-barres ; l'impression ne sort que la page affichée | Données |
| W33 | Paiements | Bouton « Relevé du prestataire » ouvrant le relevé de NotchPay | Bouton présent mais désactivé (infobulle « pas encore disponible ») : aucune route API ne fournit de relevé ou de lien vers le tableau de bord du prestataire | Fonction |
| W33 | Paiements | Taux affichés dans les en-têtes (« Commission 8 % », « TVA 19,25 % ») et identité vérifiée affichée à côté du titulaire | Colonnes « Commission (HT) » et « TVA » sans taux ; seul le verdict de correspondance des noms est affiché, pas le nom de l'identité vérifiée | Fonction |
| W35 | Statistiques vendeur | « dernière vente il y a N jours » par produit dormant, actions « Mettre en avant » / « Vendre en lot » | Stock dormant = aucune vente livrée sur 30 jours (date de dernière vente non calculée) ; actions « Modifier le prix » et « Voir le stock » seulement | Fonction |
| W35 | Statistiques vendeur | Comparaison de prix avec les annonces similaires dans l'encart de conversion ; détail du délai de réponse par jour | Encart limité à vues/commandes du produit ; délai de réponse = tranche médiane uniquement | Fonction |
| W35 | Statistiques vendeur | Seuils 5 % (annulations) et 15 % (refus) | Seuils réels de l'API : 10 % et 20 % (constantes partagées avec les actions) | Décision |
| W36 | Revente (revendeur) | Filtres catégorie et « Expédié depuis Douala » ; vignettes produit dans le tableau revendu ; « min. … depuis le 14/09 » | Recherche et filtre « Paiement à la livraison » seulement ; icône à la place de la vignette (les images ne sont pas chargées dans ces réponses) ; pas de date de changement du minimum (non conservée) | Données |
| W36 | Revente (revendeur) | Fournisseurs : « Expédition médiane », « Réponse habituelle sous 2 jours », bouton « Annuler la demande » | Non calculé ; le revendeur ne peut pas annuler sa demande (l'API de décision est réservée au fournisseur) | Fonction |
| W37 | Revente (fournisseur) | Règles de revente au niveau de la boutique, modifiables d'un bloc | Règles stockées par produit : la carte les résume, « Modifier » mène aux produits proposés | Données |
| W37 | Revente (fournisseur) | Vignette produit dans la colonne Articles ; « 3 bons à expédier aujourd'hui » | Icône générique ; le compteur porte sur tous les bons à expédier, pas seulement ceux du jour | Données |
| W37 | Revente · produit (OpsWebResaleEnable) | Préparation et « À la livraison » par variante ; « Niveau minimum du revendeur » ; « Zone d'expédition » | Délai et paiement à la livraison réglés pour le produit entier ; niveau minimum et zone absents du modèle | Données |
| W37 | Bon de commande (OpsWebPurchaseOrder) | Carte Revendeur (commande client BNS-…, contact, « Écrire au revendeur »), « Joignable de 8:00 à 18:00 », aperçu A6 du bon de livraison dans la page | Pas de numéro de commande client ni de contact du revendeur dans la vue du bon ; l'étiquette s'ouvre dans un nouvel onglet (page imprimable existante) | Données |

## Écrans pas encore comparés

- Achat : paiement en attente (demande de paiement réelle requise), étapes
  paiement et récapitulatif du tunnel.
- Vendeur : fiche produit en revente (la revente est désactivée et aucune boutique de niveau 3 n'existe dans les données de démo).
- Ops : zones et échecs de livraison, produits revendus (fonctions désactivées
  dans les données de démo), revue de vérification côté modération.
- Web : écrans réservés à l'équipe BuyNSellem.
