# Plan de refonte design — Buy'N'Sellem Mobile

> Référence : web (`packages/web`), Leboncoin, OLX Pro, Vinted, Airbnb

---

## 1. Problèmes identifiés dans l'implémentation actuelle

### 1.1 Emojis partout — à remplacer par des icônes Ionicons
Chaque usage d'emoji dans le code est à remplacer par l'icône Ionicons équivalente :

| Emoji actuel | Remplacer par | Contexte |
|---|---|---|
| `📍` | `Ionicons name="location-outline"` | Location dans ListingCard, détail |
| `🕐` | `Ionicons name="time-outline"` | Temps dans ListingCard |
| `👁` | `Ionicons name="eye-outline"` | Vues |
| `⭐` | `Ionicons name="flash"` (amber) | Featured badge |
| `❤️` / `🤍` | `Ionicons name="heart"` / `"heart-outline"` | Favoris |
| `📷` | `Ionicons name="camera-outline"` | Compteur photos |
| `📦` | `Ionicons name="cube-outline"` | Mes annonces |
| `🔖` | `Ionicons name="bookmark-outline"` | Recherches sauvegardées |
| `🚀` | `Ionicons name="rocket-outline"` | Boost |
| `⚙️` | `Ionicons name="settings-outline"` | Paramètres |
| `🔔` | `Ionicons name="notifications-outline"` | Notifications |
| `❓` | `Ionicons name="help-circle-outline"` | Aide |
| `🛡️` | `Ionicons name="shield-checkmark-outline"` | Sécurité |
| `📩` | `Ionicons name="mail-outline"` | Contact |
| `📄` | `Ionicons name="document-text-outline"` | CGU |
| `🔒` | `Ionicons name="lock-closed-outline"` | Confidentialité |
| `🚪` | `Ionicons name="log-out-outline"` (rouge) | Déconnexion |
| `✓` verified | `Ionicons name="checkmark-circle"` (blue) | Badge vérifié |
| `🏪` `👀` etc. | `Ionicons name="shield-outline"` etc. | Safety tips |
| `📦` empty state | `Ionicons name="cube-outline"` large | EmptyState |
| `💬` | `Ionicons name="chatbubbles-outline"` | Messages vides |
| `❤️` empty favs | `Ionicons name="heart-outline"` | Favoris vides |
| `🔍` | `Ionicons name="search-outline"` | Recherche vide |

### 1.2 Design des cartes non conforme au web
Le web utilise :
- `rounded-xl` → mobile : `borderRadius: 12`
- `border border-[#E2E8F0]` → `borderWidth: 1, borderColor: '#E2E8F0'`
- Hover lift → via Pressable `scale(0.98)` on press
- Ring amber pour boosted : `ring-1 ring-[#F59E0B]/40`
- Photo compteur : fond noir semi-transparent `bg-black/60`
- Prix : `font-bold text-[#0F172A] text-lg` (pas bleu)
- Titre : `text-[#334155] text-sm`
- Meta : `text-[#94A3B8] text-xs` avec icônes MapPin + Clock

### 1.3 Logo absent
Le header web affiche `Buy'N'Sellem` avec les apostrophes en amber `#F59E0B`.
L'app mobile doit afficher le même logo texte (pas de texte générique).

### 1.4 Bouton "Vendre" (CTA)
Sur le web : fond amber `#F59E0B`, texte `#0F172A`, icône `PlusCircle`.
Sur mobile : le tab central doit avoir ce style exactement.

---

## 2. Palette de couleurs — référence exacte du web

```
Light mode:
  background:     #F8FAFC   (slate-50)
  foreground:     #0F172A   (slate-900)
  card:           #FFFFFF
  card-border:    #E2E8F0   (slate-200)
  primary:        #1E40AF   (blue-700)  → boutons, liens actifs
  primary-light:  #DBEAFE   (blue-100)  → fond actif tab
  primary-ring:   #3B82F6 / #93C5FD    → focus rings
  secondary-bg:   #F1F5F9   (slate-100) → input bg, pill inactive
  muted-text:     #64748B   (slate-500) → labels
  faint-text:     #94A3B8   (slate-400) → placeholders, meta
  dark-text:      #334155   (slate-700) → titres secondaires
  amber:          #F59E0B   → sell CTA, featured badge
  amber-dark:     #D97706   → hover amber
  amber-ring:     rgba(245,158,11,0.4) → ring boosted card
  destructive:    #DC2626   → rouge danger/déconnexion
  focus-border:   #93C5FD   → input focus

Dark mode:
  background:     #0B1120
  foreground:     #E2E8F0
  card:           #1E293B
  card-border:    #1E3A5F
  primary:        #3B82F6
  primary-light:  #1E3A5F
  muted-text:     #94A3B8
  secondary-bg:   #1E293B
```

---

## 3. Composants à refaire entièrement

### 3.1 `ListingCard.tsx`
Modèle exact du web :
```
┌────────────────────────────────┐
│ [IMAGE 4:3]                    │
│ ┌──────────┐      ┌──────────┐ │
│ │⚡Featured│      │ ♥ (icon) │ │  ← badges top
│ └──────────┘      └──────────┘ │
│                   ┌──────────┐ │
│                   │📷 3 pht  │ │  ← compteur bottom-right
│                   └──────────┘ │
├────────────────────────────────┤
│ 85 000 XAF          (bold lg) │
│ iPhone 13 Pro 256Go  (sm gray)│
│ [pin] Douala    [clock] 2h    │  ← icônes Ionicons
└────────────────────────────────┘
```
- Carte : bg white, border #E2E8F0, radius 12, shadow subtle
- Boosted : border/ring amber `rgba(245,158,11,0.3)`
- Prix : `#0F172A`, fontWeight 700, fontSize 16
- Titre : `#334155`, fontSize 13, 2 lignes max
- Meta : `#94A3B8`, fontSize 11, icônes Ionicons 12px

### 3.2 `CategoryIcon.tsx`
- Cercle : bg `#F1F5F9`, border `#E2E8F0`, radius 50%
- Icône : image de la catégorie (API) ou Ionicons `cube-outline` (pas d'emoji)
- Label : `#334155`, fontSize 11

### 3.3 `EmptyState.tsx`
- Icône Ionicons large (48px) en `#CBD5E1`
- Pas d'emoji
- Titre `#0F172A` bold, sous-titre `#64748B`
- Bouton CTA style primary

### 3.4 `StatusPill.tsx`
- Supprimer tous les labels avec caractères spéciaux
- Garder uniquement texte + bg coloré

---

## 4. Écrans à refaire

### 4.1 `(tabs)/_layout.tsx` — Tab Bar
- Style épuré, fond blanc/`#0B1120` dark
- Tab actif : `#1E40AF` / `#3B82F6`
- Tab inactif : `#94A3B8`
- Label sous l'icône : 10px, fontWeight 600
- Bouton "Vendre" central : fond `#F59E0B`, icône `add` blanc, cercle 52px, ombre amber
- Badge messages : rouge `#DC2626`, texte blanc

### 4.2 `(tabs)/home/index.tsx` — Page d'accueil
- **Header** : Logo texte `Buy'N'Sellem` (apostrophes amber `#F59E0B`) à gauche, avatar à droite
- Pas de message "Bonjour 👋" avec emoji — remplacer par salutation sobre
- **Barre de recherche** : style web exact (bg `#F8FAFC`, border `#E2E8F0`, radius 12, icône `search` Ionicons)
- **Section catégories** : titre `Catégories` sans emoji, cercles avec image API (pas d'emoji fallback — utiliser icône Ionicons cube)
- **Annonces à la une** : titre sans emoji — juste `À la une` + badge `⚡` remplacé par `Ionicons flash` amber
- **Section récente** : titre `Annonces récentes` sans emoji

### 4.3 `(tabs)/search/index.tsx` — Recherche
- Barre de recherche identique au web
- Sort pills : style du web (bg `#F1F5F9` inactif, `#1E40AF` actif)
- Bouton Filtres : Ionicons `options-outline`, pas de texte "Filtres" si espace manquant
- Résultats : liste ListingCard redessinée

### 4.4 `(tabs)/account/index.tsx` — Compte
- Menu items : Ionicons uniquement (plus d'emoji préfixes)
- Format : `[icône 20px] [label] [chevron-forward 16px]`
- Section headers : texte uppercase gris clair, `#94A3B8`, fontSize 11, letterSpacing 1
- Couleur destructive : `#DC2626` pour "Se déconnecter"

### 4.5 `listing/[id].tsx` — Détail annonce
- Header transparent sur l'image (boutons flottants avec backdrop blur)
- Badges : Ionicons `flash` pour Featured, `checkmark-circle` pour Vérifié
- Safety tips : Ionicons `shield-checkmark-outline` titre, `checkmark` bullet (pas d'emoji)
- Action bar : style web — bouton "Contacter" primary, icônes Ionicons

### 4.6 `auth/login.tsx` & `auth/register.tsx`
- Logo `Buy'N'Sellem` (texte avec amber apostrophes) en haut, pas d'emoji 🛒 ✨
- Design épuré type Airbnb/Vinted
- Champs : border `#E2E8F0`, focus `#93C5FD`, radius 10
- Bouton : `#1E40AF`, radius 12

### 4.7 `boost/[listingId].tsx` — Boost
- Icône `rocket-outline` Ionicons (pas emoji 🚀)
- Plans : cards propres, radio button custom
- Bouton : fond `#F59E0B`, Ionicons `flash` icon

### 4.8 `account/listings.tsx`
- Stats cards : sans emoji dans les labels
- Actions : Ionicons uniquement

### 4.9 `help.tsx` / `safety.tsx`
- Ionicons pour chaque tip (shield, eye, cash, people, person, flag)
- Pas d'emoji préfixes dans les titres

---

## 5. Design system — constantes à utiliser

```ts
// Spacing (4pt grid)
spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 }

// Border radius
radius = { sm: 6, md: 10, lg: 12, xl: 16, full: 9999 }

// Typography
fontSize = {
  xs: 11,   // meta, captions
  sm: 13,   // labels, body small
  base: 15, // body
  lg: 17,   // section titles
  xl: 20,   // headings
  '2xl': 24,
  '3xl': 28,
}
fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' }

// Shadows (iOS)
shadow = {
  sm: { shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:2, elevation:1 },
  md: { shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:8, elevation:3 },
  lg: { shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.12, shadowRadius:16, elevation:6 },
}
```

---

## 6. Ordre d'implémentation

| Priorité | Fichier | Description |
|---|---|---|
| 1 | `constants/theme.ts` | Toutes les constantes design |
| 2 | `src/components/ListingCard.tsx` | Carte annonce fidèle au web |
| 3 | `src/components/CategoryIcon.tsx` | Sans emoji |
| 4 | `src/components/EmptyState.tsx` | Ionicons uniquement |
| 5 | `src/components/StatusPill.tsx` | Nettoyage |
| 6 | `app/(tabs)/_layout.tsx` | Tab bar redessinée |
| 7 | `app/(tabs)/home/index.tsx` | Page d'accueil |
| 8 | `app/(tabs)/account/index.tsx` | Menu compte |
| 9 | `app/listing/[id].tsx` | Détail annonce |
| 10 | `app/auth/login.tsx` + `register.tsx` | Auth screens |
| 11 | `app/boost/[listingId].tsx` | Boost modal |
| 12 | `app/account/listings.tsx` | Mes annonces |
| 13 | `app/help.tsx` + `safety.tsx` | Info pages |

---

## 7. Références visuelles

- **Leboncoin** : cards propres, prix en rouge (nous: bleu navy), meta gris avec icônes
- **OLX Pro** : header avec logo + search bar centrée, tabs colorées
- **Vinted** : bouton CTA vert proéminent (nous: amber), cartes minimalistes
- **Airbnb** : auth screen avec logo épuré, formulaires épurés
- **Facebook Marketplace** : catégories avec icônes (pas emoji), grille 2 colonnes

---

*Ce plan guide la refonte complète du design mobile pour qu'il soit cohérent avec le web et professionnel comme les grandes plateformes de marketplace.*
