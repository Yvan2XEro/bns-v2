# Buy'N'Sellem mobile — Design system "Ndop"

Product context lives in [PRODUCT.md](PRODUCT.md). Tokens live in [constants/theme.ts](constants/theme.ts).

## The world
Ndop is the indigo resist-dyed cloth of the Grassfields: white lozenges and dots reserved out of deep blue. Market signage is the other half: prices and shop names painted in yellow, in fat letters you can read from across the road.

The app takes four things from that world and nothing else:
- **Palette.** Ndop blue carries the shell (`#2a51c0` by day, night indigo `#13183e` in dark mode), signage yellow marks prices and the sell action, and the neutrals are tinted indigo instead of grey.
- **Type.** Outfit is the painted-sign voice, and DM Sans is the working face.
- **Density.** Photo-led feeds, large prices, generous touch targets of 48–56pt.
- **One signature move: the price tag.** Every price is set in Outfit ExtraBold, ink on a yellow tag. On a card it sits on the photo; on a listing it is the largest thing on screen.

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
| faint | `#777ca3` | `#777ca3` | disabled, inactive tab icons (about 4.2:1: never for text that must be read; placeholders use mutedForeground) |
| border | `#e1e3ee` | `#2a3170` | hairlines |
| primary | `#2f5bd4` | `#3b82f6` | rails, rings, focus, icons with nothing on top |
| primaryFill | `#2f5bd4` | `#2448ab` | behind a white label: buttons, selected chips |
| link | `#2f5bd4` | `#9ec5fe` | brand-coloured words on a card |
| primaryTint | `#e3e9fb` | `#16265c` | selected chip, soft fills (a surface: words on it use link) |
| shell | `#2a51c0` | `#13183e` | home header, auth band, guest card |
| ownBubble | `#2448ab` | `#2448ab` | own chat bubbles, sheet actions, unread badges |
| sun | `#ffb81c` | `#ffc94a` | price tags, sell plaque, boosted frame |
| success | `#1e8a4f` | `#34b26a` | |
| warningText | `#6e4700` | `#ffd25a` | status words (successText, dangerText likewise) |
| destructive | `#d23a2e` | `#e5574b` | |

Rules:
- The brand blue is the web's: `primary` is `#2f5bd4` by day and `#3b82f6` by night. The night value is too light behind a white label (3.7:1) and too dark for words on a night card (4.3:1), so filled actions use `primaryFill` and brand words use `link`. Never use `primary` for either job.
- Text on yellow is always ink `#12163a`, never white.
- The shell indigo appears only on the home header, the auth band and the guest invitation. Everywhere else the ground is light (or night-indigo in dark mode).
- Own chat bubbles use `ownBubble` (`#2448ab`) in both themes, so white text stays legible.
- No coloured glows. A shadow is an ink shadow with an offset.

## Type

| Style | Face | Size / line |
|---|---|---|
| h1 | Outfit ExtraBold | 30 / 34, -0.8 |
| h2 | Outfit Bold | 23 / 28, -0.5 |
| section title | Outfit Bold | 20 / 25, -0.4 |
| price (card) | Outfit ExtraBold | 15 / 19 |
| price (listing) | Outfit ExtraBold | 30 / 36 |
| body | DM Sans Regular | 15 / 22 (16 in inputs and chat) |
| label | DM Sans SemiBold | 13–15 |
| button | DM Sans Bold | 16 |
| meta | DM Sans Regular | 12 / 16 |

## Shape
- Cards and photos: 14–16 radius. Buttons and inputs: 12. Tags and badges: 6–10.
- The sell tab is a squared yellow plaque with a darker foot, not a floating circle.
- Listing cards have no box: the photo carries the card and the words sit on the ground.

## Motion
Motion confirms, it does not decorate. It uses a decelerating ease (`0.16, 1, 0.3, 1`), and exits are faster than entrances.
- **Presses:** a 0.97 scale spring.
- **Tabs:** the tab icon dips and settles once.
- **Favourite heart:** pops to 1.25.
- **Cart count:** hops once when it goes up.
- **The one authored moment is the publish stamp** (`PublishedStamp`). When a listing goes live, a yellow price tag is stamped onto the screen with an ink ring.
- **Reduce Motion:** the stamp, the sheet and the toast fade instead of moving.
- **Loops:** none, except skeletons.

## Alerts
- **Toast:** news that needs no answer ("Saved", "Link copied"). It is an ink card at the top that leaves after 3–5 s and is announced to screen readers. `showSuccess` always routes here.
- **Sheet:** only decisions and errors. One tinted tile names the kind, the title is set in Outfit, and the actions are 52pt high. In a row, cancel sits left and the action right. Action buttons are `ownBubble` in both themes. Never white on yellow.

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
