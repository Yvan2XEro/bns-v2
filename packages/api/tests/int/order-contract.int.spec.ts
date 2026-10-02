// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildContractSnapshot,
	type ContractSnapshotInput,
	loadSalesTermsTemplate,
	snapshotHash,
} from "../../src/lib/orderContract";

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
			imageUrl: "https://cdn.buynsellem.com/robe.jpg",
			attributes: [
				{ label: "Matiere", value: "Coton", showInSummary: true },
				{ label: "SKU interne", value: "SKU-4821", showInSummary: false },
			],
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

describe("buildContractSnapshot", () => {
	it("names the shop as the seller and BuyNSellem as the hosting platform", () => {
		const snapshot = buildContractSnapshot(baseInput);
		expect(snapshot.seller.name).toBe("Boutique Mimi");
		expect(snapshot.platform.role).toBe("hosting_platform");
	});

	it("carries RCCM and NIU when the shop has them and omits the field when it does not", () => {
		const withoutIds = buildContractSnapshot(baseInput);
		expect(withoutIds.seller.rccm).toBeNull();
		expect(withoutIds.seller.niu).toBeNull();

		const withIds = buildContractSnapshot({
			...baseInput,
			seller: {
				...baseInput.seller,
				rccm: "RC/DLA/2024/B/1234",
				niu: "M012345678901A",
			},
		});
		expect(withIds.seller.rccm).toBe("RC/DLA/2024/B/1234");
		expect(withIds.seller.niu).toBe("M012345678901A");
	});

	it("lists every item with its essential characteristics", () => {
		const snapshot = buildContractSnapshot(baseInput);
		expect(snapshot.items).toHaveLength(1);
		const [item] = snapshot.items;
		expect(item.title).toBe("Robe wax");
		expect(item.variantLabel).toBe("Taille M / Bleu");
		expect(item.condition).toBe("new");
		expect(item.attributes).toEqual([{ label: "Matiere", value: "Coton" }]);
	});

	it("separates the delivery fee from the all-taxes-included item total", () => {
		const snapshot = buildContractSnapshot(baseInput);
		expect(snapshot.amounts.subtotal).toBe(15000);
		expect(snapshot.amounts.deliveryFee).toBe(2000);
		expect(snapshot.amounts.total).toBe(17000);
	});

	it("states the three COD terms in both languages", () => {
		const snapshot = buildContractSnapshot(baseInput);
		expect(snapshot.terms.fr).toHaveLength(3);
		expect(snapshot.terms.en).toHaveLength(3);
		expect(snapshot.terms.fr[0]).toMatch(/livraison/i);
		expect(snapshot.terms.fr[1]).toContain("Douala");
		expect(snapshot.terms.fr[2]).toContain("48");
		expect(snapshot.terms.en[0]).toMatch(/cash on delivery/i);
		expect(snapshot.terms.en[1]).toContain("Douala");
		expect(snapshot.terms.en[2]).toContain("48");
	});

	it("states the 15-day withdrawal right, how to use it and who pays the return", () => {
		const snapshot = buildContractSnapshot(baseInput);
		expect(snapshot.withdrawal.days).toBe(15);
		expect(snapshot.withdrawal.howTo.fr).toContain("15 jours");
		expect(snapshot.withdrawal.howTo.en).toContain("15 days");
		expect(snapshot.withdrawal.costs.fr).toMatch(/acheteur/i);
		expect(snapshot.withdrawal.costs.en).toMatch(/buyer/i);
	});

	it("appends salesTermsExtra after the platform template, never before", () => {
		const snapshot = buildContractSnapshot({
			...baseInput,
			salesTermsTemplate: { fr: "MODELE", en: "TEMPLATE" },
			salesTermsExtra: "Livraison le samedi uniquement.",
		});
		expect(snapshot.salesTerms.fr.indexOf("MODELE")).toBeLessThan(
			snapshot.salesTerms.fr.indexOf("Livraison le samedi"),
		);
		expect(snapshot.salesTerms.en.indexOf("TEMPLATE")).toBeLessThan(
			snapshot.salesTerms.en.indexOf("Livraison le samedi"),
		);
	});

	it("includes the void-clause notice (Law 2011/012 art. 5)", async () => {
		const [fr, en] = await Promise.all([
			loadSalesTermsTemplate("2026-09", "fr"),
			loadSalesTermsTemplate("2026-09", "en"),
		]);
		const snapshot = buildContractSnapshot({
			...baseInput,
			salesTermsTemplate: { fr, en },
		});
		expect(snapshot.salesTerms.fr).toContain("nulle et de nul effet");
		expect(snapshot.salesTerms.fr).toContain("2011/012");
		expect(snapshot.salesTerms.en).toContain("void and of no effect");
		expect(snapshot.salesTerms.en).toContain("2011/012");
	});

	it("hashes the snapshot stably and differently for a changed amount", () => {
		const snapshot = buildContractSnapshot(baseInput);
		const hash = snapshotHash(snapshot);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);

		const rebuilt = buildContractSnapshot(baseInput);
		expect(snapshotHash(rebuilt)).toBe(hash);

		const changed = buildContractSnapshot({
			...baseInput,
			items: [{ ...baseInput.items[0], unitPrice: 16000 }],
		});
		expect(snapshotHash(changed)).not.toBe(hash);
	});

	it("is identical in both languages for every number", () => {
		const fr = buildContractSnapshot({ ...baseInput, locale: "fr" });
		const en = buildContractSnapshot({ ...baseInput, locale: "en" });
		expect(en.amounts).toEqual(fr.amounts);
		expect(en.items.map((item) => item.unitPrice)).toEqual(
			fr.items.map((item) => item.unitPrice),
		);
		expect(en.items.map((item) => item.lineSubtotal)).toEqual(
			fr.items.map((item) => item.lineSubtotal),
		);
		expect(en.withdrawal.days).toBe(fr.withdrawal.days);
	});
});

describe("loadSalesTermsTemplate", () => {
	it("loads the published 2026-09 template in both languages", async () => {
		const fr = await loadSalesTermsTemplate("2026-09", "fr");
		const en = await loadSalesTermsTemplate("2026-09", "en");
		expect(fr).toContain("version: 2026-09");
		expect(en).toContain("version: 2026-09");
	});
});
