import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import { shopTheme } from "../../../api/src/contracts/shopTheme";
import {
	accountSections,
	activeTab,
	aimsAtPane,
	gatedHref,
	helpLinks,
	loginHref,
	type MegaFocus,
	megaMenuKey,
	megaMenuReducer,
	navRubrics,
	opensMenu,
	searchHref,
	sellHref,
	shopHeaderCss,
	shopsDirectoryHref,
	showShortcuts,
	showTabBar,
	toNavCategories,
} from "./nav";
import { parseDirectoryParams } from "./shop-directory";

const rubrics = (focus: number): MegaFocus => ({
	pane: "rubrics",
	rubric: focus,
	child: 0,
});

describe("category tree", () => {
	test("top-level rubrics keep API order and carry their direct children", () => {
		const tree = navRubrics(
			toNavCategories([
				{ id: "v", name: "Véhicules" },
				{ id: "e", name: "Électronique", parent: null },
				{ id: "p", name: "Téléphones", parent: { id: "e" } },
				{ id: "o", name: "Ordinateurs", parent: "e" },
				{ id: "x", name: "Orphan", parent: "missing" },
			]),
		);
		expect(tree.map((r) => r.id)).toEqual(["v", "e", "x"]);
		expect(tree[1].children.map((c) => c.name)).toEqual([
			"Téléphones",
			"Ordinateurs",
		]);
	});
});

describe("logged-out gating", () => {
	test("an action needing an account goes through login and back", () => {
		expect(loginHref("/create")).toBe("/auth/login?redirect=%2Fcreate");
		expect(gatedHref(false, "/favorites")).toBe(
			"/auth/login?redirect=%2Ffavorites",
		);
		expect(gatedHref(true, "/favorites")).toBe("/favorites");
	});

	test("Vendre sur BuyNSellem leads to the shop space, shop creation or a listing", () => {
		const seller = { href: "/seller" as const };
		expect(
			sellHref({ signedIn: true, shopEntry: seller, shopsEnabled: true }),
		).toBe("/seller");
		expect(
			sellHref({ signedIn: true, shopEntry: null, shopsEnabled: true }),
		).toBe("/shop/new");
		expect(
			sellHref({ signedIn: true, shopEntry: null, shopsEnabled: false }),
		).toBe("/create");
		expect(
			sellHref({ signedIn: false, shopEntry: null, shopsEnabled: true }),
		).toBe(loginHref("/shop/new"));
	});
});

describe("tab bar visibility", () => {
	test("hidden where a page has its own shell", () => {
		for (const path of [
			"/checkout",
			"/checkout/abc/pay",
			"/seller",
			"/seller/orders/1",
			"/moderation/disputes",
		]) {
			expect(showTabBar(path)).toBe(false);
		}
	});

	test("shown on browsing pages, a shop included; prefixes match whole segments", () => {
		for (const path of [
			"/",
			"/search",
			"/s/akwa-tech",
			"/messages",
			"/sellers",
			"/cart",
		]) {
			expect(showTabBar(path)).toBe(true);
		}
	});

	test("the active tab follows the route", () => {
		expect(activeTab("/")).toBe("home");
		expect(activeTab("/create")).toBe("publish");
		expect(activeTab("/messages")).toBe("messages");
		expect(activeTab("/purchases/1")).toBe("account");
		expect(activeTab("/search")).toBeNull();
	});
});

describe("shortcuts strip", () => {
	test("home and search only", () => {
		expect(showShortcuts("/")).toBe(true);
		expect(showShortcuts("/search")).toBe(true);
		for (const path of [
			"/listing/1",
			"/s/shop",
			"/search/x",
			"/favorites",
			null,
		]) {
			expect(showShortcuts(path)).toBe(false);
		}
	});
});

describe("search target", () => {
	test("everywhere by default, with the browsing city", () => {
		expect(searchHref({ q: " phone ", city: "Douala" })).toBe(
			"/search?q=phone&location=Douala",
		);
		expect(searchHref({ q: "" })).toBe("/search");
	});

	test("inside a shop only when that scope is chosen", () => {
		expect(
			searchHref({
				q: "case",
				city: "Douala",
				scope: "shop",
				shopHandle: "akwa",
			}),
		).toBe("/s/akwa?q=case");
		expect(
			searchHref({ q: "case", scope: "everywhere", shopHandle: "akwa" }),
		).toBe("/search?q=case");
	});
});

describe("account menu", () => {
	test("groups Achats then Ventes, then profile and help", () => {
		const sections = accountSections({
			ordersEnabled: true,
			shopEntry: { href: "/seller", shopName: "Akwa Tech" },
		});
		expect(sections.map((s) => s.heading)).toEqual([
			"purchasesGroup",
			"salesGroup",
			null,
		]);
		expect(sections[0].links.map((l) => l.href)).toEqual([
			"/purchases",
			"/favorites",
		]);
		expect(sections[1].links).toEqual([
			{ key: "myListings", href: "/profile/me/listings" },
			{ key: "shopSpace", href: "/seller", detail: "Akwa Tech" },
		]);
	});

	test("no shop space without a shop, no orders while ordering is off", () => {
		const sections = accountSections({ ordersEnabled: false, shopEntry: null });
		expect(sections[0].links.map((l) => l.key)).toEqual([
			"favoritesAndSearches",
		]);
		expect(sections[1].links.map((l) => l.key)).toEqual(["myListings"]);
	});

	test("help ends on WhatsApp when a support number exists, else the contact page", () => {
		expect(helpLinks().at(-1)).toEqual({ key: "contact", href: "/contact" });
		expect(helpLinks("+237 6 99 00 00 00").at(-1)?.href).toBe(
			"https://wa.me/237699000000",
		);
		expect(helpLinks()[0]).toEqual({ key: "trackOrder", href: "/purchases" });
	});

	test("every link label exists in both languages", () => {
		const keys = new Set([
			...helpLinks().map((l) => l.key),
			...helpLinks("1").map((l) => l.key),
			...accountSections({
				ordersEnabled: true,
				shopEntry: { href: "/seller" },
			}).flatMap((s) => [s.heading, ...s.links.map((l) => l.key)]),
			"openShop",
		]);
		for (const key of keys) {
			if (!key) continue;
			expect((en.Nav as Record<string, string>)[key]).toBeString();
			expect((fr.Nav as Record<string, string>)[key]).toBeString();
		}
	});
});

describe("categories menu: open and close", () => {
	const closed = { open: false, active: 0 };
	test("a click toggles", () => {
		const opened = megaMenuReducer(closed, { type: "toggle" });
		expect(opened.open).toBe(true);
		expect(megaMenuReducer(opened, { type: "toggle" }).open).toBe(false);
	});

	test("Escape, an outside click or leaving close it; the rubric is kept", () => {
		const opened = megaMenuReducer(megaMenuReducer(closed, { type: "open" }), {
			type: "activate",
			index: 3,
		});
		const shut = megaMenuReducer(opened, { type: "close" });
		expect(shut).toEqual({ open: false, active: 3 });
		expect(megaMenuReducer(shut, { type: "close" })).toBe(shut);
	});

	test("the closed trigger opens on ArrowDown, Enter and Space", () => {
		expect(["ArrowDown", "Enter", " "].every(opensMenu)).toBe(true);
		expect(opensMenu("Tab")).toBe(false);
	});
});

describe("categories menu: keyboard", () => {
	const sizes = { rubrics: 4, children: 3 };

	test("arrows walk the rubrics and wrap", () => {
		expect(megaMenuKey(rubrics(0), "ArrowDown", sizes)).toEqual({
			kind: "focus",
			focus: rubrics(1),
		});
		expect(megaMenuKey(rubrics(0), "ArrowUp", sizes)).toEqual({
			kind: "focus",
			focus: rubrics(3),
		});
		expect(megaMenuKey(rubrics(2), "Home", sizes)).toEqual({
			kind: "focus",
			focus: rubrics(0),
		});
		expect(megaMenuKey(rubrics(0), "End", sizes)).toEqual({
			kind: "focus",
			focus: rubrics(3),
		});
	});

	test("ArrowRight enters the sub-categories, ArrowLeft comes back", () => {
		const inPane = megaMenuKey(rubrics(2), "ArrowRight", sizes);
		expect(inPane).toEqual({
			kind: "focus",
			focus: { pane: "children", rubric: 2, child: 0 },
		});
		const child: MegaFocus = { pane: "children", rubric: 2, child: 2 };
		expect(megaMenuKey(child, "ArrowDown", sizes)).toEqual({
			kind: "focus",
			focus: { ...child, child: 0 },
		});
		expect(megaMenuKey(child, "ArrowLeft", sizes)).toEqual({
			kind: "focus",
			focus: rubrics(2),
		});
	});

	test("a rubric without sub-categories keeps ArrowRight for the browser", () => {
		expect(
			megaMenuKey(rubrics(1), "ArrowRight", { rubrics: 4, children: 0 }),
		).toBeNull();
	});

	test("Escape closes from either pane; Tab and Enter stay native", () => {
		expect(megaMenuKey(rubrics(1), "Escape", sizes)).toEqual({ kind: "close" });
		expect(
			megaMenuKey({ pane: "children", rubric: 1, child: 1 }, "Escape", sizes),
		).toEqual({ kind: "close" });
		expect(megaMenuKey(rubrics(1), "Tab", sizes)).toBeNull();
		expect(megaMenuKey(rubrics(1), "Enter", sizes)).toBeNull();
	});
});

describe("categories menu: diagonal tolerance", () => {
	const pane = { left: 300, top: 100, bottom: 500 };

	test("heading right into the pane holds the current rubric", () => {
		expect(aimsAtPane({ x: 200, y: 150 }, { x: 220, y: 170 }, pane)).toBe(true);
	});

	test("moving straight down, or away, switches at once", () => {
		expect(aimsAtPane({ x: 200, y: 150 }, { x: 200, y: 190 }, pane)).toBe(
			false,
		);
		expect(aimsAtPane({ x: 200, y: 150 }, { x: 180, y: 160 }, pane)).toBe(
			false,
		);
		expect(aimsAtPane({ x: 200, y: 150 }, { x: 210, y: 40 }, pane)).toBe(false);
	});
});

describe("shop header colours", () => {
	test("light by default, dark under prefers-color-scheme", () => {
		const theme = shopTheme("#0E7490");
		const css = shopHeaderCss(".head", theme);
		expect(css.startsWith(`.head{--shop-head-bg:${theme.light.headerBg}`)).toBe(
			true,
		);
		expect(css).toContain(
			`@media (prefers-color-scheme: dark){.head{--shop-head-bg:${theme.dark.headerBg}`,
		);
		expect(css).toContain(`--shop-head-accent:${theme.light.accent}`);
	});

	test("anything but a hex colour is refused, so nothing can escape the style block", () => {
		const theme = shopTheme("#0E7490");
		const evil = {
			...theme,
			light: { ...theme.light, headerBg: "red}body{display:none" },
		};
		expect(shopHeaderCss(".head", evil)).toBe("");
	});
});

describe("shopsDirectoryHref", () => {
	test("links /shops with the filters the directory page reads", () => {
		expect(shopsDirectoryHref({})).toBe("/shops");
		const href = shopsDirectoryHref({
			category: "veh",
			city: "Douala",
			verified: true,
		});
		expect(href.startsWith("/shops?")).toBe(true);
		const params = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
		expect(parseDirectoryParams(params)).toMatchObject({
			category: "veh",
			city: "Douala",
			level: 2,
		});
	});
});
