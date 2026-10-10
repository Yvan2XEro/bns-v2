import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import { EmptyState, type EmptyStateIllustration } from "./empty-state";
import { CatalogueEmpty } from "./seller/catalogue-empty";

const KEYS: EmptyStateIllustration[] = [
	"empty",
	"searching",
	"favorites",
	"messages",
	"sell",
	"auth",
	"boost",
	"listings",
	"notFound",
];

const css = readFileSync(
	join(import.meta.dir, "illustrations/illustrations.css"),
	"utf8",
);

// Static markup cannot evaluate a media query, so the guard is asserted on the
// stylesheet: every animation rule must sit inside the no-preference block.
function withoutNoPreferenceBlock(source: string): string {
	const start = source.indexOf(
		"@media (prefers-reduced-motion: no-preference)",
	);
	if (start < 0) return source;
	let depth = 0;
	for (let i = source.indexOf("{", start); i < source.length; i++) {
		if (source[i] === "{") depth++;
		if (source[i] === "}" && --depth === 0)
			return source.slice(0, start) + source.slice(i + 1);
	}
	return source;
}

describe("reduced-motion guard", () => {
	test("no animation is started outside prefers-reduced-motion: no-preference", () => {
		const unguarded = withoutNoPreferenceBlock(css);
		expect(css).toContain("prefers-reduced-motion: no-preference");
		expect(unguarded).not.toMatch(/animation(-name)?\s*:/);
		expect(css).toMatch(/animation-name:\s*ill-pulse/);
	});
});

describe("EmptyState", () => {
	for (const key of KEYS) {
		test(`${key} renders its illustration with guarded animations`, () => {
			const html = renderToStaticMarkup(
				<EmptyState illustration={key} title="Nothing here" />,
			);
			expect(html).toContain('<svg class="ill"');
			expect(html).toContain("ill-anim");
			expect(html).toContain("Nothing here");
		});
	}

	test("renders a link call to action", () => {
		const html = renderToStaticMarkup(
			<EmptyState title="T" subtitle="S" ctaLabel="Go" ctaHref="/search" />,
		);
		expect(html).toContain('href="/search"');
		expect(html).toContain("Go");
	});
});

describe("catalogue empty state", () => {
	test("keeps both ways to fill the catalogue next to the illustration", () => {
		const html = renderToStaticMarkup(
			<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
				<CatalogueEmpty />
			</NextIntlClientProvider>,
		);
		expect(html).toContain('<svg class="ill"');
		expect(html).toContain("ill-anim");
		expect(html).toContain('href="/seller/catalogue/new"');
		expect(html).toContain('href="/shop/manage?move=1"');
	});
});
