# Buy'N'Sellem mobile — Design system "Ndop"

Product context lives in [PRODUCT.md](PRODUCT.md). Tokens live in [constants/theme.ts](constants/theme.ts).

## The world
Ndop is the indigo resist-dyed cloth of the Grassfields: white lozenges and dots reserved out of deep blue. Market signage is the other half: prices and shop names painted in yellow, in fat letters you can read from across the road.

The app takes four things from that world and nothing else:
- **Palette.** Ndop blue carries the shell (`#2a51c0` by day, night indigo `#13183e` in dark mode), signage yellow marks prices and the sell action, and the neutrals are tinted indigo instead of grey.
- **Type.** Poppins is the painted-sign voice, and Inter is the working face.
- **Density.** Photo-led feeds, large prices, generous touch targets of 48–56pt.
- **One signature move: the price tag.** Every price is set in Poppins ExtraBold, ink on a yellow tag. On a card it sits on the photo; on a listing it is the largest thing on screen.

Navigation, controls, sheets and gestures stay native. The world never supplies them.

## Colour

| Role | Light | Dark | Use |
|---|---|---|---|
| background | `#f4f5f9` | `#0c1030` | screen ground |
| card | `#ffffff` | `#1a1f4a` | lists, sheets, fields |
| well | `#eceef5` | `#13183e` | inputs, segmented tracks, image placeholders |
| foreground | `#12163a` | `#e1e3ee` | text |
| body | `#3a3f66` | `#c9cce0` | secondary text |
| mutedForeground | `#5b6088` | `#a3a7c8` | labels, meta |
| faint | `#777ca3` | `#777ca3` | disabled states (about 4.2:1: never for text that must be read; placeholders and inactive tabs use mutedForeground) |
| border | `#e1e3ee` | `#2a3170` | hairlines |
| primary | `#2f5bd4` | `#3b82f6` | rails, rings, focus, icons with nothing on top |
| primaryFill | `#2f5bd4` | `#2448ab` | behind a white label: buttons, selected chips |
| link | `#2f5bd4` | `#9ec5fe` | brand-coloured words on a card |
| primaryTint | `#e3e9fb` | `#16265c` | selected chip, soft fills (a surface: words on it use link) |
| shell | `#2a51c0` | `#13183e` | home header, seller hub header, auth band, onboarding, guest card |
| ownBubble | `#2448ab` | `#2448ab` | own chat bubbles, sheet actions, unread badges |
| sun | `#ffb81c` | `#ffc94a` | price tags, sell plaque, boosted frame |
| success | `#1e8a4f` | `#34b26a` | |
| warningText | `#6e4700` | `#ffd25a` | status words (successText, dangerText likewise) |
| destructive | `#d23a2e` | `#e5574b` | |

Rules:
- The brand blue is the web's: `primary` is `#2f5bd4` by day and `#3b82f6` by night. The night value is too light behind a white label (3.7:1) and too dark for words on a night card (4.3:1), so filled actions use `primaryFill` and brand words use `link`. Never use `primary` for either job.
- Text on yellow is always ink `#12163a`, never white.
- The shell means "you are home": it appears only on the landing screen of each mode (the buyer home header and the seller hub header) and on the ways in (the auth band, onboarding, the guest invitation). Every other screen, seller screens included, sits on the light ground (or night-indigo in dark mode).
- Own chat bubbles use `ownBubble` (`#2448ab`) in both themes, so white text stays legible.
- No coloured glows. A shadow is an ink shadow with an offset.

## Type
Nine roles, as `TextStyles` in `constants/theme.ts`. Each role is a size the eye can tell from its neighbour, and every text style in the app sits on one of them. Don't add sizes between the steps (14, 17, 19, 22): adjacent sizes can't carry different jobs, and they blur the hierarchy.

| Role | Face | Size / line | Use |
|---|---|---|---|
| display | Poppins ExtraBold | 30 / 38, -0.8 | tab-root large title |
| title | Poppins Bold | 24 / 32, -0.5 | screen and sheet title, step heading |
| section | Poppins Bold | 20 / 28, -0.4 | section title on a screen |
| heading | Poppins Bold | 18 / 26, -0.2 | card and group heading, centred stack title |
| strong | Inter SemiBold / Bold | 16 / 22 | row titles, button labels (Bold) |
| body | Inter Regular | 15 / 22 | running text (16 in inputs and chat) |
| label | Inter SemiBold | 13 / 18 | field labels, chips, secondary actions |
| caption | Inter Regular / Medium | 12 / 16 | place, time, counts |
| micro | Inter SemiBold | 11 / 14 | badges, tab labels; never running text |
| price | Poppins ExtraBold | 15–16 on cards, 30 / 38 on a listing | always ink on the yellow tag |

Rules:
- **Hierarchy comes from role, weight and colour together**, not size alone. Text colour has three steps: `foreground` for titles and values, `body` for running text, `mutedForeground` for metadata. Brand words use `link`, never `primary`.
- **Poppins only from 16 up**, except numbers and prices.
- **Poppins needs room:** its ascenders and accented capitals (É, À) are tall, so display line heights are about 1.3–1.45× the size; tighter clips them on Android.
- **Every text style sets a fontFamily**, so it never falls back to the system font. Display roles (18+) and body roles both set a line height.
- **Text inputs set no lineHeight**: it shifts the caret and clips text on both platforms.

## Shape
- Cards and photos: 14–16 radius. Buttons and inputs: 12. Tags and badges: 6–10.
- The publish tab is a small squared yellow plaque (50 × 32, darker foot), level with the other tabs: never raised, never a floating circle.
- Listing cards have no box: the photo carries the card and the words sit on the ground.

## Motion
Motion confirms, it does not decorate. It uses a decelerating ease (`0.16, 1, 0.3, 1`), and exits are faster than entrances.
- **Presses:** a 0.97 scale spring.
- **Tabs:** the selection mark slides to the new tab in 200 ms; the glyph swaps from outline to filled. With Reduce Motion the mark jumps.
- **Favourite heart:** pops to 1.25.
- **Cart count:** hops once when it goes up.
- **The one authored moment is the publish stamp** (`PublishedStamp`). When a listing goes live, a yellow price tag is stamped onto the screen with an ink ring.
- **Reduce Motion:** the stamp, the sheet and the toast fade instead of moving.
- **Loops:** none, except skeletons. Background patterns (`NdopPattern`, `ShellPattern`) are static.

## Tab bar
`src/components/navigation/QuietTabBar.tsx` is variant D, "la barre discrète", which Brice chose from four expert proposals:
- **No box.** The bar sits on the screen's own ground (`background`) under one hairline (`border`), 60dp plus the safe area. It has no shadow and no white panel.
- **Selection has three cues, none of them hue alone:**
  - a 3 × 24dp `primary` mark under the hairline (a shop's brand colour in seller mode);
  - the filled glyph (outline at rest), 27dp so it reads at arm's length;
  - the label in ink and Inter Bold (`mutedForeground` and SemiBold at rest).
- **Publier** (creating a listing, not "selling") is the only saturated colour: the 50 × 32 yellow plaque, level with the other tabs, with an ink plus and an ink label. It never gets the mark.
- **Badges:**
  - **Messages:** a count in `ownBubble`, white Inter Bold 11, ringed with the ground colour, shown as "9+" above nine. An unread message is not an error, so the badge is not red.
  - **Account:** a `primary` dot with no number.
  - Screen readers hear the count ("Messages, 3 non lus").
- **Haptics:** a selection tick on a change of tab (iOS and Android), a light tap on Publier, nothing on the tab already open.
- **Seller mode:** the same bar with four or five equal tabs and no plaque. Adding a product lives in the catalogue.
- **Tablets in landscape** keep the navigator's rail.

## Alerts
- **Toast:** news that needs no answer ("Saved", "Link copied"). It is an ink card at the top that leaves after 3–5 s and is announced to screen readers. `showSuccess` always routes here. A toast may carry one action ("Annuler", "Voir"), drawn in the night `link` colour; it then stays 7 s. The action is a shortcut, never the only way: what it does must stay reachable from the screen.
- **Sheet:** only decisions and errors. One tinted tile names the kind, the title is set in Poppins, and the actions are 52pt high. In a row, cancel sits left and the action right. Action buttons are `ownBubble` in both themes. Never white on yellow.

## Sound and haptics
`src/lib/feedback.ts`, one call per meaningful moment, never per tap.
- **The voice is a balafon:** a struck wooden bar over a gourd, pentatonic. The six files in `assets/sounds` are synthesised, not sampled. They are under 0.6 s and mixed quietly.
- **Each sound has one meaning:**

| Sound | Moment |
|---|---|
| pop | a favourite is saved |
| send | your message leaves |
| receive | their message arrives |
| success | something you asked for went through |
| error | a refusal |
| notice | a warning |

- **Haptics follow the same meaning.** An error only buzzes when its sheet already sounds. Removing a favourite or a confirm prompt only ticks.
- **Respecting the user:** sounds obey the iPhone silent switch, mix with other audio, and can be switched off in Settings → Sounds.
- **Robustness:** a build without the audio module keeps its haptics.

## The ndop pattern
`src/components/brand/NdopPattern.tsx` draws lozenges strung on a line, with dots, in white at 5% opacity (4% on the full-screen onboarding). Use it only on shell surfaces. It is decorative, hidden from screen readers, and never sits behind body text smaller than 15pt.
