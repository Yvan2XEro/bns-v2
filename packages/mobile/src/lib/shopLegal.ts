import { z } from "zod";
import type { BusinessType, ShopLegal } from "../types/api";

export interface LegalBlockLine {
	label: "legalName" | "businessType" | "rccm" | "niu";
	value: string;
}

/**
 * The lines a shop's legal card shows, in declaration order — never
 * `verifiedAt`, which never drives the card's heading either (that reads
 * `PublicShop.legalVerified`, the server's capability, not a field on this
 * group). A field the shop never declared is left out rather than shown
 * empty, so an unverified shop with nothing declared renders no card at all.
 */
export function legalBlockLines(
	legal: ShopLegal | null | undefined,
): LegalBlockLine[] {
	if (!legal) return [];
	const lines: LegalBlockLine[] = [];
	if (legal.legalName)
		lines.push({ label: "legalName", value: legal.legalName });
	if (legal.businessType) {
		lines.push({ label: "businessType", value: legal.businessType });
	}
	if (legal.rccmNumber) lines.push({ label: "rccm", value: legal.rccmNumber });
	if (legal.niu) lines.push({ label: "niu", value: legal.niu });
	return lines;
}

const BUSINESS_TYPE_LABEL_KEYS: Record<BusinessType, string> = {
	entreprenant: "businessTypeEntreprenant",
	sole_trader: "businessTypeSoleTrader",
	company: "businessTypeCompany",
	cooperative: "businessTypeCooperative",
};

/** The `shop` namespace key a business type translates under. */
export function businessTypeLabelKey(type: BusinessType): string {
	return BUSINESS_TYPE_LABEL_KEYS[type];
}

const BUSINESS_TYPES = [
	"entreprenant",
	"sole_trader",
	"company",
	"cooperative",
] as const;

const BUSINESS_TYPE_SET = new Set<string>(BUSINESS_TYPES);

/** Narrows a `LegalBlockLine`'s plain `string` value back to `BusinessType`. */
export function isBusinessType(value: string): value is BusinessType {
	return BUSINESS_TYPE_SET.has(value);
}

/**
 * A NIU of the right shape (14 letters or digits) — mirrors the looser
 * length-only check `verificationBusiness.ts`'s `NIU_PATTERN` uses, not the
 * stricter `^[A-Z]\d{12}[A-Z]$` the server treats as a soft `niu_format`
 * review signal rather than a refusal. A value failing that stricter shape
 * still saves; this only catches a NIU that cannot be the tax office's
 * number at all (wrong length, or a character that isn't alphanumeric).
 */
const NIU_PATTERN = /^[A-Za-z0-9]{14}$/;

/**
 * The shop's own declaration form, editable while `capabilities.effectiveLevel
 * < 3` and read-only at 3 — `verifiedAt` is server-pinned and never part of
 * this schema. An empty string clears a field, the same convention the
 * profile/contacts form uses. Each message is a translation key, not
 * English text: the field that renders it calls `t(...)` on it.
 */
export const legalFormSchema = z.object({
	businessType: z.union([z.literal(""), z.enum(BUSINESS_TYPES)]),
	legalName: z.string().trim().max(120),
	rccmNumber: z.string().trim().max(40),
	niu: z.union([
		z.literal(""),
		z.string().trim().regex(NIU_PATTERN, "shop.niuInvalid"),
	]),
});

export type LegalFormValues = z.infer<typeof legalFormSchema>;

export function legalFormDefaults(legal: ShopLegal | null): LegalFormValues {
	return {
		businessType: legal?.businessType ?? "",
		legalName: legal?.legalName ?? "",
		rccmNumber: legal?.rccmNumber ?? "",
		niu: legal?.niu ?? "",
	};
}

/** `values` as the `PATCH /api/shops/:id` body expects them — `verifiedAt` is never sent. */
export function toLegalUpdateInput(values: LegalFormValues): {
	businessType: BusinessType | null;
	legalName: string | null;
	rccmNumber: string | null;
	niu: string | null;
} {
	return {
		businessType: values.businessType || null,
		legalName: values.legalName.trim() || null,
		rccmNumber: values.rccmNumber.trim() || null,
		niu: values.niu.trim() || null,
	};
}
