import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./hash";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const salesTermsDir = join(moduleDir, "..", "legal", "shop-sales-terms");

/**
 * One file per published version and locale; never overwritten, because a
 * shop is bound by the terms in force when it sold, not the current ones.
 * Cached by `${version}:${locale}` so a hot checkout path does not re-read
 * the file on every quote.
 */
const templateCache = new Map<string, Promise<string>>();

export async function loadSalesTermsTemplate(
	version: string,
	locale: "fr" | "en",
): Promise<string> {
	const key = `${version}:${locale}`;
	let cached = templateCache.get(key);
	if (!cached) {
		cached = readFile(join(salesTermsDir, `${version}.${locale}.md`), "utf8");
		templateCache.set(key, cached);
	}
	return cached;
}

export interface ContractItemInput {
	title: string;
	variantLabel: string;
	condition: string | null;
	imageUrl: string | null;
	/** Only entries with `showInSummary: true` reach the snapshot. */
	attributes: ReadonlyArray<{
		label: string;
		value: string;
		showInSummary: boolean;
	}>;
	unitPrice: number;
	quantity: number;
	lineSubtotal: number;
}

export interface ContractSnapshotInput {
	termsVersion: string;
	locale: "fr" | "en";
	seller: {
		name: string;
		handle: string;
		city: string | null;
		phone: string | null;
		rccm?: string | null;
		niu?: string | null;
	};
	platform: {
		legalName: string;
		supportEmail: string | null;
		supportPhone: string | null;
	};
	items: ContractItemInput[];
	amounts: {
		subtotal: number;
		deliveryFee: number;
		total: number;
	};
	delivery: {
		areaText: { fr: string; en: string };
		etaText: { fr: string; en: string };
	};
	acceptHours: number;
	withdrawalDays: number;
	salesTermsTemplate: { fr: string; en: string };
	salesTermsExtra?: string | null;
}

export interface ContractSnapshot {
	termsVersion: string;
	locale: "fr" | "en";
	seller: {
		name: string;
		handle: string;
		city: string | null;
		phone: string | null;
		rccm: string | null;
		niu: string | null;
	};
	platform: {
		legalName: string;
		role: "hosting_platform";
		supportEmail: string | null;
		supportPhone: string | null;
	};
	items: Array<{
		title: string;
		variantLabel: string;
		condition: string | null;
		imageUrl: string | null;
		attributes: Array<{ label: string; value: string }>;
		unitPrice: number;
		quantity: number;
		lineSubtotal: number;
	}>;
	amounts: {
		subtotal: number;
		deliveryFee: number;
		discount: 0;
		buyerProtectionFee: 0;
		total: number;
		currency: "XAF";
	};
	terms: { fr: string[]; en: string[] };
	withdrawal: {
		days: number;
		howTo: { fr: string; en: string };
		costs: { fr: string; en: string };
	};
	/** The platform template plus `salesTermsExtra`, always appended after. */
	salesTerms: { fr: string; en: string };
	complaints: { fr: string; en: string };
}

function codTerms(input: ContractSnapshotInput): {
	fr: string[];
	en: string[];
} {
	return {
		fr: [
			"Paiement en especes a la livraison, uniquement au moment de la remise du colis.",
			`Livraison en zone ${input.delivery.areaText.fr}, delai estime ${input.delivery.etaText.fr}.`,
			`Le vendeur doit accepter la commande sous ${input.acceptHours} heures, sans quoi elle est annulee automatiquement.`,
		],
		en: [
			"Payment in cash on delivery, only at the moment the parcel is handed over.",
			`Delivery in the ${input.delivery.areaText.en} area, estimated time ${input.delivery.etaText.en}.`,
			`The seller must accept the order within ${input.acceptHours} hours, or it is cancelled automatically.`,
		],
	};
}

function withdrawalBlock(
	input: ContractSnapshotInput,
): ContractSnapshot["withdrawal"] {
	const days = input.withdrawalDays;
	return {
		days,
		howTo: {
			fr: `Vous disposez de ${days} jours a compter de la reception du colis pour exercer votre droit de retractation, sans justification, via le bouton "Retourner un article" sur la commande.`,
			en: `You have ${days} days from receiving the parcel to exercise your withdrawal right, without justification, using the "Return an item" button on the order.`,
		},
		costs: {
			fr: "Les frais de retour sont a la charge de l'acheteur, sauf si l'article est defectueux ou non conforme a sa description (annexe A6).",
			en: "Return costs are borne by the buyer, unless the item is defective or not as described (annex A6).",
		},
	};
}

function complaintsBlock(
	input: ContractSnapshotInput,
): ContractSnapshot["complaints"] {
	const email = input.platform.supportEmail;
	const phone = input.platform.supportPhone;
	const contactsFr =
		[email, phone].filter(Boolean).join(" ou ") || "le support BuyNSellem";
	const contactsEn =
		[email, phone].filter(Boolean).join(" or ") || "BuyNSellem support";
	return {
		fr: `Adressez d'abord votre reclamation au vendeur via la conversation de la commande. A defaut de reponse, contactez ${contactsFr}.`,
		en: `Address your complaint to the seller through the order's conversation first. If unanswered, contact ${contactsEn}.`,
	};
}

function salesTermsBlock(
	input: ContractSnapshotInput,
): ContractSnapshot["salesTerms"] {
	const extra = input.salesTermsExtra?.trim();
	return {
		fr: extra
			? `${input.salesTermsTemplate.fr}\n\n${extra}`
			: input.salesTermsTemplate.fr,
		en: extra
			? `${input.salesTermsTemplate.en}\n\n${extra}`
			: input.salesTermsTemplate.en,
	};
}

/**
 * A pure function of what the buyer was shown: every value the snapshot
 * needs is an input, so it never re-derives a price, a fee or a terms
 * version from settings that may have changed since. This is the record a
 * cash-on-delivery dispute between strangers is settled against.
 */
export function buildContractSnapshot(
	input: ContractSnapshotInput,
): ContractSnapshot {
	return {
		termsVersion: input.termsVersion,
		locale: input.locale,
		seller: {
			name: input.seller.name,
			handle: input.seller.handle,
			city: input.seller.city,
			phone: input.seller.phone,
			rccm: input.seller.rccm ?? null,
			niu: input.seller.niu ?? null,
		},
		platform: {
			legalName: input.platform.legalName,
			role: "hosting_platform",
			supportEmail: input.platform.supportEmail,
			supportPhone: input.platform.supportPhone,
		},
		items: input.items.map((item) => ({
			title: item.title,
			variantLabel: item.variantLabel,
			condition: item.condition,
			imageUrl: item.imageUrl,
			attributes: item.attributes
				.filter((attribute) => attribute.showInSummary)
				.map((attribute) => ({
					label: attribute.label,
					value: attribute.value,
				})),
			unitPrice: item.unitPrice,
			quantity: item.quantity,
			lineSubtotal: item.lineSubtotal,
		})),
		amounts: {
			subtotal: input.amounts.subtotal,
			deliveryFee: input.amounts.deliveryFee,
			discount: 0,
			buyerProtectionFee: 0,
			total: input.amounts.total,
			currency: "XAF",
		},
		terms: codTerms(input),
		withdrawal: withdrawalBlock(input),
		salesTerms: salesTermsBlock(input),
		complaints: complaintsBlock(input),
	};
}

/**
 * SHA-256 over the whole snapshot, so a later edit of any field — an amount,
 * a term, a seller detail — is detectable even though nothing else in the
 * system keeps a diff.
 */
export function snapshotHash(snapshot: ContractSnapshot): string {
	return sha256(JSON.stringify(snapshot));
}
