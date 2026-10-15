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
| M13 | Commande passée | Ligne « Reçu de commande » ouvrant le reçu | Reçu accessible depuis le détail de la commande | Fonction |

### Vendeur

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| M11 | Liste des commandes | Boutons Accepter / Refuser sur chaque carte | Actions seulement dans le détail de la commande | Fonction |

## Web

Comparaison pas encore faite.

## Écrans pas encore comparés

- Achat : litige (ouverture, échanges), suivi de
  livraison, rétractation, paiement en attente, paiement protégé, étapes
  paiement et récapitulatif du tunnel.
- Vendeur : fiche produit, ajustement de stock, revente, vérification.
- P1 : création de produit, réglages boutique, recherche de boutiques,
  passage par le téléphone, états vides/erreur, premier lancement boutique,
  déplacement d'annonces, fiche modération boutique, fiche produit acheteur,
  anglais + mode sombre.
- Ops / vérification : parcours de vérification (début, document, selfie,
  statut), versements, équipe et invitation, boîte de réception boutique,
  commission, livraison, réponse à un litige, revue de vérification, refus de
  commande, produits revendus.
