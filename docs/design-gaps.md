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

### Accueil et recherche

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W21 | Catégories | Une catégorie parente regroupe ses sous-catégories | La recherche filtre sur la catégorie exacte : une catégorie racine ne montre que les annonces classées directement dedans. Bloque l'affichage des seules catégories racines sur l'accueil et le regroupement des compteurs en boutique | Fonction |
| W7 | Accueil | Titre fixe « Achetez et vendez près de chez vous » | Titre animé (mots qui défilent) | Décision |
| W8 | Accueil | Hero, catégories, boutiques vérifiées, nouveautés, rien d'autre | Sections en plus : « À la une » (annonces boostées), « Comment ça marche », bandeau « Vous avez quelque chose à vendre ? » | Décision |
| W9 | Accueil | Cartes boutiques avec la bannière de la boutique et trois vignettes de produits | Bandeau générique : la recherche de boutiques ne renvoie ni bannière ni produits | Fonction |
| W10 | Accueil | Nouveautés filtrées sur la ville choisie, pastille « Douala » | Annonces de toutes les villes, pastille « Nouveau » (la ville est une préférence du navigateur, inconnue du serveur) | Fonction |
| W15 | Recherche | Compteurs sur les onglets Annonces / Boutiques | Onglets sans compteur (il faudrait une seconde requête) | Fonction |
| W16 | Recherche boutiques | Filtres en puces (ville, niveau, catégorie), tri « Pertinence », extrait de description avec le mot recherché surligné | Champ ville et case « vérifiées uniquement », ni catégorie, ni tri, ni surlignage | Fonction |
| W42 | Accueil web | Section « Parcourir par catégorie » (tuiles racines) | La section liste toutes les catégories actives à plat, sous-catégories comprises ; seul point d'entrée catégories sur mobile web depuis la suppression de la barre | Décision |

### Annonces et boutiques

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W5 | Fiche annonce | Puces de couleur sur les variantes, prix par stockage | Boutons texte | Décision |
| W4 | Page boutique | Onglets Annonces / Avis / À propos sous l'en-tête | Une seule page (annonces + colonne « À propos » et catégories de la boutique) ; aucun endpoint d'avis par boutique côté web | Fonction |
| W11 | Fiche annonce | « En stock · 3 disponibles » | Disponible / épuisé seulement : l'API publique n'expose qu'un booléen | Décision |
| W12 | Fiche annonce | Badge « Garantie boutique 3 mois » | Aucune donnée de garantie sur le produit | Fonction |
| W13 | Fiche annonce | Liste d'avantages : livraison (prix, délai), retrait (adresse), paiement à la livraison, rétractation 15 jours avec détail | Une ligne livraison et deux pastilles (paiement à la livraison, retour) | Fonction |
| W14 | Fiche annonce | Quantité et un seul bouton « Commander » | « Ajouter au panier » et « Acheter maintenant » | Décision |
| W38 | Boutique web | Bouton principal unique « Contacter » | Boutons WhatsApp et Appeler, affichés seulement si la boutique les a renseignés (pas de messagerie boutique depuis le hero) | Décision |
| W39 | Boutique web | Encadré « Livraison » : tarif par ville (Douala 2 000 XAF, Yaoundé 3 500 XAF, retrait gratuit) | Texte « Livraison ou retrait disponible à : … » sans tarif + bloc Points de retrait détaillé | Données |
| W40 | Boutique web | Tri « Plus récentes » à côté de la recherche dans la boutique | Pas de tri dans la boutique (toujours les plus récentes) | Fonction |
| W41 | Boutique web | Compteurs par catégorie (la maquette suggère des catégories racines : Téléphones, Ordinateurs…) | Compteurs par catégorie feuille de l'annonce, sans regroupement sous la catégorie parente (cohérent avec le filtre exact `categoryId`) | Décision |

### Achat

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W1 | Commande | Une seule page : adresse, livraison et paiement en sections, adresses enregistrées, carte | Parcours en 3 étapes ; récapitulatif du panier à côté des deux premières | Décision |
| W17 | Panier | Choix du mode de livraison et total livraison comprise dans le panier | Livraison choisie dans le tunnel ; le panier affiche le sous-total | Décision |
| W18 | Panier | En-tête boutique avec logo et badge de vérification, stock restant par ligne | Nom et ville de la boutique seulement (le panier ne renvoie ni badge ni logo ni stock) | Données |
| W19 | Commande | Récapitulatif avec fiche vendeur (note, adresse, téléphone), mention « la boutique est le vendeur », encadré rétractation, rappels de sécurité, case « conditions de vente » | Récapitulatif panier et contrat préalable, sans fiche vendeur ni rappels | Fonction |
| W20 | Mes achats | Chaque carte porte son action (Suivre, Suivre le livreur, Laisser un avis, Retourner l'article) et l'heure d'arrivée | Liste des commandes ; actions dans le détail | Fonction |

### Vendeur

| # | Écran | Maquette | App aujourd'hui | Type |
|---|-------|----------|-----------------|------|
| W2 | Commandes vendeur | Boutons Accepter / Expédier sur chaque ligne, sélection multiple, export | Actions dans le détail de la commande (comme M11) | Fonction |
| W3 | Tableau de bord vendeur | Messages sans réponse, statistiques 7 jours, incitation au niveau 3 | Commandes à accepter / à expédier, alertes de stock, commandes en attente | Fonction |
| W6 | Paramètres boutique | Aperçu en direct de la page publique (ordinateur / mobile), boutons Annuler / Enregistrer en haut | Formulaire seul, enregistrement en bas | Fonction |
| W22 | Barre latérale vendeur | Compteur « à traiter » sur Commandes, pastille « Niv. 2 » sur Vérification, sélecteur de boutique dans l'en-tête sombre | Pas de compteur sur Commandes ; badge de niveau sous le nom ; sélecteur dans une barre blanche au-dessus du contenu | Fonction |
| W23 | Tableau de bord vendeur | Sous-titre « date · N actions en attente » ; tableau « Commandes récentes » tous statuts avec colonnes Paiement et Statut | Nom de la boutique en sous-titre ; tableau limité aux commandes à accepter | Décision |
| W24 | Commandes vendeur | Filtres Quartier et période (7 derniers jours), colonnes Paiement et Statut, quartier sous le client, mention revente / bon de commande sur la ligne, sous-titre « N à traiter · paiement · zone » | Recherche et onglets seulement ; colonnes Date, Délai, Fiabilité ; les compteurs suivent la recherche | Fonction |
| W25 | Catalogue | Onglet et colonne « Provenance » (stock propre / revente + fournisseur), filtres Catégorie et Provenance, tri, cases à cocher et menu « … » par ligne, recherche par code-barres, SKU produit à côté du nombre de variantes | Onglets statut/stock (avec « Masqués » en plus), recherche nom/SKU ; l'API ne renvoie que le SKU de la première variante | Fonction |
| W26 | Catalogue | Import d'un fichier | Bouton désactivé « Bientôt » | Fonction |
| W27 | Stock | Sous-titre « Dernier inventaire le … · N alerte », onglet « Réservations », « sur N produits en stock propre », bouton « Enregistrer une réception » | Pas de date du dernier inventaire ; filtres Réceptions / Corrections / Pertes / Retours ; « sur N variantes suivies » ; bouton « Ajuster le stock » | Données |
| W28 | Stock | Panneau « Ajuster le stock » fixe à droite de l'historique | Tiroir ouvert à la demande | Décision |
| W29 | Inventaire | « Commencé à 08:30 par Aïcha M. », filtres Catégorie et Emplacement, recherche code-barres, vignettes produit, pagination et bouton « Enregistrer » en pied de tableau | Brouillon local à l'appareil, sans auteur ni emplacement ; tableau complet sans pagination | Fonction |
| W30 | Fiche produit | Bouton « Aperçu », sous-titre « Stock propre · mis à jour aujourd'hui à 09:12 » | Enregistrer seulement, pas de provenance ni d'heure de mise à jour | Fonction |
| W31 | Nouveau produit | « Brouillon enregistré automatiquement à 10:42 », bouton Annuler | Brouillon enregistré à la main | Fonction |
| W32 | Équipe | Colonnes « Dernière activité » (en ligne, « dans Paiements ») et Statut, invitations dans le même tableau, journal d'activité en colonne, « 3 sur 10 places » en tête de carte | Tableau des membres, jauge de places et liste d'invitations séparées ; journal sur sa propre page | Fonction |
| W33 | Paiements | Sous-titre, encadré « BuyNSellem ne détient jamais l'argent… », factures de commission sur la même page, carte « Compte de versement » avec comparaison des noms, schéma « Comment l'argent circule », boutons Relevé du prestataire / Exporter, colonnes Commission et TVA par versement | Montants, retenues, versements et détail par commande ; factures sous Facturation ; compte sous Configuration. Le namespace `Payments` est figé (parité mobile), d'où pas de sous-titre | Décision |
| W34 | Livraison | Une page : tableau des zones (quartiers, frais, gratuit dès, délai, méthode), points de retrait et horaires, formulaire de zone en panneau latéral, bouton « Aperçu client », encart coursier partenaire avec statistiques | Onglets Zones / Points de retrait / Coursiers, zones en liste par ville, tiroir d'édition | Décision |
| W35 | Statistiques vendeur | Ventes livrées par semaine sur 8 semaines, entonnoir vues → commandes, seuils annulation / refus avec action, délais médians de réponse et d'acceptation, meilleurs produits, « stock qui dort » avec actions, export | Page Statistiques à part (onglet du tableau de bord), structure différente ; non comparée en détail | Fonction |
| W36 | Revente (revendeur) | Onglets « Trouver des produits / Mes produits revendus (14) / Mes fournisseurs (2) », trois étapes, cartes avec prix fournisseur, prix minimum, stock fournisseur, « Revendu par N boutiques » | Pages séparées catalogue / fournisseurs / bons reliées par boutons ; pas de page « Mes produits revendus » (marge, statut masqué sous le prix minimum) | Fonction |
| W37 | Revente (fournisseur) | Onglets Bons de commande / Revendeurs / Produits proposés avec compteurs, demandes de revendeurs et règles de revente en colonne, colonnes « Votre part / À encaisser », bouton Étiquette | Pages séparées, sans règles de revente ni étiquette | Fonction |

## Écrans pas encore comparés

- Achat : paiement en attente (demande de paiement réelle requise), étapes
  paiement et récapitulatif du tunnel.
- Vendeur : fiche produit en revente (la revente est désactivée et aucune boutique de niveau 3 n'existe dans les données de démo).
- Ops : zones et échecs de livraison, produits revendus (fonctions désactivées
  dans les données de démo), revue de vérification côté modération.
- Web vendeur : activation de la revente, bon de commande fournisseur et
  produits revendus côté fournisseur (OpsWebResaleEnable, OpsWebPurchaseOrder,
  OpsWebResold), écrans réservés à l'équipe BuyNSellem.
