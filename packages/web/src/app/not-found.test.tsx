import { describe, expect, test } from "bun:test";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import BareNotFound from "./(bare)/not-found";
import CheckoutNotFound from "./(checkout)/not-found";
import OpsNotFound from "./(ops)/not-found";
import PublicNotFound from "./(public)/not-found";
import SellerNotFound from "./(seller)/not-found";
import RootNotFound from "./not-found";

function render(page: () => React.ReactElement): string {
	return renderToStaticMarkup(
		<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
			{page()}
		</NextIntlClientProvider>,
	);
}

describe("not-found pages", () => {
	// /s/[handle] calls notFound() inside (public), so this is what a missing shop renders.
	test("public renders the illustration and the way home", () => {
		const html = render(() => <PublicNotFound />);
		expect(html).toContain('<svg class="ill"');
		expect(html).toContain('href="/"');
		expect(html).toContain('href="/search"');
		expect(html).toContain(en.NotFoundPublic.title.replace("'", "&#x27;"));
	});

	test.each([
		["root", () => <RootNotFound />, 'href="/"'],
		["checkout", () => <CheckoutNotFound />, 'href="/cart"'],
		["seller", () => <SellerNotFound />, 'href="/seller"'],
		["ops", () => <OpsNotFound />, 'href="/moderation/verification"'],
	])("%s carries the illustration and its own exit", (_name, page, href) => {
		const html = render(page);
		expect(html).toContain('<svg class="ill"');
		expect(html).toContain(href);
	});

	test("bare is a plain message with no exit", () => {
		const html = render(() => <BareNotFound />);
		expect(html).toContain(en.NotFoundBare.title);
		expect(html).not.toContain("<a ");
	});
});
