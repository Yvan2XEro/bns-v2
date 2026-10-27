import { describe, expect, test } from "bun:test";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { NumberInput } from "./number-input";

const render = (locale: string, value: string, unit?: string) =>
	renderToStaticMarkup(
		<NextIntlClientProvider locale={locale} messages={{}}>
			<NumberInput value={value} onValueChange={() => {}} unit={unit} />
		</NextIntlClientProvider>,
	);

const shown = (html: string) =>
	html.match(/value="([^"]*)"/)?.[1]?.replace(/&#x27;/g, "'") ?? null;

describe("NumberInput", () => {
	test("shows the digits grouped the way the language writes them", () => {
		expect(shown(render("en", "1250000"))).toBe("1,250,000");
		expect(shown(render("fr", "1250000"))?.replace(/\s/gu, " ")).toBe(
			"1 250 000",
		);
	});

	test("is an empty numeric field when there is nothing yet", () => {
		const html = render("fr", "");
		expect(shown(html)).toBe("");
		expect(html.toLowerCase()).toContain('inputmode="numeric"');
	});

	test("shows its unit after the number", () => {
		expect(render("fr", "1500", "FCFA")).toContain("FCFA");
	});
});
