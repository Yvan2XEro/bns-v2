import type {
	Access,
	CollectionBeforeChangeHook,
	CollectionConfig,
	Payload,
} from "payload";
import { isAdmin } from "../access/roles";
import type { PaymentProviderId } from "../lib/paymentSettings";
import {
	PAYMENT_PROVIDERS,
	SETTLEMENT_MODE_REFUSALS,
	SETTLEMENT_MODES,
} from "../lib/paymentSettings";
import { hasMarketplaceProvider } from "../lib/payments/marketplaceRegistry";

export const MARKET_STATUSES = [
	"draft",
	"review",
	"live",
	"suspended",
] as const;
export type MarketStatus = (typeof MARKET_STATUSES)[number];

export const MARKET_TRANSITIONS: Record<MarketStatus, readonly MarketStatus[]> =
	{
		draft: ["review"],
		review: ["draft", "live"],
		live: ["suspended"],
		suspended: ["review", "live"],
	};

export const MARKET_FEATURES = [
	"cod",
	"protectedPayment",
	"deliveryZones",
	"couriers",
	"disputes",
	"resale",
	"resalePrepaid",
	"boosts",
] as const;

export const MARKET_TERMINAL_ORDER_STATUSES = [
	"completed",
	"cancelled",
	"returned",
] as const;

const adminOnly: Access = ({ req: { user } }) =>
	isAdmin(user as { role?: string } | null);

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec =>
	value !== null && typeof value === "object" ? (value as Rec) : {};
const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string")
		: [];

const relId = (value: unknown): unknown =>
	value !== null && typeof value === "object" && "id" in value
		? (value as { id: unknown }).id
		: value;

const stringArray = (value: unknown): true | string =>
	Array.isArray(value) && value.every((v) => typeof v === "string")
		? true
		: "Expected a list of strings.";

const integerAtLeastZero = (value: unknown): true | string =>
	value == null || (Number.isInteger(value) && (value as number) >= 0)
		? true
		: "Amounts are integers in minor units.";

function phonePatternRefusal(phone: Rec): string | null {
	const source = phone.pattern;
	if (typeof source !== "string" || !source) return null;
	let pattern: RegExp;
	try {
		pattern = new RegExp(source);
	} catch {
		return `The phone pattern "${source}" is not a valid regular expression.`;
	}
	const examples = rec(phone.examples);
	const missed = strings(examples.valid).filter((e) => !pattern.test(e));
	if (missed.length > 0)
		return `The phone pattern does not match its own valid example${missed.length > 1 ? "s" : ""}: ${missed.join(", ")}.`;
	const matched = strings(examples.invalid).filter((e) => pattern.test(e));
	if (matched.length > 0)
		return `The phone pattern matches its own invalid example${matched.length > 1 ? "s" : ""}: ${matched.join(", ")}.`;
	return null;
}

function timezoneRefusal(timezone: unknown): string | null {
	if (typeof timezone !== "string" || !timezone) return null;
	try {
		new Intl.DateTimeFormat("en", { timeZone: timezone });
		return null;
	} catch {
		return `"${timezone}" is not an IANA timezone.`;
	}
}

const CURRENCY_KEYS = ["code", "minorUnit", "rounding"] as const;

const currencyChanged = (before: unknown, after: unknown): boolean => {
	const a = rec(before);
	const b = rec(after);
	return CURRENCY_KEYS.some(
		(key) => key in b && String(a[key]) !== String(b[key]),
	);
};

export interface MarketRefusalContext {
	payload: Payload;
	id?: unknown;
	env?: NodeJS.ProcessEnv;
}

/**
 * One sentence per reason, the way `paymentSettingsRefusal` speaks. `market`
 * is the document as it will be stored; `before` is what is stored now.
 */
export async function marketRefusal(
	market: Rec,
	before: Rec | undefined,
	{ payload, id, env = process.env }: MarketRefusalContext,
): Promise<string | null> {
	const reasons: string[] = [];
	const status = market.status as MarketStatus | undefined;

	if (before) {
		if (
			typeof market.countryCode === "string" &&
			market.countryCode !== before.countryCode
		)
			reasons.push("A market's country code cannot change once created.");
		const from = before.status as MarketStatus | undefined;
		if (status && from && status !== from) {
			if (!MARKET_TRANSITIONS[from]?.includes(status))
				reasons.push(`A market cannot move from ${from} to ${status}.`);
		}
	} else if (status && status !== "draft") {
		reasons.push("A market starts as a draft.");
	}

	if (typeof market.countryCode === "string") {
		const { docs } = await payload.find({
			collection: "markets",
			where: { countryCode: { equals: market.countryCode } },
			limit: 2,
			depth: 0,
			overrideAccess: true,
		});
		if (docs.some((d) => String(d.id) !== String(id ?? "")))
			reasons.push(`A market for ${market.countryCode} already exists.`);
	}

	const phone = phonePatternRefusal(rec(market.phone));
	if (phone) reasons.push(phone);
	const zone = timezoneRefusal(market.timezone);
	if (zone) reasons.push(zone);

	const payments = rec(market.payments);
	const mode = payments.settlementMode;
	if (typeof mode === "string" && mode !== "provider_split") {
		const sentence =
			SETTLEMENT_MODE_REFUSALS[mode as keyof typeof SETTLEMENT_MODE_REFUSALS];
		if (sentence) reasons.push(sentence);
	}

	if (status === "live") {
		if (!relId(rec(market.regulatoryReview).evidence))
			reasons.push(
				"A market cannot go live without counsel's review filed as evidence.",
			);
		const provider = payments.provider;
		if (!hasMarketplaceProvider(provider as PaymentProviderId, env))
			reasons.push(
				`A market cannot go live: no payment adapter is registered for "${String(provider)}" and PAYMENTS_PROVIDER=fake is not set. Build and register the adapter first.`,
			);
		if (id !== undefined) {
			const { totalDocs } = await payload.find({
				collection: "market-cities",
				where: {
					and: [{ market: { equals: id } }, { active: { equals: true } }],
				},
				limit: 1,
				depth: 0,
				overrideAccess: true,
			});
			if (totalDocs === 0)
				reasons.push("A market cannot go live without an active city.");
		} else {
			reasons.push("A market cannot go live without an active city.");
		}
	}

	if (
		before &&
		id !== undefined &&
		currencyChanged(before.currency, market.currency)
	) {
		const { totalDocs } = await payload.find({
			collection: "orders",
			where: {
				and: [
					{ market: { equals: id } },
					{ status: { not_in: [...MARKET_TERMINAL_ORDER_STATUSES] } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (totalDocs > 0)
			reasons.push(
				"The currency cannot change while orders in this market are still open.",
			);
	}

	return reasons.length > 0 ? reasons.join(" ") : null;
}

const refuseInvalidMarket: CollectionBeforeChangeHook = async ({
	data,
	originalDoc,
	req,
}) => {
	const stored = rec(originalDoc);
	const merged = { ...stored, ...rec(data) };
	const refusal = await marketRefusal(
		merged,
		originalDoc ? stored : undefined,
		{ payload: req.payload, id: stored.id },
	);
	if (refusal) throw new Error(refusal);
	return data;
};

export const Markets: CollectionConfig = {
	slug: "markets",
	admin: {
		group: "Configuration",
		useAsTitle: "name",
		defaultColumns: ["countryCode", "name", "status"],
	},
	access: {
		read: adminOnly,
		create: adminOnly,
		update: adminOnly,
		delete: () => false,
	},
	hooks: { beforeChange: [refuseInvalidMarket] },
	fields: [
		{
			name: "countryCode",
			type: "text",
			required: true,
			unique: true,
			index: true,
			validate: (value: unknown) =>
				typeof value === "string" && /^[A-Z]{2}$/.test(value)
					? true
					: "Use an ISO 3166-1 alpha-2 code, upper case.",
		},
		{ name: "name", type: "text", required: true },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "draft",
			index: true,
			options: MARKET_STATUSES.map((value) => ({ label: value, value })),
		},
		{
			name: "currency",
			type: "group",
			fields: [
				{
					name: "code",
					type: "text",
					required: true,
					validate: (value: unknown) =>
						typeof value === "string" && /^[A-Z]{3}$/.test(value)
							? true
							: "Use an ISO 4217 code, upper case.",
				},
				{ name: "minorUnit", type: "number", required: true, min: 0, max: 3 },
				{
					name: "rounding",
					type: "select",
					required: true,
					options: ["half_up", "half_even", "down"].map((value) => ({
						label: value,
						value,
					})),
				},
			],
		},
		{
			name: "formatting",
			type: "array",
			fields: [
				{
					name: "locale",
					type: "select",
					required: true,
					options: ["fr", "en"].map((value) => ({ label: value, value })),
				},
				{ name: "symbol", type: "text", required: true },
				{
					name: "position",
					type: "select",
					required: true,
					options: ["before", "after"].map((value) => ({
						label: value,
						value,
					})),
				},
				{ name: "groupSeparator", type: "text", required: true },
				{ name: "decimalSeparator", type: "text", required: true },
				{
					name: "patternExample",
					type: "text",
					admin: { description: "Display-only check string." },
				},
			],
		},
		{
			name: "phone",
			type: "group",
			fields: [
				{ name: "pattern", type: "text", required: true },
				{
					name: "examples",
					type: "group",
					fields: [
						{ name: "valid", type: "json", validate: stringArray },
						{ name: "invalid", type: "json", validate: stringArray },
					],
				},
				{ name: "displayExample", type: "text" },
			],
		},
		{ name: "timezone", type: "text", required: true },
		{
			name: "languages",
			type: "select",
			hasMany: true,
			required: true,
			options: ["fr", "en"].map((value) => ({ label: value, value })),
		},
		{ name: "vatRateBps", type: "number", required: true, min: 0, max: 10_000 },
		{
			name: "payments",
			type: "group",
			fields: [
				{
					name: "provider",
					type: "select",
					required: true,
					options: PAYMENT_PROVIDERS.map((value) => ({ label: value, value })),
				},
				{
					name: "settlementMode",
					type: "select",
					required: true,
					defaultValue: "provider_split",
					options: SETTLEMENT_MODES.map((value) => ({ label: value, value })),
				},
				{
					name: "channels",
					type: "text",
					hasMany: true,
					validate: (value: unknown) =>
						strings(value).every((c) => /^[a-z]{2}\.[a-z0-9_]{2,20}$/.test(c))
							? true
							: "Use {country}.{operator} keys, e.g. cm.mtn.",
				},
				{ name: "enabled", type: "checkbox", defaultValue: false },
			],
		},
		{
			name: "features",
			type: "group",
			fields: MARKET_FEATURES.map((name) => ({
				name,
				type: "checkbox" as const,
				defaultValue: false,
			})),
		},
		{
			name: "amounts",
			type: "group",
			admin: { description: "Integers in the market's minor units." },
			fields: [
				"minPayout",
				"maxOrderAmount",
				"exposureLevel2",
				"exposureLevel3",
				"buyerProtectionMin",
				"buyerProtectionMax",
				"defaultDeliveryFeeFallback",
			].map((name) => ({
				name,
				type: "number" as const,
				required: true,
				min: 0,
				validate: integerAtLeastZero,
			})),
		},
		{
			name: "regulatoryReview",
			type: "group",
			fields: [
				{ name: "reviewedBy", type: "text" },
				{ name: "reviewedAt", type: "date" },
				{
					name: "evidence",
					type: "relationship",
					relationTo: "payment-gate-evidence",
				},
				{ name: "note", type: "textarea" },
			],
		},
		{
			name: "moneyCalendar",
			type: "group",
			fields: [
				{
					name: "releaseHourLocal",
					type: "number",
					defaultValue: 10,
					min: 0,
					max: 23,
				},
				{
					name: "reconcileHourLocal",
					type: "number",
					defaultValue: 2,
					min: 0,
					max: 23,
				},
				{
					name: "vatPeriod",
					type: "select",
					defaultValue: "calendar_month",
					options: [{ label: "calendar_month", value: "calendar_month" }],
				},
				{
					name: "lastReleaseLocalDate",
					type: "text",
					admin: { readOnly: true },
				},
				{
					name: "lastReconcileLocalDate",
					type: "text",
					admin: { readOnly: true },
				},
			],
		},
	],
	timestamps: true,
};
