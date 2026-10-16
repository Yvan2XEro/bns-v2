import type { MyShop } from "../types/api";
import { shopUrlLabel } from "./shopHandle";
import { businessTypeLabelKey } from "./shopLegal";

/** Each one opens `app/shop/settings/[section].tsx`. */
export const SHOP_SETTINGS_SECTIONS = [
	"name",
	"description",
	"city",
	"categories",
	"contacts",
	"color",
	"address",
	"legal",
	"close",
] as const;

export type ShopSettingsSection = (typeof SHOP_SETTINGS_SECTIONS)[number];

export function isShopSettingsSection(
	value: unknown,
): value is ShopSettingsSection {
	return (SHOP_SETTINGS_SECTIONS as readonly unknown[]).includes(value);
}

/** A section only the owner may open, matching the owner-only endpoints behind it. */
export function sectionNeedsOwner(section: ShopSettingsSection): boolean {
	return section === "close";
}

/** Either a literal value or an i18n key standing in for one; `null` reads as "not set". */
export type RowValue =
	| { text: string }
	| { key: string; values?: Record<string, string | number> }
	| null;

export interface SettingsRow {
	id: string;
	section: ShopSettingsSection;
	labelKey: string;
	value: RowValue;
	tone?: "danger";
}

export interface SettingsGroup {
	titleKey: string;
	rows: SettingsRow[];
}

const CATEGORY_NAMES_SHOWN = 2;
export const MAX_SHOP_CATEGORIES = 5;

function text(value: string | null | undefined): RowValue {
	const trimmed = value?.trim();
	return trimmed ? { text: trimmed } : null;
}

export function categoriesSummary(categories: { name: string }[]): RowValue {
	if (categories.length === 0) return null;
	const names = categories
		.slice(0, CATEGORY_NAMES_SHOWN)
		.map((cat) => cat.name)
		.join(", ");
	const extra = categories.length - CATEGORY_NAMES_SHOWN;
	return {
		key:
			extra > 0
				? "shop.settingsRows.categoriesMore"
				: "shop.settingsRows.categoriesValue",
		values: {
			names,
			extra: Math.max(extra, 0),
			count: categories.length,
			max: MAX_SHOP_CATEGORIES,
		},
	};
}

/**
 * The settings screen as « label · value › » rows, grouped like the form
 * cards they replace. The close row is the owner's only: a manager never
 * sees it, as the card it opens was never mounted for one.
 */
export function shopSettingsGroups(
	shop: MyShop,
	owner: boolean,
	webUrl?: string | null,
): SettingsGroup[] {
	const city = [shop.location.city, shop.location.region]
		.filter(Boolean)
		.join(", ");
	const groups: SettingsGroup[] = [
		{
			titleKey: "shop.profileTitle",
			rows: [
				{
					id: "name",
					section: "name",
					labelKey: "shop.settingsRows.name",
					value: text(shop.name),
				},
				{
					id: "description",
					section: "description",
					labelKey: "shop.descriptionLabel",
					value: text(shop.description),
				},
				{
					id: "city",
					section: "city",
					labelKey: "shop.cityLabel",
					value: text(city),
				},
				{
					id: "categories",
					section: "categories",
					labelKey: "shop.settingsRows.categories",
					value: categoriesSummary(shop.categories),
				},
			],
		},
		{
			titleKey: "shop.contactsTitle",
			rows: [
				{
					id: "phone",
					section: "contacts",
					labelKey: "shop.contactPhone",
					value: text(shop.contact.phone),
				},
				{
					id: "whatsapp",
					section: "contacts",
					labelKey: "shop.contactWhatsapp",
					value: text(shop.contact.whatsapp),
				},
				{
					id: "email",
					section: "contacts",
					labelKey: "shop.contactEmail",
					value: text(shop.contact.email),
				},
			],
		},
		{
			titleKey: "shop.settingsRows.pageTitle",
			rows: [
				{
					id: "color",
					section: "color",
					labelKey: "shop.brandColorTitle",
					value: shop.brandColor
						? { text: shop.brandColor.toUpperCase() }
						: { key: "shop.settingsRows.colorDefault" },
				},
				{
					id: "address",
					section: "address",
					labelKey: "shop.addressTitle",
					value: { text: shopUrlLabel(shop.handle, webUrl) },
				},
				{
					id: "legal",
					section: "legal",
					labelKey: "shop.legalSectionTitle",
					value: shop.legal?.businessType
						? { key: `shop.${businessTypeLabelKey(shop.legal.businessType)}` }
						: null,
				},
			],
		},
	];
	if (owner) {
		groups.push({
			titleKey: "shop.settingsRows.dangerTitle",
			rows: [
				{
					id: "close",
					section: "close",
					labelKey: "shop.closeTitle",
					value: { key: "shop.closeHint" },
					tone: "danger",
				},
			],
		});
	}
	return groups;
}
