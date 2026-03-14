# Mobile Implementation Guide — Buy'N'Sellem

Comprehensive specification for implementing the Expo mobile app. Every screen described here has its equivalent on the web and is fully supported by the existing API. The mobile app must feel **native** — not a web wrapper. Use `@expo/ui` (SwiftUI / Jetpack Compose), `expo-router`, `FlashList`, `react-native-reanimated`, and `expo-image` as the foundation.

---

## 1. Navigation Architecture

### 1.1 Tab Navigator (bottom)

| Tab | Icon | Stack Root | Badge |
|-----|------|-----------|-------|
| Home | `Home` | `/(tabs)/home` | — |
| Search | `Search` | `/(tabs)/search` | — |
| Sell | `PlusCircle` | `/(tabs)/create` | — |
| Messages | `MessageCircle` | `/(tabs)/messages` | Unread count |
| Account | `User` | `/(tabs)/account` | — |

Each tab has its own navigation stack. Use Expo Router file-based routing.

### 1.2 Modal / Push screens (outside tabs)

| Route | Type | Source |
|-------|------|--------|
| `/listing/[id]` | Push | From Home, Search, Favorites, Profile |
| `/listing/[id]/edit` | Push | From My Listings |
| `/profile/[userId]` | Push | From Listing detail, Messages |
| `/auth/login` | Modal (fullscreen) | Any protected action |
| `/auth/register` | Modal (fullscreen) | From Login |
| `/auth/forgot-password` | Modal | From Login |
| `/filters` | Modal (bottom sheet) | From Search |
| `/boost/[listingId]` | Modal (bottom sheet) | From Listing detail, My Listings |
| `/report` | Modal (bottom sheet) | From Listing, Profile, Chat |
| `/settings` | Push | From Account tab |

### 1.3 Transitions

- Stack screens: native slide from right (iOS) / slide up (Android)
- Modals: slide from bottom, dismissable by swipe down
- Tab switches: instant (no animation)
- Use `react-native-reanimated` for shared element transitions (listing card → detail image)

---

## 2. Screens Specification

### 2.1 Home — `/(tabs)/home/index.tsx`

**API calls:**
- `GET /api/public/categories?depth=1` → categories with icons
- `GET /api/public/search?limit=8&sort=-createdAt` → recent listings
- `GET /api/public/search?limit=4` → filter boosted listings client-side
- `GET /api/favorites?limit=200` → user's favorite IDs (if logged in)

**Layout (top to bottom):**

1. **Search bar** (tappable, navigates to Search tab)
   - `@expo/ui` `TextField` with search icon, read-only on Home
   - Rounded corners, light gray background, placeholder: "Search items, cars, phones..."
   - On press → `router.push('/(tabs)/search')` with auto-focus

2. **Categories** (horizontal `ScrollView`)
   - Row of circular icons/emojis with label below
   - Each item: 56×56 circle with category emoji/image, 10pt label
   - On press → navigate to Search with `?category={id}` pre-filled
   - Show first 8 categories, then "More" button → full category grid modal

3. **Featured/Boosted Listings** (horizontal `FlashList`)
   - Only shown if boosted listings exist
   - Large cards (280×200): full-bleed image, price overlay, location, "Featured" badge
   - `expo-image` with `contentFit="cover"` and blurhash placeholder
   - Horizontal scroll with snap-to-item (`pagingEnabled`)
   - On press → `/listing/[id]`

4. **Recent Listings** (vertical `FlashList`, 2 columns)
   - Standard listing cards (see Component Spec §3.1)
   - `numColumns={2}` on phone, `numColumns={3}` on tablet
   - Pull-to-refresh → re-fetch all data
   - Heart icon on each card → toggle favorite (optimistic UI, revert on error)
   - "See all" button → navigate to Search tab

**Interactions:**
- Pull-to-refresh refreshes all sections
- Long-press on listing card → haptic feedback + context menu (Share, Favorite, Report)

---

### 2.2 Search — `/(tabs)/search/index.tsx`

**API calls:**
- `GET /api/public/search?q=&category=&minPrice=&maxPrice=&location=&sort=&condition=&lat=&lng=&radius=&attr_*=&limit=20&offset=0`
- `GET /api/public/categories?depth=1` → for filter dropdown
- `GET /api/favorites?limit=200` → favorite IDs
- `POST /api/saved-searches` → save current search

**Layout:**

1. **Search bar** (sticky top, auto-focused when navigating from Home)
   - `@expo/ui` `TextField` with clear button
   - Real-time search with 300ms debounce
   - Cancel button on right (iOS) / back arrow (Android)

2. **Filter chips** (horizontal `ScrollView` below search bar)
   - Active filters shown as pills: "Vehicles", "< 50,000 XAF", "Near me (10km)", "New"
   - Each chip has × to remove
   - "Filters" chip with badge showing count → opens `/filters` modal

3. **Sort selector** (inline, right-aligned above results)
   - Dropdown or segmented control: Newest | Price ↑ | Price ↓
   - Changes trigger immediate re-fetch

4. **Results list** (vertical `FlashList`, 2 columns)
   - Standard listing cards
   - Infinite scroll: load next 20 when reaching end (`onEndReached`)
   - Empty state: illustration + "No results" + "Try different filters" CTA
   - Pull-to-refresh

5. **Save search FAB** (floating button, bottom-right)
   - Only visible when query or filters are active
   - On press → prompt for search name (pre-filled with query), then `POST /api/saved-searches`
   - Toast confirmation: "Search saved! You'll be notified of new matches."

**Filter Modal — `/filters.tsx` (bottom sheet)**

Presented as a `@expo/ui` bottom sheet or Expo Router modal with `presentation: "modal"`.

Sections (scrollable):
- **Category**: searchable dropdown with hierarchy (parent → children indented)
- **Price**: two `@expo/ui` `TextField` inputs (Min / Max) with number keyboard
- **Condition**: checkbox group (New, Like New, Good, Fair, Poor)
- **Location**: text input + "Use my location" button (`expo-location`)
- **Radius**: slider (5 / 10 / 25 / 50 / 100 km), only shown when location is set
- **Dynamic attributes**: rendered based on selected category's `attributes[]` (text/number/select/boolean fields)
- **Apply** button (primary, full-width) at bottom
- **Reset** link to clear all filters

---

### 2.3 Listing Detail — `/listing/[id].tsx`

**API calls:**
- `GET /api/listings/{id}?depth=1` → listing with seller, category, images
- `GET /api/favorites?where[listing][equals]={id}&limit=1` → is favorited
- `GET /api/public/similar?id={id}&limit=6` → similar listings
- `GET /api/users/me` → current user (for ownership check)

**Layout (scrollable):**

1. **Image Gallery** (full-width, swipeable)
   - Horizontal pager with `expo-image`
   - Page indicator dots at bottom
   - Pinch-to-zoom support
   - On tap → fullscreen gallery modal with zoom
   - If boosted: "Featured" badge overlay (top-left)
   - Image count badge (bottom-right): "3 photos"

2. **Price & Title**
   - Price: large bold text, "XAF" suffix in lighter weight
   - Title: 18pt, below price
   - Condition badge: "New", "Like New", etc. (pill style)
   - Boosted badge if applicable

3. **Meta row** (horizontal, muted text)
   - 📍 Location
   - 🕐 Time ago (e.g., "2h ago", "3d ago")
   - 👁 Views count
   - 📅 Expires in X days (if owner viewing)

4. **Action bar** (sticky, floating at bottom of screen)
   - **If not owner:**
     - "Message Seller" button (primary, full-width left)
     - Heart icon (favorite toggle)
     - Share icon
     - Phone icon (if seller has phone → opens phone-reveal bottom sheet)
   - **If owner & listing is published & not boosted:**
     - "Boost" button (amber, opens boost modal)
     - "Edit" button (secondary)
   - **If owner & listing is boosted:**
     - "Boosted until {date}" badge
     - "Edit" button

5. **Description** (expandable)
   - First 3 lines shown, "Read more" to expand
   - Whitespace preserved

6. **Attributes/Details** (grid, 2 columns)
   - Key-value pairs from `listing.attributes`
   - E.g., "Brand: Honda", "Year: 2020", "Mileage: 45,000 km"

7. **Seller Card**
   - Avatar + name + verified badge
   - Rating (stars + count)
   - "Member since {date}"
   - On press → `/profile/{sellerId}`
   - Phone reveal button (masked number, tap to reveal → `Linking.openURL('tel:...')`)

8. **Safety Tips** (collapsible card)
   - "Meet in a public place", "Check the item before paying", "Never send money in advance"

9. **Similar Listings** (horizontal `FlashList`)
   - 6 listing cards, horizontal scroll
   - Same card component as Home/Search
   - "See more" → Search with same category pre-filtered

10. **Report** (link at very bottom)
    - "Report this listing" → opens `/report` modal

**Interactions:**
- Favorite: optimistic toggle with haptic feedback, POST/DELETE `/api/favorites`
- Share: `expo-sharing` with listing URL and title
- Message: navigates to `/(tabs)/messages` with `?listing={id}`, auto-creates conversation
- Report: opens bottom sheet with reason picker + optional description, POST `/api/reports`

---

### 2.4 Create Listing — `/(tabs)/create/index.tsx`

**API calls:**
- `GET /api/public/categories?depth=1` → categories
- `POST /api/listings` → create listing
- Media uploads: `POST /api/media` with `multipart/form-data`

**Multi-step form** (5 steps, progress indicator at top):

**Step 1: Category**
- Searchable grid of categories (same as web CategoryGrid)
- Parent categories as section headers, children as tappable cards
- Search bar at top to filter
- Category icon/emoji + name
- On select → highlight + auto-advance to step 2

**Step 2: Details**
- Title: `@expo/ui` `TextField`, required, max 100 chars
- Description: `@expo/ui` `TextField` multiline, required
- Price: `@expo/ui` `TextField` with numeric keyboard, "XAF" suffix
- Condition: `@expo/ui` `Picker` or segmented control (New / Like New / Good / Fair / Poor)
- Duration: `@expo/ui` `Picker` (30 days / 60 days / 90 days)
- Location: `@expo/ui` `TextField` + "Use my location" button
  - On press: `expo-location` → `requestForegroundPermissionsAsync()` → `getCurrentPositionAsync()`
  - Auto-fill location text + store lat/lng
  - Show "📍 Location detected" confirmation

**Step 3: Category Attributes** (dynamic, only if category has attributes)
- Rendered from `category.attributes[]`
- Types:
  - `text`: `TextField`
  - `number`: `TextField` with numeric keyboard
  - `select`: `Picker` with options from `attribute.options[]`
  - `boolean`: `Switch` (iOS toggle / Android checkbox)
  - `date`: `DatePicker`
- Required fields marked with asterisk
- Skip this step if no attributes

**Step 4: Photos**
- Grid of photo thumbnails (3 columns)
- "Add photo" button → `expo-image-picker` (camera or gallery)
- `allowsMultipleSelection: true`, `mediaTypes: ['images']`
- Drag-to-reorder with `react-native-reanimated` + `react-native-gesture-handler`
- Swipe-to-delete or × button on each photo
- Minimum 1 photo required
- Preview: show thumbnail with index number

**Step 5: Review & Publish**
- Summary card showing: category, title, price, condition, location, attributes, photo count
- "Edit" links next to each section → go back to that step
- "Publish" button (primary, full-width)
- On publish:
  1. Upload each image to `POST /api/media` → get media IDs
  2. `POST /api/listings` with all data + media IDs
  3. Show success animation (checkmark + confetti)
  4. Navigate to `/(tabs)/account/listings`

**Navigation:**
- "Back" button returns to previous step (not browser back)
- Step indicator shows progress (1–5)
- Swipe-back gesture disabled during form (prevent accidental loss)
- Draft auto-save to AsyncStorage (restore on next visit)

---

### 2.5 Messages — `/(tabs)/messages/index.tsx`

**API calls:**
- `GET /api/conversations?depth=2&sort=-updatedAt` → conversations with participants + listing
- `GET /api/public/messages/unread` → unread count (for tab badge)
- `GET /api/messages?where[conversation][equals]={id}&sort=createdAt&limit=50` → messages
- `POST /api/messages` → send message (also via WebSocket)
- `GET /api/blocked-users?limit=200` → blocked user IDs
- `DELETE /api/conversations/{id}` → delete conversation

**Layout:**

**Conversation List** (when no conversation selected, or on phone always visible):
- `FlashList` of conversations
- Each row:
  - Avatar of other participant
  - Name (bold if unread) + verified badge
  - Listing title (muted, truncated)
  - Last message preview (1 line, truncated)
  - Time ago (right-aligned)
  - Unread dot (blue) if unread messages
  - "Blocked" badge if user is blocked (red pill)
- Swipe-left on row → "Delete" action (with confirmation alert)
- Empty state: "No conversations yet" + "Browse listings" CTA
- Pull-to-refresh

**Conversation Detail** (push screen: `/messages/[conversationId].tsx`):

1. **Header**
   - Back arrow
   - Avatar + name of other participant
   - Online indicator (green dot) — from chat service presence
   - ⋮ menu (right): "View profile", "Block user", "Delete conversation"

2. **Messages** (inverted `FlashList`)
   - Bubbles: sender on right (blue), receiver on left (gray)
   - Timestamp below each bubble group
   - Date separators ("Today", "Yesterday", "Mar 12")
   - Read receipts: ✓ (sent), ✓✓ (read)
   - Typing indicator animation (3 bouncing dots)

3. **Input bar** (sticky bottom)
   - `@expo/ui` `TextField` multiline (max 4 lines, then scroll)
   - Send button (arrow icon, primary color, disabled when empty)
   - Photo button (opens `expo-image-picker`)
   - If blocked: show "You have blocked this user" banner instead of input

**Real-time:**
- Connect to chat service via `@bns/chat-client` SDK (Socket.IO)
- Events: `message:new`, `message:delivered`, `message:read`, `user:online`, `user:offline`, `typing`
- Reconnect on network change via `expo-network`
- Offline: queue messages in AsyncStorage, send on reconnect

---

### 2.6 Account — `/(tabs)/account/index.tsx`

**API calls:**
- `GET /api/users/me` → current user
- `POST /api/users/logout` → logout

**Layout (if logged in):**

1. **Profile header**
   - Large avatar (80×80) with edit overlay
   - Name + verified badge
   - Rating (stars + count)
   - "Edit profile" button → `/account/edit-profile`

2. **Quick stats** (horizontal row)
   - Active listings count
   - Favorites count
   - Reviews count

3. **Menu sections** (grouped list)

   **My Activity:**
   - 📦 My Listings → `/account/listings`
   - ❤️ Favorites → `/account/favorites`
   - 🔖 Saved Searches → `/account/searches`
   - 🚀 Boost History → `/account/boosts`

   **Settings:**
   - ⚙️ Settings → `/settings` (change password, email, delete account)
   - 🔔 Notifications → system notification settings

   **Support:**
   - ❓ Help & FAQ → `/help`
   - 🛡️ Safety Tips → `/safety`
   - 📩 Contact Us → `/contact`
   - 📄 Terms of Service → `/terms`
   - 🔒 Privacy Policy → `/privacy`

   **Danger zone:**
   - 🚪 Log out (red, with confirmation alert)

**Layout (if not logged in):**
- Illustration + "Sign in to access your account"
- "Log in" button (primary)
- "Create account" link

---

### 2.7 My Listings — `/account/listings.tsx`

**API calls:**
- `GET /api/listings?where[seller][equals]={userId}&limit=12&page={n}&sort=-createdAt&depth=1`

**Layout:**

1. **Stats bar** (horizontal scroll)
   - Colored cards: Total, Active (green), Pending (blue), Sold (gray), Expired (orange), Boosted (amber)
   - Each card: large number + label

2. **Listings list** (`FlashList`, 1 column)
   - Each row: thumbnail (60×60) + title + price + status pill + date
   - Status pills: Published (green), Pending (blue), Rejected (red), Sold (gray), Expired (orange)
   - Rejected listings: show rejection reason banner (red) + "Edit & Resubmit" link
   - Expired listings: "Renew" button (blue)
   - Swipe-left actions: Edit, Delete, Mark as Sold (for published)
   - Long-press → context menu: Edit, Boost, Mark as Sold, Delete

3. **FAB** (floating action button, bottom-right)
   - "+" icon → navigate to Create tab

4. **Empty state:** "No listings yet" + "Create your first listing" CTA

**Actions:**
- Mark as Sold: `PATCH /api/listings/{id}` with `{ status: "sold" }` (confirmation alert)
- Renew: `PATCH /api/listings/{id}` with `{ status: "pending", expiresAt: +30d }` (confirmation alert)
- Delete: `DELETE /api/listings/{id}` (confirmation alert)
- Boost: opens `/boost/[id]` modal

---

### 2.8 Favorites — `/account/favorites.tsx`

**API calls:**
- `GET /api/favorites?depth=1&limit=100` → favorited listings

**Layout:**
- `FlashList`, 2 columns, standard listing cards
- Swipe-left to unfavorite (or heart toggle)
- Empty state: "No favorites yet" + "Browse listings" CTA
- Pull-to-refresh

---

### 2.9 Saved Searches — `/account/searches.tsx`

**API calls:**
- `GET /api/saved-searches?sort=-createdAt&limit=50`
- `PATCH /api/saved-searches/{id}` → toggle alertEnabled
- `DELETE /api/saved-searches/{id}` → delete

**Layout:**
- List of saved searches
- Each row:
  - Name (bold)
  - Filter badges: query, category, price range, location
  - Alert toggle (bell icon on/off)
  - Date saved
- Swipe-left: Delete
- On tap → navigate to Search with pre-filled filters from `search.url`
- Empty state: "No saved searches" + "Go to search" CTA

---

### 2.10 Boost History — `/account/boosts.tsx`

**API calls:**
- `GET /api/boost-payments?sort=-createdAt&depth=1&limit=50`

**Layout:**
- Stats: Total boosts, Completed, Total spent (XAF)
- List of payments:
  - Listing title (linked)
  - Amount + duration label
  - Status pill: Pending (amber), Completed (green), Failed (red), Refunded (gray)
  - Date
- Empty state: "No boosts yet" + "Boost a listing to get more views"

---

### 2.11 Edit Profile — `/account/edit-profile.tsx`

**API calls:**
- `PATCH /api/users/{id}` → update profile
- `POST /api/media` → upload avatar

**Form fields:**
- Avatar: tap to change (camera or gallery via `expo-image-picker`)
- Name: `TextField`
- Bio: `TextField` multiline
- Phone: `TextField` with phone keyboard
- Location: `TextField` + "Use my location" button

**Verification banner:**
- If not verified: blue info banner "Verify your account to build trust with buyers"
- If verified: green badge "Verified Seller ✓"

---

### 2.12 Public Profile — `/profile/[userId].tsx`

**API calls:**
- `GET /api/users/{userId}`
- `GET /api/listings?where[seller][equals]={userId}&where[status][equals]=published&limit=20`
- `GET /api/reviews?where[reviewedUser][equals]={userId}&limit=20`
- `GET /api/blocked-users` → check if blocked

**Layout:**
1. **Header**: avatar, name, verified badge, location, "Member since", rating (stars + count)
2. **Action buttons** (if not own profile):
   - "Message" (primary)
   - "Block" / "Unblock" (secondary, with confirmation)
   - "Report" (tertiary)
3. **Tabs**: Listings | Reviews
4. **Listings tab**: `FlashList` 2 columns of user's listings
5. **Reviews tab**: list of reviews (reviewer avatar, name, stars, comment, date)
   - "Leave a review" form at bottom (if logged in & not own profile): star picker + comment textarea

---

### 2.13 Authentication — `/auth/login.tsx`, `/auth/register.tsx`

**Login:**
- Email + Password fields (`@expo/ui` `TextField`)
- "Forgot password?" link → `/auth/forgot-password`
- "Sign in" button (primary)
- "Don't have an account? Sign up" link
- API: `POST /api/users/login`
- Store token in `SecureStore` (not AsyncStorage)

**Register:**
- Name + Email + Password + Confirm Password fields
- Validates: password ≥ 8 chars, passwords match
- "Create account" button
- "Already have an account? Sign in" link
- API: `POST /api/users` then auto-login

**Forgot Password:**
- Email field + "Send reset link" button
- API: `POST /api/users/forgot-password`
- Success screen: "Check your email"

**Auth guard:**
- Protected screens (Create, Messages, Account, Favorites) check auth on mount
- If not logged in → present Login modal
- After login → return to intended screen
- Token refresh: `POST /api/users/refresh-token` on 401

---

### 2.14 Settings — `/settings.tsx`

**API calls:**
- `POST /api/users/login` → verify current password
- `PATCH /api/users/{id}` → update email/password
- `DELETE /api/users/{id}` → delete account
- `POST /api/users/logout` → logout

**Sections:**
- **Change Password**: current password, new password, confirm
- **Change Email**: new email, password to confirm
- **Delete Account**: double confirmation alert, explain consequences
- **App Info**: version, build number

---

### 2.15 Boost Modal — `/boost/[listingId].tsx`

**API calls:**
- `POST /api/public/boost` → create payment, get NotchPay checkout URL

**Layout (bottom sheet):**
- Sparkles icon header
- "Boost your listing" title
- 3 pricing cards (radio select):
  - 1 week — 500 XAF
  - 2 weeks — 900 XAF (with "Popular" badge)
  - 1 month — 1,500 XAF
- "Pay {amount} XAF" button (amber, primary)
- On success → open NotchPay URL in `expo-web-browser` (`WebBrowser.openBrowserAsync`)
- Cancel link

---

### 2.16 Report Modal — `/report.tsx`

**API calls:**
- `POST /api/reports`

**Layout (bottom sheet):**
- Receives `targetType` (listing/user/message) and `targetId` as params
- Reason picker: Spam, Inappropriate, Fraud, Prohibited, Harassment, Other
- Optional description textarea
- "Submit Report" button
- Toast confirmation on success

---

### 2.17 Contact — `/contact.tsx`

**API calls:**
- `POST /api/public/contact`

**Layout:**
- Name, Email, Subject (picker), Message (textarea)
- "Send" button
- Contact info: email, phone, address, hours
- Success state: "Message sent! We'll get back to you shortly."

---

### 2.18 Information Pages — `/help.tsx`, `/safety.tsx`, `/terms.tsx`, `/privacy.tsx`

Static content screens. Use `ScrollView` with styled text sections. Content matches the web versions. Can use `expo-web-browser` to open full versions on web if preferred.

---

## 3. Shared Components

### 3.1 ListingCard

Used everywhere (Home, Search, Favorites, Profile, Similar).

```
┌──────────────────┐
│   [Image]        │ ← expo-image, aspect 4:3, blurhash placeholder
│   ♥ (top-right)  │ ← FavoriteButton (heart icon, animated on toggle)
│   Featured       │ ← Badge (if boosted, amber, top-left)
│   3 photos       │ ← Count badge (bottom-right)
├──────────────────┤
│ 85,000 XAF       │ ← Price (bold, large)
│ iPhone 13 Pro    │ ← Title (2 lines max, ellipsis)
│ 📍 Douala · 2h   │ ← Location + time ago (muted)
└──────────────────┘
```

Props: `listing`, `isFavorite`, `onToggleFavorite`, `onPress`

### 3.2 CategoryIcon

Renders category image (if exists) or emoji fallback in a circle.

### 3.3 PhoneReveal

Masked phone number with "Show number" button. On reveal → click-to-call via `Linking.openURL('tel:...')`.

### 3.4 ReviewStars

Interactive star rating component (1–5). Tap or swipe to select.

### 3.5 StatusPill

Colored pill for listing/payment status. Maps status string to color.

---

## 4. Data Layer

### 4.1 API Client

Create a shared API client in `packages/mobile/src/lib/api.ts`:
- Base URL from env: `EXPO_PUBLIC_API_URL`
- Auth token from `SecureStore`
- Auto-attach `Authorization: JWT {token}` header
- Auto-refresh on 401
- Request/response interceptors for error handling

### 4.2 Auth Context

Global context providing:
- `user`, `token`, `isLoading`
- `login(email, password)`, `register(email, password, name)`, `logout()`
- `refreshUser()`, `refreshToken()`
- Token stored in `expo-secure-store`

### 4.3 Data Fetching

Use **React Query** (`@tanstack/react-query`) for all API calls:
- Auto-caching, deduplication, background refetch
- `useFocusEffect` to refetch on screen focus
- Optimistic updates for favorites, block/unblock
- Infinite queries for paginated lists (search, listings, messages)

### 4.4 Real-time (Chat)

Use `@bns/chat-client` SDK:
- Connect on app launch (if authenticated)
- Disconnect on logout
- Socket events → update React Query cache directly
- Reconnect on network change (`expo-network`)

### 4.5 Push Notifications

Use `expo-notifications`:
- Register on first login
- Send device push token to backend (Novu subscriber)
- Handle notification tap → deep link to relevant screen
- Notification categories: new-message, listing-approved, listing-rejected, listing-expired, boost-expired, new-review, search-alert

---

## 5. Offline & Performance

- **Image caching**: `expo-image` handles this natively
- **API caching**: React Query with `staleTime: 5 minutes` for listings, `staleTime: 30 seconds` for messages
- **Offline queue**: AsyncStorage for pending actions (favorites, messages) — sync on reconnect
- **List performance**: `FlashList` with `estimatedItemSize`, `getItemType` for heterogeneous lists
- **Memory**: `useFocusEffect` to pause/resume data fetching; release heavy resources on blur
- **Bundle**: lazy-load screens with `React.lazy` + `Suspense`

---

## 6. Novu Notification Workflows (supported by API)

| Workflow ID | Trigger | Payload |
|-------------|---------|---------|
| `listing-status` | Status change (generic) | `listingTitle`, `newStatus` |
| `listing-approved` | Listing published by admin | `listingTitle` |
| `listing-rejected` | Listing rejected by admin | `listingTitle`, `reason` |
| `listing-expired` | Listing expired (30/60/90d) | `listingTitle` |
| `boost-expired` | Boost period ended | `listingTitle` |
| `new-review` | New review received | `reviewerName`, `rating`, `comment` |
| `new-message` | New chat message | `senderName`, `content`, `conversationId` |
| `search-alert` | New listing matches saved search | `searchName`, `matchCount`, `searchUrl` |
| `user-verified` | Account verified by admin | `name` |
| `contact-form` | Contact form submitted | `name`, `email`, `subject`, `message` |

---

## 7. Environment Variables

```
EXPO_PUBLIC_API_URL=https://api.buynsellem.com
EXPO_PUBLIC_CHAT_URL=https://chat.buynsellem.com
EXPO_PUBLIC_NOVU_APP_ID=your-novu-app-id
```

---

## 8. File Structure

```
packages/mobile/
├── app/
│   ├── _layout.tsx                 # Root layout (providers, auth guard)
│   ├── (tabs)/
│   │   ├── _layout.tsx             # Tab navigator
│   │   ├── home/
│   │   │   └── index.tsx           # Home screen
│   │   ├── search/
│   │   │   └── index.tsx           # Search screen
│   │   ├── create/
│   │   │   └── index.tsx           # Create listing (multi-step)
│   │   ├── messages/
│   │   │   ├── index.tsx           # Conversation list
│   │   │   └── [conversationId].tsx # Chat detail
│   │   └── account/
│   │       ├── index.tsx           # Account hub
│   │       ├── listings.tsx        # My Listings
│   │       ├── favorites.tsx       # Favorites
│   │       ├── searches.tsx        # Saved Searches
│   │       ├── boosts.tsx          # Boost History
│   │       └── edit-profile.tsx    # Edit Profile
│   ├── listing/
│   │   ├── [id].tsx                # Listing detail
│   │   └── [id]/edit.tsx           # Edit listing
│   ├── profile/
│   │   └── [userId].tsx            # Public profile
│   ├── auth/
│   │   ├── login.tsx               # Login
│   │   ├── register.tsx            # Register
│   │   └── forgot-password.tsx     # Forgot password
│   ├── settings.tsx                # Settings
│   ├── boost/[listingId].tsx       # Boost modal
│   ├── report.tsx                  # Report modal
│   ├── filters.tsx                 # Filter modal
│   ├── contact.tsx                 # Contact form
│   ├── help.tsx                    # Help/FAQ
│   ├── safety.tsx                  # Safety tips
│   ├── terms.tsx                   # Terms
│   └── privacy.tsx                 # Privacy
├── src/
│   ├── components/
│   │   ├── ListingCard.tsx
│   │   ├── CategoryIcon.tsx
│   │   ├── PhoneReveal.tsx
│   │   ├── ReviewStars.tsx
│   │   ├── StatusPill.tsx
│   │   ├── FavoriteButton.tsx
│   │   ├── SearchBar.tsx
│   │   ├── FilterChips.tsx
│   │   └── EmptyState.tsx
│   ├── lib/
│   │   ├── api.ts                  # API client
│   │   ├── auth.tsx                # Auth context + provider
│   │   ├── chat.ts                 # Chat service client
│   │   └── notifications.ts       # Push notification setup
│   ├── hooks/
│   │   ├── useListings.ts          # React Query hooks for listings
│   │   ├── useFavorites.ts         # Favorites hooks
│   │   ├── useMessages.ts          # Messages hooks
│   │   └── useSearch.ts            # Search hooks
│   └── theme/
│       └── index.ts                # Colors, spacing, typography
├── app.json
├── package.json
└── tsconfig.json
```
