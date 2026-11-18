// @vitest-environment node
import { describe, expect, it } from "vitest";
import { printDocument } from "../../src/lib/print/document";
import { html } from "../../src/lib/print/html";
import {
	renderStockCountSheet,
	type StockCountLine,
	stockCountSheetHtml,
} from "../../src/services/print/stockCountSheet";
import { fakePayload } from "./helpers/fakePayload";

describe("html", () => {
	it("escapes what it interpolates, and nests fragments as markup", () => {
		const name = `<script>alert("x")</script>`;
		expect(html`<b>${name}</b>`.value).toBe(
			"<b>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</b>",
		);
		expect(
			html`<ul>${["a", "b"].map((x) => html`<li>${x}</li>`)}</ul>`.value,
		).toBe("<ul><li>a</li><li>b</li></ul>");
		expect(html`${null}${false}${undefined}${0}`.value).toBe("0");
	});
});

describe("printDocument", () => {
	const doc = (patch: Partial<Parameters<typeof printDocument>[0]> = {}) =>
		printDocument({
			lang: "fr",
			title: "Feuille",
			issuer: "Chez Awa",
			meta: [{ label: "Lignes", value: "3" }],
			body: html`<p>corps</p>`,
			footer: "Chez Awa · Feuille",
			...patch,
		});

	it("is one A4 page with its footer and page numbers, nothing loaded from elsewhere", () => {
		const out = doc();
		expect(out.startsWith("<!doctype html>")).toBe(true);
		expect(out).toContain("size: A4");
		expect(out).toContain("counter(page)");
		expect(out).toContain('content: "Chez Awa · Feuille"');
		expect(out).not.toMatch(/<link|src="http/);
	});

	it("never lets a name close the stylesheet or the page", () => {
		const out = doc({
			issuer: "</style><script>x</script>",
			footer: '</style><script>x</script>"',
		});
		expect(out).not.toContain("<script>x</script>");
		expect(out.match(/<\/style>/g)).toHaveLength(1);
	});

	it("prints itself when asked, and drops its toolbar in the app", () => {
		expect(doc({ autoprint: true })).toContain("window.print()},150");
		expect(doc()).toContain('class="toolbar"');
		expect(doc({ embedded: true })).not.toContain('class="toolbar"');
	});
});

describe("the stock count sheet", () => {
	const lines: StockCountLine[] = [
		{
			category: "Audio",
			product: "Casque",
			variant: "Noir",
			sku: "CQ-N",
			barcode: null,
			expected: 4,
		},
		{
			category: "Audio",
			product: "AirPods",
			variant: "",
			sku: null,
			barcode: "123",
			expected: 1250,
		},
		{
			category: "Bureau",
			product: "Lampe",
			variant: "",
			sku: null,
			barcode: null,
			expected: null,
		},
	];
	const sheet = (blind: boolean) =>
		renderStockCountSheet({
			lang: "fr",
			shopName: "Chez Awa",
			lines,
			blind,
			printedAt: new Date("2026-10-28T09:00:00Z"),
		});

	it("walks the shelves: by category, then product", () => {
		const out = sheet(false);
		expect(out.indexOf("AirPods")).toBeLessThan(out.indexOf("Casque"));
		expect(out.indexOf("Casque")).toBeLessThan(out.indexOf("Lampe"));
		expect(out.match(/class="group"/g)).toHaveLength(2);
	});

	it("shows the expected stock, grouped as the language writes it", () => {
		const out = sheet(false);
		expect(out).toContain("Attendu");
		expect(out).toMatch(/1\s250/u);
		expect(out).toContain("non suivi");
	});

	it("hides it on a blind count", () => {
		const out = sheet(true);
		expect(out).not.toContain("Attendu");
		expect(out).not.toMatch(/1\s250/u);
		expect(out).toContain("Comptage à l&#39;aveugle");
	});

	it("is the shop's members' only", async () => {
		const payload = fakePayload({
			users: [{ id: "u-1" }, { id: "u-2" }],
			shops: [
				{
					id: "s-1",
					name: "Chez Awa",
					status: "active",
					owner: "u-1",
					level: 1,
				},
			],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-1",
					role: "owner",
					status: "active",
				},
			],
			products: [{ id: "p-1", shop: "s-1", title: "AirPods", category: null }],
			categories: [],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: "s-1",
					optionValues: {},
					sku: "AP",
					trackInventory: true,
					stockOnHand: 3,
					stockReserved: 0,
					archivedAt: null,
				},
				{
					id: "v-2",
					product: "p-1",
					shop: "s-1",
					optionValues: {},
					sku: "OLD",
					trackInventory: true,
					stockOnHand: 9,
					stockReserved: 0,
					archivedAt: "2026-01-01",
				},
			],
		});
		const out = await stockCountSheetHtml(payload, { id: "u-1" }, "s-1", {
			lang: "fr",
			blind: false,
		});
		expect(out).toContain("AirPods");
		expect(out).toContain("Sans catégorie");
		expect(out).not.toContain("OLD");
		await expect(
			stockCountSheetHtml(payload, { id: "u-2" }, "s-1", {
				lang: "fr",
				blind: false,
			}),
		).rejects.toMatchObject({ status: 403 });
	});
});
