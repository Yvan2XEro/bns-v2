import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import { ShopCategories } from "~/app/(shop)/s/[handle]/shop-categories";
import { ShopTabs } from "~/app/(shop)/s/[handle]/shop-tabs";
import { ShopSellerCard } from "~/components/listing/shop-seller-card";
import { shopTheme } from "~/lib/shop-theme";
import type { Shop } from "~/types";
import { LevelBadge } from "./level-badge";
import { ShopThemeScope } from "./shop-theme-scope";

function render(node: React.ReactElement): string {
	return renderToStaticMarkup(
		<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
			{node}
		</NextIntlClientProvider>,
	);
}

describe("a shop's pages take its colours", () => {
	const theme = shopTheme("#0F766E");

	test("the scope renders the shop's tones as CSS variables", () => {
		const html = render(
			<ShopThemeScope theme={theme}>
				<p>inside</p>
			</ShopThemeScope>,
		);
		expect(html).toContain('data-shop-theme="#0F766E"');
		expect(html).toContain(`--shop-light-accent:${theme.light.accent}`);
		expect(html).toContain(`--shop-light-header-bg:${theme.light.headerBg}`);
		expect(html).toContain(`--shop-dark-accent:${theme.dark.accent}`);
	});

	test("the active tab and the selected category read the shop's accent", () => {
		const tabs = render(
			<ShopTabs
				active="listings"
				hrefFor={(tab) => `/s/a?tab=${tab}`}
				reviewCount={2}
			/>,
		);
		expect(tabs).toContain("text-[var(--shop-accent-text)]");
		const chips = render(
			<ShopCategories
				layout="chips"
				categories={[{ id: "c1", name: "Phones", count: 3 }]}
				total={3}
				selected="c1"
				hrefFor={(id) => `/s/a?category=${id ?? ""}`}
			/>,
		);
		expect(chips).toContain("bg-[var(--shop-accent-soft)]");
	});

	test("a listing page's seller card takes the shop's accent", () => {
		const shop: Shop = {
			id: "s1",
			name: "Akwa",
			handle: "akwa",
			owner: "u1",
			status: "active",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
		const html = render(
			<ShopSellerCard
				shop={shop}
				badge="business"
				brandColor="#0F766E"
				ownerName={null}
			/>,
		);
		expect(html).toContain(`--shop-light-accent:${theme.light.accent}`);
		expect(html).toContain("text-[var(--shop-accent-text,var(--c-ink))]");
	});
});

describe("trust and buying keep the platform's colours inside a shop", () => {
	test("the verification badge never reads the shop's variables", () => {
		const html = render(
			<ShopThemeScope theme={shopTheme("#BE185D")}>
				<LevelBadge badge="business" />
			</ShopThemeScope>,
		);
		const badge = html.slice(html.indexOf("<span"));
		expect(badge).not.toContain("--shop-");
	});

	test.each([
		"components/shop/level-badge.tsx",
		"app/(public)/listing/[id]/buy-box.tsx",
		"components/shop/legal-block.tsx",
	])("%s draws nothing from the shop theme", (file) => {
		const source = readFileSync(join(import.meta.dir, "../..", file), "utf8");
		expect(source).not.toContain("--shop-");
		expect(source).not.toContain("shop-theme");
	});
});
