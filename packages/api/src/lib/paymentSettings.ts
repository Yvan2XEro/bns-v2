import type { Payload } from "payload";
import { ERROR_CODES } from "./errors";
import { ServiceError } from "./serviceError";

export const PAYMENT_CHANNELS = ["cm.mtn", "cm.orange"] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const PAYMENT_PROVIDERS = ["notchpay"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export const SETTLEMENT_MODES = [
	"provider_split",
	"direct_to_seller",
	"platform_collects",
] as const;
export type SettlementMode = (typeof SETTLEMENT_MODES)[number];

export const RELEASE_MODELS = ["provider_hold", "provider_schedule"] as const;
export type ReleaseModel = (typeof RELEASE_MODELS)[number];

export const PROVIDER_FEE_BEARERS = ["platform", "seller"] as const;
export type ProviderFeeBearer = (typeof PROVIDER_FEE_BEARERS)[number];

export const GATE_IDS = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
export type GateId = (typeof GATE_IDS)[number];

/** G3 only decides the release model, so it blocks `provider_hold` alone. */
const ALWAYS_REQUIRED_GATES: readonly GateId[] = ["G1", "G2", "G4", "G5", "G6"];

export interface MarketRow {
	countryCode: string;
	currency: string;
	provider: PaymentProviderId;
	settlementMode: SettlementMode;
	channels: PaymentChannel[];
	vatRateBps: number;
	enabled: boolean;
}

export interface GateRow {
	gate: GateId;
	clearedAt: string | null;
	clearedBy: string | null;
	/** Id of the `payment-gate-evidence` upload; null when nothing is filed. */
	evidence: string | null;
	note: string | null;
}

export interface BuyerProtection {
	bps: number;
	min: number;
	max: number;
}

export interface PaymentSettings {
	protectedPayment: { enabled: boolean };
	releaseModel: ReleaseModel;
	markets: MarketRow[];
	buyerProtection: BuyerProtection;
	checkoutExpiryMinutes: number;
	payoutAccountChangeHoldHours: number;
	minPayout: number;
	maxOrderAmount: number;
	exposureCaps: { level2: number; level3: number };
	earlyRelease: { enabled: boolean };
	providerFeeBearer: ProviderFeeBearer;
	gates: GateRow[];
}

/**
 * The launch market as the spec seeds it. Also the field's `defaultValue` in
 * `globals/AppSettings.ts`, so the admin form and this reader cannot drift.
 */
export const DEFAULT_MARKETS: MarketRow[] = [
	{
		countryCode: "CM",
		currency: "XAF",
		provider: "notchpay",
		settlementMode: "provider_split",
		channels: ["cm.mtn", "cm.orange"],
		vatRateBps: 1925,
		enabled: false,
	},
];

export const PAYMENT_DEFAULTS: Omit<PaymentSettings, "markets"> = {
	protectedPayment: { enabled: false },
	releaseModel: "provider_hold",
	buyerProtection: { bps: 300, min: 100, max: 15_000 },
	checkoutExpiryMinutes: 30,
	payoutAccountChangeHoldHours: 72,
	minPayout: 1000,
	maxOrderAmount: 1_000_000,
	exposureCaps: { level2: 500_000, level3: 2_000_000 },
	earlyRelease: { enabled: false },
	providerFeeBearer: "platform",
	gates: [],
};

/** The spec's "Why it is disabled" column, quoted verbatim. */
export const SETTLEMENT_MODE_REFUSALS: Record<
	Exclude<SettlementMode, "provider_split">,
	string
> = {
	direct_to_seller:
		"The seller has the money before delivery, so there is no protection: it is the mobile-money deposit pattern behind the scams the product exists to stop. BuyNSellem cannot refund or hold anything. Kept only as a possible future mode for a market with no marketplace-capable provider, where it would be sold as prepayment without protection.",
	platform_collects:
		"BuyNSellem would hold and transmit third-party funds: a payment service under Regulation 04/18 art. 5, closable under art. 84. Only a market where BuyNSellem holds a licence, or acts under a licensed institution's agency agreement cleared by counsel, could enable it.",
};

type Rec = Record<string, unknown>;
const recordOf = (value: unknown): Rec =>
	value !== null && typeof value === "object" ? (value as Rec) : {};

const oneOf = <T extends string>(
	values: readonly T[],
	value: unknown,
	fallback: T,
): T =>
	typeof value === "string" && (values as readonly string[]).includes(value)
		? (value as T)
		: fallback;

const intOr = (value: unknown, fallback: number): number => {
	const n = Number(value);
	return value !== null && Number.isInteger(n) && n >= 0 ? n : fallback;
};

const textOrNull = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value : null;

const COUNTRY_CODE = /^[A-Z]{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * A market row the money path can act on, or null. A row that is not exactly
 * right is dropped rather than repaired: a guessed currency or VAT rate on a
 * live market would be charged to buyers.
 */
function marketOf(value: unknown): MarketRow | null {
	const row = recordOf(value);
	const { countryCode, currency, provider, settlementMode } = row;
	if (typeof countryCode !== "string" || !COUNTRY_CODE.test(countryCode))
		return null;
	if (typeof currency !== "string" || !CURRENCY_CODE.test(currency))
		return null;
	if (!(PAYMENT_PROVIDERS as readonly unknown[]).includes(provider))
		return null;
	if (!(SETTLEMENT_MODES as readonly unknown[]).includes(settlementMode))
		return null;
	const vat = Number(row.vatRateBps);
	if (!Number.isInteger(vat) || vat < 0 || vat > 10_000) return null;
	const channels = Array.isArray(row.channels)
		? PAYMENT_CHANNELS.filter((c) => (row.channels as unknown[]).includes(c))
		: [];
	return {
		countryCode,
		currency,
		provider: provider as PaymentProviderId,
		settlementMode: settlementMode as SettlementMode,
		channels,
		vatRateBps: vat,
		enabled: row.enabled === true,
	};
}

function marketsOf(value: unknown): MarketRow[] {
	if (!Array.isArray(value)) return DEFAULT_MARKETS.map((m) => ({ ...m }));
	const seen = new Set<string>();
	return value.flatMap((raw) => {
		const market = marketOf(raw);
		// A country listed twice is ambiguous; the first row wins on read and
		// the save hook refuses the duplicate outright.
		if (!market || seen.has(market.countryCode)) return [];
		seen.add(market.countryCode);
		return [market];
	});
}

const relationId = (value: unknown): string | null => {
	if (typeof value === "string" && value) return value;
	if (typeof value === "number") return String(value);
	const id = recordOf(value).id;
	return typeof id === "string" || typeof id === "number" ? String(id) : null;
};

function gatesOf(value: unknown): GateRow[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((raw) => {
		const row = recordOf(raw);
		if (!(GATE_IDS as readonly unknown[]).includes(row.gate)) return [];
		return [
			{
				gate: row.gate as GateId,
				clearedAt: textOrNull(row.clearedAt),
				clearedBy: textOrNull(row.clearedBy),
				evidence: relationId(row.evidence),
				note: textOrNull(row.note),
			},
		];
	});
}

function buyerProtectionOf(value: unknown): BuyerProtection {
	const row = recordOf(value);
	const d = PAYMENT_DEFAULTS.buyerProtection;
	const bps = intOr(row.bps, d.bps);
	const min = intOr(row.min, d.min);
	const max = intOr(row.max, d.max);
	// An inverted range clamps every fee to one bound; fall back as a pair.
	return min <= max
		? { bps: bps <= 10_000 ? bps : d.bps, min, max }
		: { bps: bps <= 10_000 ? bps : d.bps, min: d.min, max: d.max };
}

/** Normalises a raw `payments` group the way every reader must see it. */
export function paymentSettingsOf(payments: unknown): PaymentSettings {
	const p = recordOf(payments);
	const d = PAYMENT_DEFAULTS;
	const caps = recordOf(p.exposureCaps);
	return {
		protectedPayment: {
			enabled: recordOf(p.protectedPayment).enabled === true,
		},
		releaseModel: oneOf(RELEASE_MODELS, p.releaseModel, d.releaseModel),
		markets: marketsOf(p.markets),
		buyerProtection: buyerProtectionOf(p.buyerProtection),
		checkoutExpiryMinutes: intOr(
			p.checkoutExpiryMinutes,
			d.checkoutExpiryMinutes,
		),
		payoutAccountChangeHoldHours: intOr(
			p.payoutAccountChangeHoldHours,
			d.payoutAccountChangeHoldHours,
		),
		minPayout: intOr(p.minPayout, d.minPayout),
		maxOrderAmount: intOr(p.maxOrderAmount, d.maxOrderAmount),
		exposureCaps: {
			level2: intOr(caps.level2, d.exposureCaps.level2),
			level3: intOr(caps.level3, d.exposureCaps.level3),
		},
		earlyRelease: { enabled: recordOf(p.earlyRelease).enabled === true },
		providerFeeBearer: oneOf(
			PROVIDER_FEE_BEARERS,
			p.providerFeeBearer,
			d.providerFeeBearer,
		),
		gates: gatesOf(p.gates),
	};
}

const CLOSED: PaymentSettings = { ...PAYMENT_DEFAULTS, markets: [] };

/**
 * Fails closed: an unreadable global, or one with no `payments` group at all,
 * means no market and the flag off.
 */
export async function getPaymentSettings(
	payload: Payload,
): Promise<PaymentSettings> {
	try {
		const global = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		const payments = (global as { payments?: unknown }).payments;
		if (payments === null || typeof payments !== "object") return CLOSED;
		return paymentSettingsOf(payments);
	} catch {
		return CLOSED;
	}
}

/**
 * The market row for a country. Only `provider_split` is implemented, so a
 * row in any other mode is as unavailable as a missing one. Whether the
 * market is enabled is the caller's question (`isProtectedPaymentOpen`).
 */
export function resolveSettlement(
	settings: PaymentSettings,
	countryCode: string,
): MarketRow {
	const code = countryCode.trim().toUpperCase();
	const market = settings.markets.find((m) => m.countryCode === code);
	if (!market || market.settlementMode !== "provider_split")
		throw new ServiceError(ERROR_CODES.paymentMarketUnavailable, 400);
	return market;
}

/** Gate ids still lacking an evidence row, in G1..G6 order. */
export function missingGates(
	gates: readonly GateRow[],
	releaseModel: ReleaseModel,
): GateId[] {
	const filed = new Set(
		gates.filter((g) => g.evidence !== null).map((g) => g.gate),
	);
	return GATE_IDS.filter(
		(id) =>
			(ALWAYS_REQUIRED_GATES.includes(id) ||
				(id === "G3" && releaseModel === "provider_hold")) &&
			!filed.has(id),
	);
}

/** Only `PROTECTED_PAYMENT_ALLOWED` is read; typed open so `process.env` fits. */
export type PaymentEnv = Readonly<Record<string, string | undefined>>;

const envAllows = (env: PaymentEnv): boolean =>
	env.PROTECTED_PAYMENT_ALLOWED === "true";

/**
 * The country-independent half of `isProtectedPaymentOpen`: the flag, the env
 * and the gates. Callers that must tell `payment.protectedDisabled` apart from
 * `payment.marketUnavailable` ask this first.
 */
export function isProtectedPaymentFlagOpen(
	settings: PaymentSettings,
	env: PaymentEnv = process.env,
): boolean {
	if (!settings.protectedPayment.enabled || !envAllows(env)) return false;
	return missingGates(settings.gates, settings.releaseModel).length === 0;
}

/**
 * Whether a buyer in this country may pay by protected payment right now.
 * Re-checks the gates and the env on every read, so a gate row deleted or the
 * env var withdrawn after the flag was saved closes the feature at once.
 */
export function isProtectedPaymentOpen(
	settings: PaymentSettings,
	countryCode: string,
	env: PaymentEnv = process.env,
): boolean {
	if (!isProtectedPaymentFlagOpen(settings, env)) return false;
	try {
		return resolveSettlement(settings, countryCode).enabled;
	} catch {
		return false;
	}
}

/**
 * Every reason the `payments` group may not be saved as given, joined into
 * one sentence-per-reason message, or null when it may. `env` is passed in so
 * the production rule is a test case, not a thing to believe.
 */
export function paymentSettingsRefusal(
	payments: unknown,
	ordersVatRateBps: number,
	env: PaymentEnv,
): string | null {
	const reasons: string[] = [];
	const rawMarkets = recordOf(payments).markets;
	const rows = Array.isArray(rawMarkets) ? rawMarkets.map(recordOf) : [];

	const seen = new Set<string>();
	for (const row of rows) {
		const code = String(row.countryCode ?? "").toUpperCase();
		if (seen.has(code)) {
			reasons.push(`Market ${code} is listed more than once.`);
			continue;
		}
		seen.add(code);
		const mode = row.settlementMode ?? "provider_split";
		if (mode === "direct_to_seller" || mode === "platform_collects")
			reasons.push(
				`Market ${code}: settlementMode "${mode}" cannot be enabled. ${SETTLEMENT_MODE_REFUSALS[mode]}`,
			);
		const vat = Number(row.vatRateBps ?? DEFAULT_MARKETS[0].vatRateBps);
		// `orders` carries no country: COD runs in the launch market only, so
		// every market is held to its rate until COD becomes per-market.
		if (vat !== ordersVatRateBps)
			reasons.push(
				`Market ${code}: vatRateBps ${vat} differs from orders.vatRateBps ${ordersVatRateBps}; COD and protected-payment invoices would diverge.`,
			);
	}

	const settings = paymentSettingsOf(payments);
	const enabling =
		settings.protectedPayment.enabled || rows.some((r) => r.enabled === true);
	if (enabling) {
		const missing = missingGates(settings.gates, settings.releaseModel);
		if (missing.length > 0) {
			const g3 = missing.includes("G3")
				? " (G3 because releaseModel is provider_hold)"
				: "";
			reasons.push(
				`Protected payment cannot be enabled until the gate record holds evidence for ${missing.join(", ")}${g3}.`,
			);
		}
		if (!envAllows(env))
			reasons.push(
				"Protected payment cannot be enabled: PROTECTED_PAYMENT_ALLOWED=true is not set on the API.",
			);
	}

	return reasons.length > 0 ? reasons.join(" ") : null;
}
