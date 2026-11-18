// @vitest-environment node
import { describe, expect, it } from "vitest";
import { requestLocale } from "../../src/lib/requestLocale";

const ask = (url: string, acceptLanguage?: string) =>
	requestLocale(
		new Request(url, {
			headers: acceptLanguage ? { "Accept-Language": acceptLanguage } : {},
		}),
	);

describe("requestLocale", () => {
	it("takes ?locale= first", () => {
		expect(ask("http://x/api?locale=en", "fr-FR")).toBe("en");
		expect(ask("http://x/api?locale=fr", "en")).toBe("fr");
	});

	it("ignores an unsupported ?locale= and reads Accept-Language", () => {
		expect(ask("http://x/api?locale=de", "en-US")).toBe("en");
	});

	it("picks the best supported Accept-Language entry by weight", () => {
		expect(ask("http://x/api", "de-DE,en;q=0.7,fr;q=0.9")).toBe("fr");
		expect(ask("http://x/api", "de, en-GB;q=0.5")).toBe("en");
		expect(ask("http://x/api", "fr;q=0, en;q=0.1")).toBe("en");
	});

	it("falls back to French", () => {
		expect(ask("http://x/api")).toBe("fr");
		expect(ask("http://x/api", "de, es;q=0.8")).toBe("fr");
		expect(ask("http://x/api", "*")).toBe("fr");
	});
});
