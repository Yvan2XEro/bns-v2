// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildContractSnapshot,
	type ContractSnapshotInput,
} from "../../src/lib/orderContract";
import { renderReceiptHtml } from "../../src/lib/orderReceipt";

const baseInput: ContractSnapshotInput = {
	termsVersion: "2026-09",
	locale: "fr",
	seller: {
		name: "Boutique Mimi",
		handle: "boutique-mimi",
		city: "Douala",
		phone: "+237600000001",
		rccm: null,
		niu: null,
	},
	platform: {
		legalName: "BuyNSellem",
		supportEmail: "support@buynsellem.com",
		supportPhone: "+237600000099",
	},
	items: [
		{
			title: "Robe wax",
			variantLabel: "Taille M / Bleu",
			condition: "new",
			imageUrl: null,
			attributes: [{ label: "Matiere", value: "Coton", showInSummary: true }],
			unitPrice: 15000,
			quantity: 1,
			lineSubtotal: 15000,
		},
	],
	amounts: { subtotal: 15000, deliveryFee: 2000, total: 17000 },
	delivery: {
		areaText: { fr: "Douala", en: "Douala" },
		etaText: { fr: "24 a 48 heures", en: "24 to 48 hours" },
	},
	acceptHours: 48,
	withdrawalDays: 15,
	salesTermsTemplate: { fr: "MODELE PLATEFORME", en: "PLATFORM TEMPLATE" },
	salesTermsExtra: null,
};

describe("renderReceiptHtml", () => {
	it("renders the order number, both dates, the seller identity and the snapshot hash", () => {
		const snapshot = buildContractSnapshot(baseInput);
		const html = renderReceiptHtml(
			{
				orderNumber: "BNS-2609-000123",
				orderDate: "2026-09-15T10:00:00.000Z",
				printedAt: "2026-09-15T10:00:05.000Z",
				withdrawalUntil: null,
				snapshot,
				snapshotHash: "a".repeat(64),
			},
			"fr",
		);
		expect(html).toContain("BNS-2609-000123");
		expect(html).toContain("Boutique Mimi");
		expect(html).toContain("a".repeat(64));
		// Two distinct timestamps: ordered-on and printed-on.
		expect(html).toContain("Commandee le");
		expect(html).toContain("Imprime le");
	});

	it("renders every line with its quantity and line total", () => {
		const snapshot = buildContractSnapshot(baseInput);
		const html = renderReceiptHtml(
			{
				orderNumber: "BNS-2609-000123",
				orderDate: "2026-09-15T10:00:00.000Z",
				printedAt: "2026-09-15T10:00:05.000Z",
				withdrawalUntil: null,
				snapshot,
				snapshotHash: "a".repeat(64),
			},
			"fr",
		);
		expect(html).toContain("Robe wax");
		expect(html).toContain("<td>1</td>");
		expect(html).toContain("15 000 FCFA");
	});

	it("renders the amounts in the requested language", () => {
		const snapshot = buildContractSnapshot(baseInput);
		const input = {
			orderNumber: "BNS-2609-000123",
			orderDate: "2026-09-15T10:00:00.000Z",
			printedAt: "2026-09-15T10:00:05.000Z",
			withdrawalUntil: null,
			snapshot,
			snapshotHash: "a".repeat(64),
		};
		expect(renderReceiptHtml(input, "fr")).toContain("17 000 FCFA");
		expect(renderReceiptHtml(input, "en")).toContain("XAF 17,000");
	});

	// The statutory window runs from delivery, not from the order: before
	// delivery the receipt states the rule, never a date computed from the
	// order date, which was always earlier than the buyer's real deadline.
	it("states the withdrawal rule, with the contract's own day count, before delivery", () => {
		const snapshot = buildContractSnapshot({
			...baseInput,
			withdrawalDays: 10,
		});
		const input = {
			orderNumber: "BNS-2609-000123",
			orderDate: "2026-09-15T10:00:00.000Z",
			printedAt: "2026-09-15T10:00:05.000Z",
			withdrawalUntil: null,
			snapshot,
			snapshotHash: "a".repeat(64),
		};
		const fr = renderReceiptHtml(input, "fr");
		const en = renderReceiptHtml(input, "en");
		expect(fr).toContain(
			"<p>Delai de retractation: 10 jours a compter de la reception du colis. La date exacte figurera sur ce recu une fois la commande livree.</p>",
		);
		expect(en).toContain(
			"<p>Withdrawal period: 10 days from receiving the parcel. The exact date will appear on this receipt once the order is delivered.</p>",
		);
		expect(fr).not.toContain("Date limite de retractation");
		expect(en).not.toContain("Withdrawal deadline");
	});

	it("prints the order's stored deadline once delivered, not one counted from the order date", () => {
		const snapshot = buildContractSnapshot(baseInput);
		// Ordered on the 15th, delivered on the 18th: the deadline is the 3rd,
		// where counting from the order date would have said the 30th.
		const withdrawalUntil = "2026-10-03T14:00:00.000Z";
		const input = {
			orderNumber: "BNS-2609-000123",
			orderDate: "2026-09-15T10:00:00.000Z",
			printedAt: "2026-09-20T10:00:05.000Z",
			withdrawalUntil,
			snapshot,
			snapshotHash: "a".repeat(64),
		};
		const date = (lang: string) =>
			new Intl.DateTimeFormat(lang, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(new Date(withdrawalUntil));
		const fr = renderReceiptHtml(input, "fr");
		const en = renderReceiptHtml(input, "en");
		expect(fr).toContain(
			`<p>Date limite de retractation: ${date("fr-FR")}</p>`,
		);
		expect(en).toContain(`<p>Withdrawal deadline: ${date("en-GB")}</p>`);
		expect(fr).not.toContain("Delai de retractation");
	});

	it("escapes a shop name containing markup", () => {
		const snapshot = buildContractSnapshot({
			...baseInput,
			seller: { ...baseInput.seller, name: "<script>x</script>" },
		});
		const html = renderReceiptHtml(
			{
				orderNumber: "BNS-2609-000123",
				orderDate: "2026-09-15T10:00:00.000Z",
				printedAt: "2026-09-15T10:00:05.000Z",
				withdrawalUntil: null,
				snapshot,
				snapshotHash: "a".repeat(64),
			},
			"fr",
		);
		expect(html).not.toContain("<script>x</script>");
		expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
	});
});
