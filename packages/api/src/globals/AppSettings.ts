import type { GlobalConfig } from "payload";
import { LAUNCH_CITY_KEYS } from "../lib/launchCities";
import {
	DEFAULT_MARKETS,
	GATE_IDS,
	PAYMENT_CHANNELS,
	PAYMENT_DEFAULTS,
	PAYMENT_PROVIDERS,
	PROVIDER_FEE_BEARERS,
	paymentSettingsRefusal,
	RELEASE_MODELS,
	SETTLEMENT_MODES,
} from "../lib/paymentSettings";
import { assertAuthorised } from "../lib/verificationSettings";

const isAdmin = ({ req }: { req: { user?: { role?: string } | null } }) =>
	req.user?.role === "admin";

export const AppSettings: GlobalConfig = {
	slug: "app-settings",
	label: "App Settings",
	access: {
		read: isAdmin,
		update: isAdmin,
	},
	admin: {
		group: "Configuration",
	},
	hooks: {
		beforeChange: [
			({ data }) => {
				const refusal = assertAuthorised(
					(data as { verification?: Record<string, unknown> }).verification ??
						{},
					process.env,
				);
				if (refusal) throw new Error(refusal);
				return data;
			},
			({ data, originalDoc }) => {
				// A global save may carry only the groups it changed; judge the
				// document as it will be stored.
				const stored = (originalDoc ?? {}) as Record<string, unknown>;
				const incoming = data as Record<string, unknown>;
				const payments = {
					...(stored.payments as object | undefined),
					...(incoming.payments as object | undefined),
				};
				const vat = Number(
					(incoming.orders as { vatRateBps?: unknown } | undefined)
						?.vatRateBps ??
						(stored.orders as { vatRateBps?: unknown } | undefined)
							?.vatRateBps ??
						1925,
				);
				const refusal = paymentSettingsRefusal(payments, vat, process.env);
				if (refusal) throw new Error(refusal);
				return data;
			},
		],
	},
	fields: [
		{
			name: "auth",
			type: "group",
			label: "Authentication",
			fields: [
				{
					name: "enabledProviders",
					type: "select",
					hasMany: true,
					label: "Enabled OAuth providers",
					defaultValue: ["google", "apple", "facebook"],
					options: [
						{ label: "Google", value: "google" },
						{ label: "Apple", value: "apple" },
						{ label: "Facebook", value: "facebook" },
					],
				},
				{
					name: "enableLocalAuth",
					type: "checkbox",
					label: "Enable email / password authentication",
					defaultValue: true,
				},
			],
		},
		{
			name: "sms",
			type: "group",
			label: "SMS",
			fields: [
				{
					name: "provider",
					type: "select",
					defaultValue: "avlytext",
					options: [
						{ label: "AvlyText", value: "avlytext" },
						{ label: "MTarget", value: "mtarget" },
						{
							label: "Console (development only — logs instead of sending)",
							value: "console",
						},
					],
					required: true,
				},
				{
					name: "defaultSender",
					type: "text",
					label: "Default sender",
				},
				{
					name: "avlytext",
					type: "group",
					fields: [
						{
							name: "apiKey",
							type: "text",
							label: "API key",
						},
						{
							name: "sender",
							type: "text",
							label: "Sender override",
						},
					],
				},
				{
					name: "mtarget",
					type: "group",
					fields: [
						{
							name: "apiKey",
							type: "text",
							label: "API key",
						},
						{
							name: "sender",
							type: "text",
							label: "Sender override",
						},
					],
				},
			],
		},
		{
			name: "shops",
			type: "group",
			label: "Shops",
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					label: "Allow shop creation",
					defaultValue: false,
					admin: {
						description:
							"Off: clients hide shop entry points and POST /api/shops returns shop.disabled. Existing shop pages keep resolving.",
					},
				},
				{
					name: "maxPerUser",
					type: "number",
					label: "Shops per user",
					defaultValue: 1,
					min: 1,
					max: 10,
				},
			],
		},
		{
			name: "verification",
			type: "group",
			label: "Verification",
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					label: "Allow verification requests",
					defaultValue: false,
					admin: {
						description:
							"Off: clients hide verification entry points and the seller write routes return verification.disabled. Existing requests stay readable, reviewers keep deciding, and the retention job keeps running.",
					},
				},
				{
					name: "kycProvider",
					type: "select",
					defaultValue: "didit",
					options: [
						{ label: "Didit", value: "didit" },
						{ label: "Smile ID", value: "smileid" },
					],
					required: true,
				},
				{
					name: "autoApproveIdentity",
					type: "checkbox",
					defaultValue: false,
					admin: {
						description:
							"Off at launch: every identity decision is taken by a person. On, a level-2 request the vendor approved with no review signal is approved automatically.",
					},
				},
				{
					name: "authorisation",
					type: "group",
					label: "Law 2024/017 authorisation",
					admin: {
						description:
							"Recorded in the processing register. Verification cannot be enabled until all four are set.",
					},
					fields: [
						{ name: "reference", type: "text" },
						{ name: "grantedAt", type: "date" },
						{
							name: "transfersAuthorised",
							type: "checkbox",
							defaultValue: false,
						},
						{
							name: "consentVersion",
							type: "text",
							admin: {
								description:
									'The consent text version the clients must send back, e.g. "kyc-2026-10-v1".',
							},
						},
					],
				},
			],
		},
		{
			name: "orders",
			type: "group",
			label: "Orders (cash on delivery)",
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					defaultValue: false,
					admin: {
						description:
							"Off: clients hide checkout entry points and the order write routes return order.codUnavailable. Read by lib/orderSettings.ts.",
					},
				},
				{
					name: "launchCities",
					type: "array",
					defaultValue: [
						{ key: "douala", deliveryFee: 2000 },
						{ key: "yaounde", deliveryFee: 3500 },
					],
					admin: {
						description:
							"Cities where checkout is open and their delivery fee. Read by lib/orderSettings.ts (deliveryFeeFor); a city absent here fails checkout.cityNotServed.",
					},
					fields: [
						{
							name: "key",
							type: "select",
							required: true,
							options: LAUNCH_CITY_KEYS.map((key) => ({
								label: key,
								value: key,
							})),
						},
						{
							name: "deliveryFee",
							type: "number",
							required: true,
							min: 0,
							max: 20_000,
						},
					],
				},
				{
					name: "defaultCommissionRateBps",
					type: "number",
					defaultValue: 800,
					min: 0,
					max: 2000,
					admin: {
						description:
							"Basis points kept by the platform. Read by lib/orderSettings.ts.",
					},
				},
				{
					name: "vatRateBps",
					type: "number",
					defaultValue: 1925,
					admin: { description: "Basis points of VAT applied to invoices." },
				},
				{
					name: "minInvoiceAmount",
					type: "number",
					defaultValue: 500,
					admin: {
						description: "Smallest commission invoice the platform will issue.",
					},
				},
				{
					name: "invoiceDueDays",
					type: "number",
					defaultValue: 7,
					admin: {
						description: "Days a shop has to pay a commission invoice.",
					},
				},
				{
					name: "restrictAfterOverdueDays",
					type: "number",
					defaultValue: 3,
					admin: {
						description:
							"Days an invoice may stay overdue before new COD orders are refused.",
					},
				},
				{
					name: "confirmHours",
					type: "number",
					defaultValue: 24,
					admin: { description: "Hours a shop has to confirm a new order." },
				},
				{
					name: "acceptHours",
					type: "number",
					defaultValue: 48,
					admin: {
						description:
							"Hours a buyer has to accept delivery before escalation.",
					},
				},
				{
					name: "withdrawalDays",
					type: "number",
					defaultValue: 15,
					admin: {
						description:
							"Days after delivery before collected cash is withdrawable. Exposed at GET /api/public/config.",
					},
				},
				{
					name: "staleShippedDays",
					type: "number",
					defaultValue: 14,
					admin: {
						description:
							"Days an order may sit 'shipped' before it is flagged stale.",
					},
				},
				{
					name: "shopCaps",
					type: "json",
					admin: {
						description:
							"Per-level overrides merged onto lib/shopCapabilities.ts's codCaps() defaults.",
					},
				},
				{
					name: "buyerCaps",
					type: "json",
					admin: {
						description:
							"Per-tier overrides merged onto lib/orderSettings.ts's BUYER_CAPS defaults.",
					},
				},
				{
					name: "termsVersion",
					type: "text",
					defaultValue: "2026-09",
					admin: {
						description:
							"COD terms version a buyer must have accepted to check out.",
					},
				},
				{
					name: "pilotShopIds",
					type: "text",
					hasMany: true,
					admin: {
						description:
							"Empty means every eligible shop; non-empty restricts COD to this whitelist. Read by lib/orderSettings.ts's isPilotShop().",
					},
				},
			],
		},
		{
			name: "payments",
			type: "group",
			label: "Payments (protected payment)",
			admin: {
				description:
					"Read by lib/paymentSettings.ts. Enabling the flag or a market is refused until the gate record below holds evidence for G1, G2, G4, G5, G6 (and G3 under provider_hold) and the API runs with PROTECTED_PAYMENT_ALLOWED=true.",
			},
			fields: [
				{
					name: "protectedPayment",
					type: "group",
					fields: [
						{
							name: "enabled",
							type: "checkbox",
							defaultValue: PAYMENT_DEFAULTS.protectedPayment.enabled,
							admin: {
								description:
									"Off: checkout offers COD only, payment setup screens say Coming soon, intent creation returns payment.protectedDisabled. Webhooks, refunds, payouts and reconciliation keep running. Exposed at GET /api/public/config.",
							},
						},
					],
				},
				{
					name: "releaseModel",
					type: "select",
					required: true,
					defaultValue: PAYMENT_DEFAULTS.releaseModel,
					options: RELEASE_MODELS.map((value) => ({ label: value, value })),
					admin: {
						description:
							"provider_hold needs gate G3 cleared; provider_schedule is the fallback when it is not.",
					},
				},
				{
					name: "markets",
					type: "array",
					defaultValue: () =>
						DEFAULT_MARKETS.map((m) => ({ ...m, channels: [...m.channels] })),
					admin: {
						description:
							"One row per country. Only provider_split can be saved; the VAT rate must equal orders.vatRateBps.",
					},
					fields: [
						{
							name: "countryCode",
							type: "text",
							required: true,
							admin: { description: "ISO 3166-1 alpha-2, e.g. CM." },
							validate: (value: unknown) =>
								typeof value === "string" && /^[A-Z]{2}$/.test(value)
									? true
									: "Two upper-case letters (ISO 3166-1 alpha-2).",
						},
						{
							name: "currency",
							type: "text",
							required: true,
							admin: { description: "ISO 4217, e.g. XAF." },
							validate: (value: unknown) =>
								typeof value === "string" && /^[A-Z]{3}$/.test(value)
									? true
									: "Three upper-case letters (ISO 4217).",
						},
						{
							name: "provider",
							type: "select",
							required: true,
							options: PAYMENT_PROVIDERS.map((value) => ({
								label: value,
								value,
							})),
						},
						{
							name: "settlementMode",
							type: "select",
							required: true,
							defaultValue: "provider_split",
							options: SETTLEMENT_MODES.map((value) => ({
								label: value,
								value,
							})),
						},
						{
							name: "channels",
							type: "select",
							hasMany: true,
							options: PAYMENT_CHANNELS.map((value) => ({
								label: value,
								value,
							})),
						},
						{
							name: "vatRateBps",
							type: "number",
							required: true,
							min: 0,
							max: 10_000,
						},
						{ name: "enabled", type: "checkbox", defaultValue: false },
					],
				},
				{
					name: "buyerProtection",
					type: "group",
					admin: {
						description:
							"Fee the buyer pays on a protected order: bps of the order total, clamped to [min, max] XAF, VAT included.",
					},
					fields: [
						{
							name: "bps",
							type: "number",
							min: 0,
							max: 10_000,
							defaultValue: PAYMENT_DEFAULTS.buyerProtection.bps,
						},
						{
							name: "min",
							type: "number",
							min: 0,
							defaultValue: PAYMENT_DEFAULTS.buyerProtection.min,
						},
						{
							name: "max",
							type: "number",
							min: 0,
							defaultValue: PAYMENT_DEFAULTS.buyerProtection.max,
						},
					],
				},
				{
					name: "checkoutExpiryMinutes",
					type: "number",
					min: 1,
					defaultValue: PAYMENT_DEFAULTS.checkoutExpiryMinutes,
				},
				{
					name: "payoutAccountChangeHoldHours",
					type: "number",
					min: 0,
					defaultValue: PAYMENT_DEFAULTS.payoutAccountChangeHoldHours,
				},
				{
					name: "minPayout",
					type: "number",
					min: 0,
					defaultValue: PAYMENT_DEFAULTS.minPayout,
				},
				{
					name: "maxOrderAmount",
					type: "number",
					min: 0,
					defaultValue: PAYMENT_DEFAULTS.maxOrderAmount,
				},
				{
					name: "exposureCaps",
					type: "group",
					admin: {
						description:
							"Protected-payment amount a shop may have in flight, by verification level.",
					},
					fields: [
						{
							name: "level2",
							type: "number",
							min: 0,
							defaultValue: PAYMENT_DEFAULTS.exposureCaps.level2,
						},
						{
							name: "level3",
							type: "number",
							min: 0,
							defaultValue: PAYMENT_DEFAULTS.exposureCaps.level3,
						},
					],
				},
				{
					name: "earlyRelease",
					type: "group",
					fields: [
						{
							name: "enabled",
							type: "checkbox",
							defaultValue: PAYMENT_DEFAULTS.earlyRelease.enabled,
						},
					],
				},
				{
					name: "providerFeeBearer",
					type: "select",
					required: true,
					defaultValue: PAYMENT_DEFAULTS.providerFeeBearer,
					options: PROVIDER_FEE_BEARERS.map((value) => ({
						label: value,
						value,
					})),
				},
				{
					name: "gates",
					type: "array",
					admin: {
						description:
							"The launch gate record (P5 spec, Gates). A row counts once its evidence is filed.",
					},
					fields: [
						{
							name: "gate",
							type: "select",
							required: true,
							options: GATE_IDS.map((value) => ({ label: value, value })),
						},
						{ name: "clearedAt", type: "date" },
						{ name: "clearedBy", type: "text" },
						{
							name: "evidence",
							type: "upload",
							relationTo: "payment-gate-evidence",
						},
						{ name: "note", type: "textarea" },
					],
				},
			],
		},
		{
			name: "company",
			type: "group",
			label: "Company",
			fields: [
				{
					name: "legalName",
					type: "text",
					admin: { description: "Legal name printed on commission invoices." },
				},
				{
					name: "rccm",
					type: "text",
					admin: {
						description: "RCCM trade register number printed on invoices.",
					},
				},
				{
					name: "niu",
					type: "text",
					admin: {
						description: "Tax identification number (NIU) printed on invoices.",
					},
				},
				{
					name: "address",
					type: "textarea",
					admin: { description: "Registered address printed on invoices." },
				},
				{
					name: "supportEmail",
					type: "text",
					admin: { description: "Support contact shown to buyers and shops." },
				},
				{
					name: "supportPhone",
					type: "text",
					admin: { description: "Support contact shown to buyers and shops." },
				},
			],
		},
	],
};
