/** Pure rules behind the site navigation: who sees what, where links lead. */

export interface NavCategory {
	id: string;
	name: string;
	parent: string | null;
	icon?: string | null;
	imageUrl?: string | null;
	/** Seller vocabulary ("bagnole", brands): matched by search suggestions, never shown. */
	searchAliases?: string | null;
}

export interface NavRubric {
	id: string;
	name: string;
	icon?: string | null;
	imageUrl?: string | null;
	children: NavCategory[];
}

type RawCategory = {
	id: string;
	name: string;
	parent?: string | { id: string } | null;
	icon?: string | null;
	image?: string | { url?: string | null } | null;
	searchAliases?: string | null;
};

/** Strips the API's categories to the fields the menus draw. */
export function toNavCategories(raw: RawCategory[]): NavCategory[] {
	return raw.map((category) => ({
		id: category.id,
		name: category.name,
		parent:
			typeof category.parent === "string"
				? category.parent
				: (category.parent?.id ?? null),
		icon: category.icon ?? null,
		imageUrl:
			category.image && typeof category.image === "object"
				? (category.image.url ?? null)
				: null,
		searchAliases: category.searchAliases ?? null,
	}));
}

/** Top-level categories in API order, each with its direct children. */
export function navRubrics(categories: NavCategory[]): NavRubric[] {
	const ids = new Set(categories.map((c) => c.id));
	return categories
		.filter((c) => !c.parent || !ids.has(c.parent))
		.map((c) => ({
			id: c.id,
			name: c.name,
			icon: c.icon ?? null,
			imageUrl: c.imageUrl ?? null,
			children: categories.filter((child) => child.parent === c.id),
		}));
}

/**
 * The member's own conversation in the personal inbox. The seller tree opens
 * it in a new tab so the shop workspace stays where it was.
 */
export function personalConversationHref(conversationId: string): string {
	return `/messages?conversation=${encodeURIComponent(conversationId)}`;
}

export function categoryHref(id: string): string {
	return `/search?category=${encodeURIComponent(id)}`;
}

export const SHOPS_DIRECTORY = "/shops";

export function shopsDirectoryHref(params: {
	category?: string;
	city?: string | null;
	verified?: boolean;
}): string {
	const query = new URLSearchParams();
	if (params.category) query.set("category", params.category);
	if (params.city) query.set("city", params.city);
	if (params.verified) query.set("level", "2");
	const qs = query.toString();
	return qs ? `${SHOPS_DIRECTORY}?${qs}` : SHOPS_DIRECTORY;
}

/** Sends a visitor through login and back to what they asked for. */
export function loginHref(target: string): string {
	return `/auth/login?redirect=${encodeURIComponent(target)}`;
}

export function registerHref(target?: string): string {
	return target && target !== "/"
		? `/auth/register?redirect=${encodeURIComponent(target)}`
		: "/auth/register";
}

/** An action that needs an account: kept visible, routed through login when signed out. */
export function gatedHref(signedIn: boolean, target: string): string {
	return signedIn ? target : loginHref(target);
}

export type SearchScope = "everywhere" | "shop";

export function searchHref(input: {
	q: string;
	city?: string | null;
	scope?: SearchScope;
	shopHandle?: string;
}): string {
	const q = input.q.trim();
	if (input.scope === "shop" && input.shopHandle) {
		const base = `/s/${encodeURIComponent(input.shopHandle)}`;
		return q ? `${base}?q=${encodeURIComponent(q)}` : base;
	}
	const params = new URLSearchParams();
	if (q) params.set("q", q);
	if (input.city) params.set("location", input.city);
	const qs = params.toString();
	return qs ? `/search?${qs}` : "/search";
}

function under(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Routes with a shell of their own, or a flow the tab bar would cut into. */
const TAB_BAR_HIDDEN = ["/checkout", "/seller", "/moderation", "/r"];

export function showTabBar(pathname: string | null): boolean {
	if (!pathname) return true;
	return !TAB_BAR_HIDDEN.some((prefix) => under(pathname, prefix));
}

/** The category shortcuts strip: home and search only, never a shop or a listing. */
export function showShortcuts(pathname: string | null): boolean {
	return pathname === "/" || pathname === "/search";
}

export type NavTab = "home" | "categories" | "publish" | "messages" | "account";

export function activeTab(pathname: string | null): NavTab | null {
	if (!pathname) return null;
	if (pathname === "/") return "home";
	if (under(pathname, "/create")) return "publish";
	if (under(pathname, "/messages")) return "messages";
	if (
		["/profile/me", "/settings", "/purchases", "/favorites", "/account"].some(
			(prefix) => under(pathname, prefix),
		)
	)
		return "account";
	return null;
}

export interface NavLink {
	/** Message key in the `Nav` namespace. */
	key: string;
	href: string;
	/** Extra label text, e.g. the shop name. */
	detail?: string;
}

export interface AccountSection {
	/** Message key of the group heading, or null for an ungrouped block. */
	heading: string | null;
	links: NavLink[];
}

export function accountSections(input: {
	ordersEnabled: boolean;
	shopEntry: { href: "/seller" | "/shop/new"; shopName?: string } | null;
}): AccountSection[] {
	const purchases: NavLink[] = [
		...(input.ordersEnabled ? [{ key: "myOrders", href: "/purchases" }] : []),
		{ key: "favoritesAndSearches", href: "/favorites" },
	];
	const sales: NavLink[] = [
		{ key: "myListings", href: "/profile/me/listings" },
	];
	if (input.shopEntry?.href === "/seller") {
		sales.push({
			key: "shopSpace",
			href: "/seller",
			...(input.shopEntry.shopName ? { detail: input.shopEntry.shopName } : {}),
		});
	} else if (input.shopEntry) {
		sales.push({ key: "openShop", href: "/shop/new" });
	}
	return [
		{ heading: "purchasesGroup", links: purchases },
		{ heading: "salesGroup", links: sales },
		{
			heading: null,
			links: [
				{ key: "profileAndSettings", href: "/profile/me" },
				{ key: "help", href: "/help" },
			],
		},
	];
}

export function helpLinks(supportWhatsApp?: string | null): NavLink[] {
	const digits = supportWhatsApp?.replace(/\D/g, "") ?? "";
	return [
		{ key: "trackOrder", href: "/purchases" },
		{ key: "cashOnDelivery", href: "/help" },
		{ key: "buyerProtection", href: "/safety" },
		{ key: "returns", href: "/account/returns" },
		digits
			? { key: "whatsappSupport", href: `https://wa.me/${digits}` }
			: { key: "contact", href: "/contact" },
	];
}

/** "Vendre sur BuyNSellem": the shop space, then shop creation, then a plain listing. */
export function sellHref(input: {
	signedIn: boolean;
	shopEntry: { href: "/seller" | "/shop/new" } | null;
	shopsEnabled: boolean;
}): string {
	const target =
		input.shopEntry?.href ?? (input.shopsEnabled ? "/shop/new" : "/create");
	return gatedHref(input.signedIn, target);
}

/* ── Categories menu: keyboard ─────────────────────────────────────────── */

export interface MegaFocus {
	pane: "rubrics" | "children";
	rubric: number;
	child: number;
}

export type MegaKeyResult =
	| { kind: "focus"; focus: MegaFocus }
	| { kind: "close" }
	| null;

const wrap = (i: number, n: number) => (n === 0 ? 0 : (i + n) % n);

/**
 * Arrow keys walk the rubrics (left pane) and the links of the active rubric
 * (right pane); Escape closes. `null` leaves the key to the browser (Tab,
 * Enter on a link).
 */
export function megaMenuKey(
	focus: MegaFocus,
	key: string,
	sizes: { rubrics: number; children: number },
): MegaKeyResult {
	if (key === "Escape") return { kind: "close" };
	if (focus.pane === "rubrics") {
		const n = sizes.rubrics;
		const at = (rubric: number): MegaKeyResult => ({
			kind: "focus",
			focus: { pane: "rubrics", rubric, child: 0 },
		});
		switch (key) {
			case "ArrowDown":
				return at(wrap(focus.rubric + 1, n));
			case "ArrowUp":
				return at(wrap(focus.rubric - 1, n));
			case "Home":
				return at(0);
			case "End":
				return at(Math.max(0, n - 1));
			case "ArrowRight":
				return sizes.children > 0
					? { kind: "focus", focus: { ...focus, pane: "children", child: 0 } }
					: null;
			default:
				return null;
		}
	}
	const n = sizes.children;
	const at = (child: number): MegaKeyResult => ({
		kind: "focus",
		focus: { ...focus, pane: "children", child },
	});
	switch (key) {
		case "ArrowDown":
			return at(wrap(focus.child + 1, n));
		case "ArrowUp":
			return at(wrap(focus.child - 1, n));
		case "Home":
			return at(0);
		case "End":
			return at(Math.max(0, n - 1));
		case "ArrowLeft":
			return { kind: "focus", focus: { ...focus, pane: "rubrics", child: 0 } };
		default:
			return null;
	}
}

export interface MegaState {
	open: boolean;
	/** The rubric whose sub-categories fill the right pane. */
	active: number;
}

export type MegaEvent =
	| { type: "toggle" }
	| { type: "open" }
	| { type: "close" }
	| { type: "activate"; index: number };

/** Click toggles; hover, keyboard and the pane's own links open, close or switch rubric. */
export function megaMenuReducer(state: MegaState, event: MegaEvent): MegaState {
	switch (event.type) {
		case "toggle":
			return { ...state, open: !state.open };
		case "open":
			return state.open ? state : { ...state, open: true };
		case "close":
			return state.open ? { ...state, open: false } : state;
		case "activate":
			return state.active === event.index
				? state
				: { ...state, active: event.index };
	}
}

/** Keys on the closed trigger that open the menu on its first rubric. */
export function opensMenu(key: string): boolean {
	return key === "ArrowDown" || key === "Enter" || key === " ";
}

/* ── Categories menu: pointer ──────────────────────────────────────────── */

/** Hover opens only after the pointer rests this long (NN/g: ~0.5 s). */
export const HOVER_OPEN_DELAY = 500;
/** Leaving the trigger and the panel closes after this grace. */
export const HOVER_CLOSE_DELAY = 300;
/** A rubric switch is held this long while the pointer heads for the pane. */
export const AIM_DELAY = 300;

export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	left: number;
	top: number;
	bottom: number;
}

function sign(p1: Point, p2: Point, p3: Point): number {
	return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

/**
 * Diagonal tolerance: true when the pointer, moving from `from` to `to`, stays
 * inside the triangle between `from` and the pane's left edge — it is heading
 * for the sub-categories, so crossing another rubric must not switch the pane.
 */
export function aimsAtPane(from: Point, to: Point, pane: Rect): boolean {
	if (to.x <= from.x) return false;
	const a = from;
	const b = { x: pane.left, y: pane.top };
	const c = { x: pane.left, y: pane.bottom };
	const d1 = sign(to, a, b);
	const d2 = sign(to, b, c);
	const d3 = sign(to, c, a);
	const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
	const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
	return !(hasNeg && hasPos);
}

/* ── Shop mode ─────────────────────────────────────────────────────────── */

const HEX = /^#[0-9a-f]{6}$/i;

interface Tones {
	accent: string;
	onAccent: string;
	accentSoft: string;
	headerBg: string;
	headerFg: string;
	headerMuted: string;
}

function vars(tones: Tones): string | null {
	const entries: Array<[string, string]> = [
		["--shop-head-bg", tones.headerBg],
		["--shop-head-fg", tones.headerFg],
		["--shop-head-muted", tones.headerMuted],
		["--shop-head-accent", tones.accent],
		["--shop-head-on-accent", tones.onAccent],
		["--shop-head-accent-soft", tones.accentSoft],
	];
	// The values land in a <style> element: anything but a hex colour is refused.
	if (entries.some(([, value]) => !HEX.test(value))) return null;
	return entries.map(([name, value]) => `${name}:${value}`).join(";");
}

/** The shop header's colour variables, light by default and dark with the page's theme. */
export function shopHeaderCss(
	selector: string,
	theme: { light: Tones; dark: Tones },
): string {
	const light = vars(theme.light);
	const dark = vars(theme.dark);
	if (!light) return "";
	const base = `${selector}{${light}}`;
	return dark ? `${base}.dark ${selector}{${dark}}` : base;
}
