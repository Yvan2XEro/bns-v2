import type { GlobalConfig } from "payload";
import { PHOTO_LIMIT } from "../contracts/photoLimit";
import {
	CASE_GATE_IDS,
	DISPUTE_DEFAULTS,
	RETURN_DEFAULTS,
} from "../lib/caseSettings";
import { validateCaseSettings } from "../lib/caseSettingsValidation";
import { courierAdapterPresenceRefusal } from "../lib/delivery/registry";
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
import { adapterPresenceRefusal } from "../lib/payments/marketplaceRegistry";
import { resalePrepaidRefusal } from "../lib/resaleSettings";
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
			({ data, originalDoc, req }) => {
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
				const adapterRefusal = adapterPresenceRefusal(payments, process.env);
				if (adapterRefusal) throw new Error(adapterRefusal);
				const delivery = {
					...(stored.delivery as Record<string, unknown> | undefined),
					...(incoming.delivery as Record<string, unknown> | undefined),
				};
				if (delivery.couriersEnabled === true) {
					return req.payload
						.find({
							collection: "couriers",
							where: { status: { equals: "active" } },
							limit: 100,
							depth: 0,
							overrideAccess: true,
						})
						.then(({ docs }) => {
							const refusal = courierAdapterPresenceRefusal(delivery, docs);
							if (refusal) throw new Error(refusal);
							return data;
						});
				}
				return data;
			},
			validateCaseSettings,
			({ data, originalDoc }) => {
				const stored = (originalDoc ?? {}) as Record<string, unknown>;
				const incoming = data as Record<string, unknown>;
				const resale = {
					...(stored.resale as Record<string, unknown> | undefined),
					...(incoming.resale as Record<string, unknown> | undefined),
				};
				const payments = {
					...(stored.payments as Record<string, unknown> | undefined),
					...(incoming.payments as Record<string, unknown> | undefined),
				};
				const refusal = resalePrepaidRefusal(resale, payments);
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
					type: "row",
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
							admin: { width: "50%" },
						},
						{
							name: "defaultSender",
							type: "text",
							label: "Default sender",
							admin: { width: "50%" },
						},
					],
				},
				{
					name: "avlytext",
					type: "group",
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "apiKey",
									type: "text",
									label: "API key",
									admin: { width: "50%" },
								},
								{
									name: "sender",
									type: "text",
									label: "Sender override",
									admin: { width: "50%" },
								},
							],
						},
					],
				},
				{
					name: "mtarget",
					type: "group",
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "apiKey",
									type: "text",
									label: "API key",
									admin: { width: "50%" },
								},
								{
									name: "sender",
									type: "text",
									label: "Sender override",
									admin: { width: "50%" },
								},
							],
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
			name: "media",
			type: "group",
			label: "Photos",
			fields: [
				{
					name: "photosIncluded",
					type: "number",
					label: "Photos per listing or product",
					defaultValue: PHOTO_LIMIT.default,
					min: PHOTO_LIMIT.min,
					max: PHOTO_LIMIT.ceiling,
					validate: (value: unknown) =>
						value === null ||
						value === undefined ||
						(Number.isInteger(value) &&
							(value as number) >= PHOTO_LIMIT.min &&
							(value as number) <= PHOTO_LIMIT.ceiling) ||
						`A whole number from ${PHOTO_LIMIT.min} to ${PHOTO_LIMIT.ceiling}.`,
					admin: {
						step: 1,
						description: `Photos a seller can add to a classified listing or a shop product (at most ${PHOTO_LIMIT.ceiling}). Content that already has more keeps its photos but cannot add any. Extra photos will become a paid option.`,
					},
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
						{
							type: "row",
							fields: [
								{ name: "reference", type: "text", admin: { width: "50%" } },
								{ name: "grantedAt", type: "date", admin: { width: "50%" } },
							],
						},
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
					name: "multiShopCartEnabled",
					type: "checkbox",
					defaultValue: false,
					admin: {
						description:
							"Off: a cart holds one storefront and one fulfilling shop (cart.singleShop, cart.singleFulfilment). On: lines group per (storefront, fulfilling shop), up to 5 groups and 30 lines. Read by lib/orderSettings.ts.",
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
							type: "row",
							fields: [
								{
									name: "key",
									type: "select",
									required: true,
									options: LAUNCH_CITY_KEYS.map((key) => ({
										label: key,
										value: key,
									})),
									admin: { width: "50%" },
								},
								{
									name: "deliveryFee",
									type: "number",
									required: true,
									min: 0,
									max: 20_000,
									admin: { width: "50%" },
								},
							],
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
					type: "row",
					fields: [
						{
							name: "vatRateBps",
							type: "number",
							defaultValue: 1925,
							admin: {
								width: "33%",
								description: "Basis points of VAT applied to invoices.",
							},
						},
						{
							name: "minInvoiceAmount",
							type: "number",
							defaultValue: 500,
							admin: {
								width: "33%",
								description:
									"Smallest commission invoice the platform will issue.",
							},
						},
						{
							name: "invoiceDueDays",
							type: "number",
							defaultValue: 7,
							admin: {
								width: "33%",
								description: "Days a shop has to pay a commission invoice.",
							},
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "restrictAfterOverdueDays",
							type: "number",
							defaultValue: 3,
							admin: {
								width: "33%",
								description:
									"Days an invoice may stay overdue before new COD orders are refused.",
							},
						},
						{
							name: "confirmHours",
							type: "number",
							defaultValue: 24,
							admin: {
								width: "33%",
								description: "Hours a shop has to confirm a new order.",
							},
						},
						{
							name: "acceptHours",
							type: "number",
							defaultValue: 48,
							admin: {
								width: "33%",
								description:
									"Hours a buyer has to accept delivery before escalation.",
							},
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "withdrawalDays",
							type: "number",
							defaultValue: 15,
							admin: {
								width: "50%",
								description:
									"Days after delivery before collected cash is withdrawable. Exposed at GET /api/public/config.",
							},
						},
						{
							name: "staleShippedDays",
							type: "number",
							defaultValue: 14,
							admin: {
								width: "50%",
								description:
									"Days an order may sit 'shipped' before it is flagged stale.",
							},
						},
					],
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
			name: "delivery",
			type: "group",
			label: "Delivery",
			admin: {
				description:
					"P7 zone-based delivery. Flags default off, so the existing flat-fee COD flow remains active until delivery zones are configured.",
			},
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "zonesEnabled",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "25%" },
						},
						{
							name: "couriersEnabled",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "25%" },
						},
						{
							name: "riderLinksEnabled",
							type: "checkbox",
							defaultValue: true,
							admin: { width: "25%" },
						},
						{
							name: "intercityEnabled",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "25%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "maxAttempts",
							type: "number",
							min: 1,
							max: 5,
							defaultValue: 2,
							admin: { width: "50%" },
						},
						{
							name: "rescheduleHours",
							type: "number",
							min: 1,
							max: 168,
							defaultValue: 48,
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "pickupHoldDaysDefault",
							type: "number",
							min: 1,
							max: 30,
							defaultValue: 7,
							admin: { width: "50%" },
						},
						{
							name: "gpsFarThresholdMeters",
							type: "number",
							min: 0,
							max: 10_000,
							defaultValue: 300,
							admin: { width: "50%" },
						},
					],
				},
				{
					name: "providers",
					type: "group",
					fields: [
						{
							name: "yango",
							type: "group",
							fields: [
								{ name: "enabled", type: "checkbox", defaultValue: false },
							],
						},
					],
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
							type: "row",
							fields: [
								{
									name: "countryCode",
									type: "text",
									required: true,
									admin: {
										width: "50%",
										description: "ISO 3166-1 alpha-2, e.g. CM.",
									},
									validate: (value: unknown) =>
										typeof value === "string" && /^[A-Z]{2}$/.test(value)
											? true
											: "Two upper-case letters (ISO 3166-1 alpha-2).",
								},
								{
									name: "currency",
									type: "text",
									required: true,
									admin: {
										width: "50%",
										description: "ISO 4217 currency code.",
									},
									validate: (value: unknown) =>
										typeof value === "string" && /^[A-Z]{3}$/.test(value)
											? true
											: "Three upper-case letters (ISO 4217).",
								},
							],
						},
						{
							type: "row",
							fields: [
								{
									name: "provider",
									type: "select",
									required: true,
									options: PAYMENT_PROVIDERS.map((value) => ({
										label: value,
										value,
									})),
									admin: { width: "50%" },
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
									admin: { width: "50%" },
								},
							],
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
							type: "row",
							fields: [
								{
									name: "vatRateBps",
									type: "number",
									required: true,
									min: 0,
									max: 10_000,
									admin: { width: "50%" },
								},
								{
									name: "enabled",
									type: "checkbox",
									defaultValue: false,
									admin: { width: "50%" },
								},
							],
						},
					],
				},
				{
					name: "buyerProtection",
					type: "group",
					admin: {
						description:
							"Fee the buyer pays on a protected order: bps of the order total, clamped to [min, max] in the market currency, VAT included.",
					},
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "bps",
									type: "number",
									min: 0,
									max: 10_000,
									defaultValue: PAYMENT_DEFAULTS.buyerProtection.bps,
									admin: { width: "33%" },
								},
								{
									name: "min",
									type: "number",
									min: 0,
									defaultValue: PAYMENT_DEFAULTS.buyerProtection.min,
									admin: { width: "33%" },
								},
								{
									name: "max",
									type: "number",
									min: 0,
									defaultValue: PAYMENT_DEFAULTS.buyerProtection.max,
									admin: { width: "33%" },
								},
							],
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "checkoutExpiryMinutes",
							type: "number",
							min: 1,
							defaultValue: PAYMENT_DEFAULTS.checkoutExpiryMinutes,
							admin: { width: "50%" },
						},
						{
							name: "payoutAccountChangeHoldHours",
							type: "number",
							min: 0,
							defaultValue: PAYMENT_DEFAULTS.payoutAccountChangeHoldHours,
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "minPayout",
							type: "number",
							min: 0,
							defaultValue: PAYMENT_DEFAULTS.minPayout,
							admin: { width: "50%" },
						},
						{
							name: "maxOrderAmount",
							type: "number",
							min: 0,
							defaultValue: PAYMENT_DEFAULTS.maxOrderAmount,
							admin: { width: "50%" },
						},
					],
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
							type: "row",
							fields: [
								{
									name: "level2",
									type: "number",
									min: 0,
									defaultValue: PAYMENT_DEFAULTS.exposureCaps.level2,
									admin: { width: "50%" },
								},
								{
									name: "level3",
									type: "number",
									min: 0,
									defaultValue: PAYMENT_DEFAULTS.exposureCaps.level3,
									admin: { width: "50%" },
								},
							],
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
							type: "row",
							fields: [
								{
									name: "gate",
									type: "select",
									required: true,
									options: GATE_IDS.map((value) => ({ label: value, value })),
									admin: { width: "33%" },
								},
								{ name: "clearedAt", type: "date", admin: { width: "33%" } },
								{ name: "clearedBy", type: "text", admin: { width: "33%" } },
							],
						},
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
			name: "resale",
			label: "Resale",
			type: "group",
			admin: {
				description:
					"Resale uses COD by default. Prepaid resale requires protected payments and a filed NotchPay affiliate-flow evidence gate.",
			},
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "enabled",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "50%" },
						},
						{
							name: "prepaidEnabled",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "50%" },
						},
					],
				},
				{
					name: "gates",
					type: "array",
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "gate",
									type: "select",
									required: true,
									options: [
										{
											label: "NotchPay affiliate flow",
											value: "notchpay_affiliate",
										},
									],
									admin: { width: "33%" },
								},
								{ name: "clearedAt", type: "date", admin: { width: "33%" } },
								{ name: "clearedBy", type: "text", admin: { width: "33%" } },
							],
						},
						{
							name: "evidence",
							type: "upload",
							relationTo: "payment-gate-evidence",
						},
						{ name: "note", type: "textarea" },
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "poAcceptHours",
							type: "number",
							min: 1,
							max: 168,
							defaultValue: 24,
							admin: { width: "50%" },
						},
						{
							name: "newResellerWeeklyCap",
							type: "number",
							min: 0,
							defaultValue: 25_000,
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "minPayout",
							type: "number",
							min: 0,
							defaultValue: 2_000,
							admin: { width: "50%" },
						},
						{
							name: "payoutApprovalAbove",
							type: "number",
							min: 0,
							defaultValue: 500_000,
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "returns",
			type: "group",
			label: "Returns",
			admin: {
				description:
					"Read by lib/caseSettings.ts. These are the spec's legal minimums, not a feature switch — there is no returns.enabled. The withdrawal period stays orders.withdrawalDays; it and returns.refundDays are refused below 15 days until the gate record holds evidence for G1.",
			},
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "shipByDays",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.shipByDays,
							admin: { width: "33%" },
						},
						{
							name: "nonConformityShipByDays",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.nonConformityShipByDays,
							admin: { width: "33%" },
						},
						{
							name: "sellerPickupDays",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.sellerPickupDays,
							admin: { width: "33%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "inspectDays",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.inspectDays,
							admin: { width: "33%" },
						},
						{
							name: "receivePresumptionDays",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.receivePresumptionDays,
							admin: { width: "33%" },
						},
						{
							name: "refundDays",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.refundDays,
							admin: {
								width: "33%",
								description: "Refused below 15 days until G1 is filed.",
							},
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "codRefundConfirmSilenceDays",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.codRefundConfirmSilenceDays,
							admin: { width: "33%" },
						},
						{
							name: "lateDeliveryGraceDays",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.lateDeliveryGraceDays,
							admin: { width: "33%" },
						},
						{
							name: "returnWaiverMaxGoodsValue",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.returnWaiverMaxGoodsValue,
							admin: { width: "33%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "refundOutboundDeliveryOnWithdrawal",
							type: "checkbox",
							defaultValue: RETURN_DEFAULTS.refundOutboundDeliveryOnWithdrawal,
							admin: { width: "50%" },
						},
						{
							name: "maxReturnShippingReimbursement",
							type: "number",
							min: 0,
							defaultValue: RETURN_DEFAULTS.maxReturnShippingReimbursement,
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "disputes",
			type: "group",
			label: "Disputes",
			admin: {
				description:
					"Read by lib/caseSettings.ts. Off: dispute creation answers dispute.disabled and clients route Report a problem to /contact; open disputes keep running. Enabling it is refused until the gate record below holds evidence for G2 and G3; strikeEffectsEnabled and a sellerLossFee above 0 are refused until it holds evidence for G4. Exposed at GET /api/public/config as disputesEnabled, re-checked against the gates on every read.",
			},
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					defaultValue: DISPUTE_DEFAULTS.enabled,
				},
				{
					type: "row",
					fields: [
						{
							name: "submitAutoHours",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.submitAutoHours,
							admin: { width: "33%" },
						},
						{
							name: "respondHours",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.respondHours,
							admin: { width: "33%" },
						},
						{
							name: "reminderHours",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.reminderHours,
							admin: { width: "33%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "proposalHours",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.proposalHours,
							admin: { width: "33%" },
						},
						{
							name: "maxProposalRounds",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.maxProposalRounds,
							admin: { width: "33%" },
						},
						{
							name: "reviewBusinessDays",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.reviewBusinessDays,
							admin: { width: "33%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "maxInfoRequests",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.maxInfoRequests,
							admin: { width: "33%" },
						},
						{
							name: "moderatorRefundLimit",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.moderatorRefundLimit,
							admin: { width: "33%" },
						},
						{
							name: "notReceivedMaxDays",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.notReceivedMaxDays,
							admin: { width: "33%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "conformityWindowDays",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.conformityWindowDays,
							admin: { width: "33%" },
						},
						{
							name: "counterfeitWindowDays",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.counterfeitWindowDays,
							admin: { width: "33%" },
						},
						{
							name: "noShowWindowDays",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.noShowWindowDays,
							admin: { width: "33%" },
						},
					],
				},
				{
					name: "evidenceRetentionDays",
					type: "number",
					min: 0,
					defaultValue: DISPUTE_DEFAULTS.evidenceRetentionDays,
				},
				{
					name: "evidenceLimit",
					type: "group",
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "perParty",
									type: "number",
									min: 0,
									defaultValue: DISPUTE_DEFAULTS.evidenceLimit.perParty,
									admin: { width: "50%" },
								},
								{
									name: "total",
									type: "number",
									min: 0,
									defaultValue: DISPUTE_DEFAULTS.evidenceLimit.total,
									admin: { width: "50%" },
								},
							],
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "strikeEffectsEnabled",
							type: "checkbox",
							defaultValue: DISPUTE_DEFAULTS.strikeEffectsEnabled,
							admin: {
								width: "50%",
								description: "Refused above false until G4 is filed.",
							},
						},
						{
							name: "sellerLossFee",
							type: "number",
							min: 0,
							defaultValue: DISPUTE_DEFAULTS.sellerLossFee,
							admin: {
								width: "50%",
								description: "Refused above 0 until G4 is filed.",
							},
						},
					],
				},
				{
					name: "gates",
					type: "array",
					admin: {
						description:
							"The dispute gate record (G1 covers the returns/withdrawal minimum above). A row counts once its evidence is filed.",
					},
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "gate",
									type: "select",
									required: true,
									options: CASE_GATE_IDS.map((value) => ({
										label: value,
										value,
									})),
									admin: { width: "33%" },
								},
								{ name: "clearedAt", type: "date", admin: { width: "33%" } },
								{ name: "clearedBy", type: "text", admin: { width: "33%" } },
							],
						},
						{
							name: "evidence",
							type: "upload",
							relationTo: "dispute-gate-evidence",
						},
						{ name: "note", type: "textarea" },
					],
				},
			],
		},
		{
			name: "insights",
			label: "Seller insights",
			type: "group",
			fields: [{ name: "enabled", type: "checkbox", defaultValue: false }],
		},
		{
			name: "risk",
			label: "Risk and fraud prevention",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "enabled",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "33%" },
						},
						{
							name: "autoEffectsEnabled",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "33%" },
						},
						{
							name: "newLimitsEnabled",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "33%" },
						},
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
					type: "row",
					fields: [
						{
							name: "legalName",
							type: "text",
							admin: {
								width: "33%",
								description: "Legal name printed on commission invoices.",
							},
						},
						{
							name: "rccm",
							type: "text",
							admin: {
								width: "33%",
								description: "RCCM trade register number printed on invoices.",
							},
						},
						{
							name: "niu",
							type: "text",
							admin: {
								width: "33%",
								description:
									"Tax identification number (NIU) printed on invoices.",
							},
						},
					],
				},
				{
					name: "address",
					type: "textarea",
					admin: { description: "Registered address printed on invoices." },
				},
				{
					type: "row",
					fields: [
						{
							name: "supportEmail",
							type: "text",
							admin: {
								width: "50%",
								description: "Support contact shown to buyers and shops.",
							},
						},
						{
							name: "supportPhone",
							type: "text",
							admin: {
								width: "50%",
								description: "Support contact shown to buyers and shops.",
							},
						},
					],
				},
			],
		},
	],
};
