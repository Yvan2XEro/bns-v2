# Buy'N'Sellem mobile — Design system "Ndop"

Product context lives in [PRODUCT.md](PRODUCT.md). Tokens live in [constants/theme.ts](constants/theme.ts).

## The world
Ndop is the indigo resist-dyed cloth of the Grassfields: white lozenges and dots reserved out of deep blue. Market signage is the other half: prices and shop names painted in yellow, in fat letters you can read from across the road.

The app takes four things from that world and nothing else:
- **Palette.** Ndop indigo carries the shell, signage yellow marks prices and the sell action, and the neutrals are tinted indigo instead of grey.
- **Type.** Bricolage Grotesque is the painted-sign voice, and Figtree is the working face.
- **Density.** Photo-led feeds, large prices, generous touch targets of 48–56pt.
- **One signature move: the price tag.** Every price is set in Bricolage ExtraBold, ink on a yellow tag. On a card it sits on the photo; on a listing it is the largest thing on screen.

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
| faint | `#777ca3` | `#777ca3` | placeholders, disabled |
| border | `#e1e3ee` | `#2a3170` | hairlines |
| primary | `#23338f` | `#6878ea` | buttons, links, selection |
| primaryTint | `#e3e7f8` | `#1d2568` | selected chip, soft fills |
| shell | `#1d2a7a` | `#13183e` | home header, auth band, guest card |
| sun | `#ffb81c` | `#ffc94a` | price tags, sell plaque, boosted frame |
| success | `#1e8a4f` | `#34b26a` | |
| warning text | `#9a6a00` | `#ffd25a` | |
| destructive | `#d23a2e` | `#e5574b` | |

Rules:
- Text on yellow is always ink `#12163a`, never white.
- The shell indigo appears only on the home header, the auth band and the guest invitation. Everywhere else the ground is light (or night-indigo in dark mode).
- Own chat bubbles use `#2f43b5` in both themes, so white text stays legible.
- No coloured glows. A shadow is an ink shadow with an offset.

## Type

| Style | Face | Size / line |
|---|---|---|
| h1 | Bricolage ExtraBold | 30 / 34, -0.8 |
| h2 | Bricolage Bold | 23 / 28, -0.5 |
| section title | Bricolage Bold | 20 / 25, -0.4 |
| price (card) | Bricolage ExtraBold | 15 / 19 |
| price (listing) | Bricolage ExtraBold | 30 / 36 |
| body | Figtree Regular | 15 / 22 (16 in inputs and chat) |
| label | Figtree SemiBold | 13–15 |
| button | Figtree Bold | 16 |
| meta | Figtree Regular | 12 / 16 |

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
- **Sheet:** only decisions and errors. One tinted tile names the kind, the title is set in Bricolage, and the actions are 52pt high. In a row, cancel sits left and the action right. Action buttons are `#2f43b5` in both themes. Never white on yellow.

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
