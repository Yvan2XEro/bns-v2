# The mobile app on tablets — October 2026

The app runs on tablets, but it is still a phone app made bigger. This
document records what a tablet gets today, the target, and the order of the
work.

## 1. Today

**Locked in portrait.** `app.json` sets `"orientation": "portrait"`:
- an Android tablet cannot be turned to landscape;
- on iPad, the app cannot share the screen (Split View, Slide Over, Stage
  Manager), because iPadOS only allows that for apps that support every
  orientation.

**One rule, applied unevenly.** `useResponsive()` already gives a breakpoint
(768 dp), grid columns (2, 3, then 4) and a centred reading column. But only
39 of the 116 screens use it:

| Area | Adapted | Not adapted |
| --- | --- | --- |
| Buyer tabs (home, search, favourites, messages, account) | yes | — |
| Ad, shop, profile, ad form | yes | — |
| Sign-in and sign-up | yes, through `AuthLayout` | — |
| Cart, checkout, purchases, returns, disputes | — | all, stretched edge to edge |
| Seller workspace (dashboard, orders, catalogue, stock, inbox, payments, team, verification) | — | all 40-odd screens |
| Conversation | only the message column | — |

**Every list replaces the whole screen.** Opening a conversation, an order or
an ad from a list leaves the list. On a tablet that means going back and
forth, where the Play Store keeps the list on the left and shows the item on
the right.

**The tab bar stays at the bottom**, stretched across 1,200 dp, five icons far
apart.

**Expo's SplitView cannot be used here.** It is `expo-router/unstable-split-view`
and runs on iOS only: elsewhere it warns and behaves like a plain stack. The
tablets our users hold are mostly Android.

## 2. Principles

1. **Window size classes, not "is it a tablet".** The layout follows the
   window's width, which changes with rotation, split screen and Stage
   Manager. The classes are Material's:
   - **compact**, under 600 dp: phones; the app stays exactly as it is;
   - **medium**, 600 to 839 dp: tablets in portrait and wide split screens;
   - **expanded**, 840 dp and over: tablets in landscape.
2. **Phones do not change by a pixel.** Every rule applies from medium up.
3. **One building block per pattern, used by every screen.** No screen
   re-derives a maximum width or a column count.
4. **Lists and their items side by side, on every platform.** We build it in
   JavaScript, so it works on Android tablets as well as iPads.

## 3. The building blocks

| Block | What it does |
| --- | --- |
| `useResponsive().sizeClass` | `compact`, `medium` or `expanded`, next to the existing `isTablet` and `columns` |
| `<ScreenColumn>` | The reading or form column, centred and width-capped from medium up. It is the scroll container every screen without a grid uses, and replaces the hand-written `centeredContent` |
| `<SplitLayout list detail>` | **Expanded:** a list pane (about 380 dp) and a detail pane; the selected item lives in the route's search params, so a deep link or a notification lands on it with the list still shown. **Compact or medium:** only the list, and opening an item pushes its screen as today |
| Navigation rail | In expanded, the buyer and seller tabs move to a vertical rail on the left (`tabBarPosition: "left"`, React Navigation 7) |
| Two-column forms | In expanded, long forms (ad, product, shop settings, checkout) pair their short fields; one field per row stays the rule on phones |
| Sheets become dialogs | Bottom sheets are centred and width-capped from medium up (`dialogMaxWidth` exists; not every sheet uses it) |

## 4. Where the split pays off

Ordered by how much a person on a tablet goes back and forth:

1. **Seller inbox and orders.** A seller at the counter answers and accepts
   orders all day.
2. **Buyer messages.** Conversations on the left, the thread on the right.
3. **Search results and ads.** The results stay, the ad opens beside them.
4. **Purchases, returns and disputes.**
5. **Catalogue and products.**
6. **Moderation queues.**

## 5. Other details

- **The ad page in expanded** puts the photos on the left and the price,
  actions and seller on the right, instead of one tall column.
- **Grids** keep their cards at a readable size: the column count follows the
  width (`columns` already does), but a card never grows past about 260 dp.
- **Keyboard and pointer.** Tablets often have a keyboard:
  - Enter sends a message;
  - focused fields stay visible beside the on-screen keyboard;
  - every control gets a hover or press state.
- **Images.** In expanded, cards and galleries ask the next image size up
  (`mediaUrl` sizes), so a 12-inch screen does not stretch a phone thumbnail.

## 6. Lots

1. **Foundations.**
   - Allow every orientation on tablets, keep phones locked in portrait
     (`expo-screen-orientation`). This is a native change, so it needs a new
     store build.
   - Add `sizeClass`, `<ScreenColumn>` and the navigation rail.
2. **`<SplitLayout>`,** on seller orders and inbox, then buyer messages.
3. **Search results and ads,** and the two-column ad page.
4. **Uniform screens.** Every remaining screen on `<ScreenColumn>`: cart,
   checkout, purchases, the whole seller workspace. Two-column forms in
   expanded.
5. **The rest.** Purchases, returns, disputes, catalogue and moderation in
   split view; sheets become dialogs.

**Where it stands (October 2026).** All five lots are in `dev`. Choices made
along the way:
- An item reached from several lists keeps a plain route: the listing (search,
  home, shops, favourites), the return case (the buyer's and the seller's
  returns) and the dispute (the buyer's list, the problem flow, moderation).
  Each list still shows it beside itself; only a deep link opens it full
  screen.
- An editor is never put in a pane. The product editor guards unsaved
  changes on leaving the screen; in a pane, picking another product would
  drop them silently. The catalogue opens it full screen.
- The moderation hub mixes listings, reports and risk flags in one queue, so
  it stays a hub; its disputes queue is a split.
- Sheets read the window, not the pane they open from
  (`useSheetPresentation`): a bottom sheet on a phone, a centred dialog of
  `dialogMaxWidth` from medium up. Full-screen pickers (tags) stay full
  screen.
- The account tab is a split too: the menu stays on the left and the chosen
  entry (profile, purchases, addresses, settings, help…) opens on the right.
  Seller mode, moderation and the courier space still take the whole screen.
- Every change of pane is animated (`paneMotion`), and tab changes shift on
  tablets.
- Long forms pair their short fields with `<FormRow>` in expanded; the ad
  form, a step-by-step wizard of one card per field, keeps one column.

**Testing.** Every lot is checked on:
- an Android tablet emulator (Pixel Tablet, in portrait and landscape);
- an iPad simulator (11", full screen and Split View);
- a phone, to confirm nothing moved.
