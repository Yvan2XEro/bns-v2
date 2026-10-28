import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import { AppConfigProvider } from "~/hooks/use-app-config";
import { AuthContext, type AuthContextType } from "~/hooks/use-auth";
import { EMPTY_APP_CONFIG } from "~/lib/app-config";
import { type NavCategory, navRubrics } from "~/lib/nav";
import type { User } from "~/types";
import { shopTheme } from "../../../../api/src/contracts/shopTheme";
import { CategoriesMenu } from "./categories-menu";
import { Header, type HeaderShop } from "./header";
import { AccountSheetBody, CategoriesSheetBody } from "./mobile-nav";

const CATEGORIES: NavCategory[] = [
	{ id: "veh", name: "Vehicles", parent: null },
	{ id: "ele", name: "Electronics", parent: null },
	{ id: "pho", name: "Phones", parent: "ele" },
	{ id: "com", name: "Computers", parent: "ele" },
	...["a", "b", "c", "d", "e", "f"].map((x) => ({
		id: `pho-${x}`,
		name: `Phone ${x.toUpperCase()}`,
		parent: "pho",
	})),
];

const noop = async () => {};
const router = {
	back() {},
	forward() {},
	refresh() {},
	push() {},
	replace() {},
	prefetch() {},
	hmrRefresh() {},
};

function auth(user: Partial<User> | null): AuthContextType {
	return {
		user: user as User | null,
		token: null,
		isLoading: false,
		login: noop,
		loginWithProvider: () => {},
		loginWithSso: () => {},
		register: noop,
		logout: noop,
		refreshUser: noop,
		refreshToken: noop,
	};
}

function render(
	node: ReactNode,
	{
		pathname = "/",
		user = null,
		shopsEnabled = true,
	}: {
		pathname?: string;
		user?: Partial<User> | null;
		shopsEnabled?: boolean;
	} = {},
): string {
	return renderToStaticMarkup(
		<AppRouterContext.Provider value={router as never}>
			<PathnameContext.Provider value={pathname}>
				<QueryClientProvider client={new QueryClient()}>
					<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
						<AppConfigProvider
							initialConfig={{
								...EMPTY_APP_CONFIG,
								shopsEnabled,
								ordersEnabled: true,
							}}
						>
							<AuthContext.Provider value={auth(user)}>
								{node}
							</AuthContext.Provider>
						</AppConfigProvider>
					</NextIntlClientProvider>
				</QueryClientProvider>
			</PathnameContext.Provider>
		</AppRouterContext.Provider>,
	);
}

const SIGNED_IN = { id: "u1", name: "Aïcha", email: "aicha@example.cm" };

describe("Header, signed out", () => {
	const html = render(<Header categories={CATEGORIES} />, {
		pathname: "/listing/42",
	});

	test("Favourites and Post an ad stay visible and go through login back to the action", () => {
		expect(html).toContain('href="/auth/login?redirect=%2Ffavorites"');
		expect(html).toContain('href="/auth/login?redirect=%2Fcreate"');
		expect(html).toContain("Post an ad");
	});

	test("only Log in is offered, returning to this page", () => {
		expect(html).toContain('href="/auth/login?redirect=%2Flisting%2F42"');
		// Only the way in; the login page links to registration.
		expect(html).not.toContain("/auth/register");
	});

	test("no account menu, messages or cart", () => {
		expect(html).not.toContain('href="/messages"');
		expect(html).not.toContain('href="/cart"');
	});

	test("the utility bar carries the trust line, selling, help and language", () => {
		expect(html).toContain("Classifieds and shops near you");
		expect(html).toContain(">Sell on BuyNSellem<");
		expect(html).toContain(">Help");
		expect(html).toContain("<select");
	});
});

describe("Header, signed in", () => {
	const html = render(<Header categories={CATEGORIES} />, {
		pathname: "/listing/42",
		user: SIGNED_IN,
	});

	test("actions lead straight to their pages", () => {
		expect(html).toContain('href="/favorites"');
		expect(html).toContain('href="/create"');
		expect(html).toContain('href="/messages"');
		expect(html).toContain('href="/cart"');
		expect(html).not.toContain("redirect=%2Fcreate");
	});

	test("the categories button is a closed disclosure", () => {
		expect(html).toMatch(
			/<button[^>]*aria-expanded="false"[^>]*aria-controls=/,
		);
		expect(html).toContain("All categories");
	});
});

describe("shortcuts strip", () => {
	test("on the home page, with the verified shops entry", () => {
		const html = render(<Header categories={CATEGORIES} />, { pathname: "/" });
		expect(html).toContain('aria-label="Category shortcuts"');
		expect(html).toContain('href="/search?category=veh"');
		expect(html).toContain('href="/shops?level=2"');
	});

	test("never on a listing", () => {
		const html = render(<Header categories={CATEGORIES} />, {
			pathname: "/listing/42",
		});
		expect(html).not.toContain('aria-label="Category shortcuts"');
	});
});

describe("mobile tab bar", () => {
	test("on browsing pages: five tabs, Post gated when signed out", () => {
		const html = render(<Header categories={CATEGORIES} />, { pathname: "/" });
		expect(html).toContain('aria-label="Main navigation"');
		for (const label of ["Home", "Categories", "Post", "Messages", "Account"]) {
			expect(html).toContain(`${label}</`);
		}
		expect(html).toContain('href="/auth/login?redirect=%2Fmessages"');
		expect(html).toContain('aria-current="page"');
	});

	test("absent from checkout, which has its own shell", () => {
		const html = render(<Header categories={CATEGORIES} />, {
			pathname: "/checkout",
			user: SIGNED_IN,
		});
		expect(html).not.toContain('aria-label="Main navigation"');
	});
});

describe("Header in shop mode", () => {
	const theme = shopTheme("#0E7490");
	const shop: HeaderShop = {
		name: "Akwa Tech Store",
		handle: "akwa-tech",
		logoUrl: null,
		theme,
	};
	const html = render(<Header categories={CATEGORIES} shop={shop} />, {
		pathname: "/s/akwa-tech",
		user: SIGNED_IN,
	});

	test("the main bar takes the shop's colours, light and dark", () => {
		expect(html).toContain("data-shop-mode");
		expect(html).toContain(`--shop-head-bg:${theme.light.headerBg}`);
		expect(html).toContain(
			`.dark .bns-shop-head{--shop-head-bg:${theme.dark.headerBg}`,
		);
		expect(html).toContain("bg-[var(--shop-head-bg)]");
	});

	test("shop identity sits next to the BuyNSellem logo, which still goes home", () => {
		expect(html).toContain('href="/s/akwa-tech"');
		expect(html).toContain("Akwa Tech Store");
		expect(html).toContain('aria-label="BuyNSellem home"');
		expect(html).toMatch(/<a aria-label="BuyNSellem home"[^>]*href="\/"/);
	});

	test("search defaults to everywhere and offers this shop", () => {
		expect(html).toMatch(/<option value="everywhere" selected="">Everywhere</);
		expect(html).toContain('<option value="shop">In this shop</option>');
	});

	test("post and account keep working; the post button stays platform amber", () => {
		expect(html).toContain('href="/create"');
		expect(html).toContain("bg-[#F59E0B]");
	});
});

describe("categories menu, open", () => {
	const rubrics = navRubrics(CATEGORIES);
	const open = (shopsEnabled: boolean) =>
		render(
			<CategoriesMenu
				rubrics={rubrics}
				city="Douala"
				shopsEnabled={shopsEnabled}
				defaultOpen
			/>,
			{ shopsEnabled },
		);

	test("two panes, text only: rubrics left, the active rubric's children right", () => {
		const html = open(true);
		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('href="/search?category=veh"');
		expect(html).toContain('href="/search?category=ele"');
		expect(html).not.toContain("<img");
	});

	test("a sub-category with its own heads a column of its first five, then 'See all'", () => {
		const html = render(
			<CategoriesMenu
				rubrics={[rubrics[1], rubrics[0]]}
				city={null}
				shopsEnabled={false}
				defaultOpen
			/>,
			{ shopsEnabled: false },
		);
		expect(html).toContain('href="/search?category=pho-e"');
		expect(html).not.toContain('href="/search?category=pho-f"');
		expect(html).toContain("See all 6");
		// Computers has none of its own: a tile.
		expect(html).toContain("aspect-[4/3]");
		expect(html).toContain('href="/search?category=com"');
	});

	test("Boutiques sits apart, and the shops line names rubric and city", () => {
		const html = open(true);
		expect(html).toContain('href="/shops"');
		expect(html).toContain("Vehicles shops in Douala");
		expect(html).toContain('href="/shops?category=veh&amp;city=Douala"');
		expect(html).toContain("All of Vehicles");
	});

	test("no shops entries while shops are off", () => {
		const html = open(false);
		expect(html).not.toContain("/shops");
	});
});

describe("mobile sheets", () => {
	const rubrics = navRubrics(CATEGORIES);

	test("categories: top level first, then a drill-down with its 'All of'", () => {
		const top = render(<CategoriesSheetBody rubrics={rubrics} shopsEnabled />);
		expect(top).toContain("Electronics");
		expect(top).not.toContain("Phones");
		expect(top).toContain("Verified shops");

		const drilled = render(
			<CategoriesSheetBody
				rubrics={rubrics}
				shopsEnabled
				initialRubric="ele"
			/>,
		);
		expect(drilled).toContain('href="/search?category=pho"');
		expect(drilled).toContain("All of Electronics");
	});

	test("account, signed out: sign in, then help and language", () => {
		const html = render(
			<AccountSheetBody
				signedIn={false}
				pathname="/search"
				account={[]}
				userLabel={null}
				onLogout={() => {}}
			/>,
		);
		expect(html).toContain('href="/auth/login?redirect=%2Fsearch"');
		expect(html).not.toContain("/auth/register");
		expect(html).toContain("Track an order");
		expect(html).toContain("Language");
	});
});
