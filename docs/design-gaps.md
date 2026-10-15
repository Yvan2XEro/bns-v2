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

Comparaison pas encore faite.

## Écrans pas encore comparés

- Achat : paiement en attente (demande de paiement réelle requise), étapes
  paiement et récapitulatif du tunnel.
- Vendeur : fiche produit en revente (la revente est désactivée et aucune boutique de niveau 3 n'existe dans les données de démo).
- Ops : zones et échecs de livraison, produits revendus (fonctions désactivées
  dans les données de démo), revue de vérification côté modération.
