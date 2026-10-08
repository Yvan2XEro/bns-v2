import type { CollectionConfig } from "payload";
import { can, shopRoleFieldAccess } from "../access/shopRoles";
import { staffOnly } from "../access/staff";
import { LAUNCH_CITIES, LAUNCH_CITY_KEYS } from "../lib/launchCities";
import { RELEASE_MODELS, SETTLEMENT_MODES } from "../lib/paymentSettings";

export const ORDER_STATUSES = [
	"placed",
	"confirmed",
	"paid",
	"accepted",
	"shipped",
	"delivered",
	"completed",
	"cancelled",
	"delivery_failed",
	"returned",
	"disputed",
] as const;

export const ORDER_PAYMENT_STATUSES = [
	"unpaid",
	"awaiting_payment",
	"paid",
	"cod_pending",
	"cod_collected",
	"cod_refused",
	"refunded",
	"partially_refunded",
	"failed",
] as const;

export const ORDER_CANCELLATION_REASONS = [
	"buyer_changed_mind",
	"buyer_ordered_by_mistake",
	"seller_out_of_stock",
	"seller_cannot_deliver",
	"seller_buyer_unreachable",
	"seller_other",
	"confirmation_expired",
	"seller_timeout",
	"payment_expired",
	"staff_fraud",
	"staff_policy",
	"staff_other",
] as const;

export const ORDER_DELIVERY_FAILURE_REASONS = [
	"refused",
	"unreachable",
	"absent",
	"address_not_found",
	"timeout",
	"other",
] as const;

/**
 * The values of `AppSettings.payments` (`settlementMode`, `releaseModel`),
 * snapshotted onto a paid order. Task 2 declares them as `SETTLEMENT_MODES` /
 * `RELEASE_MODELS` in lib/paymentSettings.ts; once both land these become
 * imports of those.
 */
export // Task 2's lists are the one declaration; parallel copies were the P5 drift
// seed caught twice already (PaymentChannel, these two).
const ORDER_SETTLEMENT_MODES = SETTLEMENT_MODES;
export const ORDER_RELEASE_MODELS = RELEASE_MODELS;

/**
 * Set by `services/orders/*` on every write that may legitimately move
 * `status`/`paymentStatus`/item `fulfillmentStatus`/the `snapshot` group.
 * Everything else — including the Payload admin panel — is pinned back.
 */
export const ORDER_SERVICE_CONTEXT = { orderService: true } as const;

/** Fields a shop member may read only with `payments.view` (owner/manager, not staff). */
const commissionFieldAccess = shopRoleFieldAccess((role) =>
	can(role, "payments.view"),
);

const cityOptions = LAUNCH_CITY_KEYS.map((key) => ({
	label: LAUNCH_CITIES[key].label,
	value: key,
}));

export const Orders: CollectionConfig = {
	slug: "orders",
	admin: {
		useAsTitle: "orderNumber",
		defaultColumns: [
			"orderNumber",
			"shop",
			"status",
			"paymentStatus",
			"createdAt",
		],
	},
	access: {
		// Buyers and shop members never read the raw collection: they read
		// through custom routes that project the document per audience
		// (`serializeOrderForBuyer`, `serializeOrderForShop`), which never
		// serialise a hash field and mask the phone after a terminal order
		// ages out. REST read stays staff-only.
		read: staffOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	hooks: {
		beforeChange: [
			// The single writer of `status`/`paymentStatus` is
			// `services/orders/transitions.ts`; this is where that rule is
			// actually enforced, because REST is the one path that can bypass a
			// service function entirely. Only `create` sets them for the first
			// time (always through the service, with `overrideAccess`); every
			// `update` is pinned back unless the caller is the order service.
			async ({ data, operation, originalDoc, req }) => {
				if (operation !== "update") return data;
				if (req.context?.orderService === true) return data;
				data.status = originalDoc?.status;
				data.paymentStatus = originalDoc?.paymentStatus;
				data.shipments = originalDoc?.shipments;
				return data;
			},
		],
	},
	fields: [
		{
			name: "orderNumber",
			type: "text",
			required: true,
			unique: true,
			index: true,
		},
		{ name: "checkoutGroup", type: "text", index: true },
		{ name: "idempotencyKey", type: "text", index: true },
		{ name: "buyer", type: "relationship", relationTo: "users", index: true },
		{ name: "buyerDeletedAt", type: "date" },
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "status",
			type: "select",
			required: true,
			index: true,
			options: ORDER_STATUSES.map((value) => ({ label: value, value })),
			admin: { readOnly: true },
		},
		{
			name: "paymentMethod",
			type: "select",
			required: true,
			options: [
				{ label: "Cash on delivery", value: "cod" },
				{ label: "Mobile money", value: "mobile_money" },
			],
		},
		{
			name: "paymentStatus",
			type: "select",
			required: true,
			index: true,
			options: ORDER_PAYMENT_STATUSES.map((value) => ({ label: value, value })),
			admin: { readOnly: true },
		},
		{
			name: "confirmation",
			type: "group",
			fields: [
				{
					name: "method",
					type: "select",
					options: [
						{ label: "Verified phone", value: "verified_phone" },
						{ label: "SMS code", value: "sms_code" },
						{ label: "Seller call", value: "seller_call" },
					],
				},
				// Never serialised, never REST-readable: a confirmation code is
				// proof of possession, not something even the buyer who received
				// it by SMS needs to read back from the API.
				{ name: "codeHash", type: "text", access: { read: () => false } },
				{ name: "codeExpiresAt", type: "date" },
				{ name: "attempts", type: "number", defaultValue: 0 },
				{ name: "sentAt", type: "date" },
				{ name: "resendCount", type: "number", defaultValue: 0 },
				{ name: "confirmedAt", type: "date" },
				{ name: "confirmedBy", type: "relationship", relationTo: "users" },
			],
		},
		{
			name: "handover",
			type: "group",
			fields: [
				{ name: "codeHash", type: "text", access: { read: () => false } },
				{ name: "attempts", type: "number", defaultValue: 0 },
				{ name: "lockedAt", type: "date" },
				{ name: "sentAt", type: "date" },
				{ name: "regenerateCount", type: "number", defaultValue: 0 },
				{
					name: "method",
					type: "select",
					options: [
						{ label: "OTP", value: "otp" },
						{ label: "Buyer confirmation", value: "buyer_confirmation" },
						{ label: "Seller declaration", value: "seller_declaration" },
						{ label: "Carrier proof of delivery", value: "carrier_pod" },
					],
				},
				{ name: "verifiedAt", type: "date" },
				{ name: "verifiedBy", type: "relationship", relationTo: "users" },
				{ name: "contestBy", type: "date" },
			],
		},
		{
			name: "delivery",
			type: "group",
			fields: [
				{
					name: "method",
					type: "select",
					options: [
						{ label: "Seller delivery", value: "seller_delivery" },
						{ label: "Courier", value: "courier" },
						{ label: "Pickup", value: "pickup" },
					],
				},
				{
					name: "recipientName",
					type: "text",
					required: true,
					minLength: 2,
					maxLength: 60,
				},
				{ name: "phone", type: "text", required: true },
				{ name: "city", type: "select", options: cityOptions },
				{ name: "district", type: "text" },
				{ name: "districtOther", type: "text", minLength: 2, maxLength: 60 },
				{ name: "landmark", type: "text", minLength: 5, maxLength: 200 },
				{
					name: "gps",
					type: "group",
					fields: [
						{ name: "lat", type: "number" },
						{ name: "lng", type: "number" },
						{ name: "accuracyMeters", type: "number" },
						{ name: "capturedAt", type: "date" },
					],
				},
				{ name: "instructions", type: "textarea", maxLength: 300 },
				{ name: "pickupPoint", type: "json" },
				{ name: "fee", type: "number" },
				{ name: "etaText", type: "text" },
				{ name: "optionId", type: "text" },
				{ name: "zone", type: "relationship", relationTo: "delivery-zones" },
				{
					name: "pickupLocation",
					type: "relationship",
					relationTo: "shop-locations",
				},
				{ name: "etaMinHours", type: "number", min: 0 },
				{ name: "etaMaxHours", type: "number", min: 0 },
				{ name: "promisedBy", type: "date" },
			],
		},
		{
			name: "shipments",
			type: "relationship",
			relationTo: "shipments",
			hasMany: true,
			admin: { readOnly: true },
		},
		{
			name: "amounts",
			type: "group",
			fields: [
				{ name: "subtotal", type: "number" },
				{ name: "deliveryFee", type: "number" },
				{ name: "discount", type: "number", defaultValue: 0 },
				{ name: "buyerProtectionFee", type: "number", defaultValue: 0 },
				{ name: "total", type: "number" },
				{ name: "currency", type: "text", defaultValue: "XAF" },
				// P5, frozen at payment by `splitAmounts` (lib/paymentMath.ts).
				{ name: "buyerProtectionFeeVat", type: "number" },
				{ name: "commission", type: "number" },
				{ name: "commissionVat", type: "number" },
				{ name: "applicationFee", type: "number" },
				{ name: "destinationAmount", type: "number" },
			],
		},
		{
			// P5, service-written. `mode` and `releaseModel` are snapshots of
			// `AppSettings.payments` at payment, so a later settings change never
			// re-routes an order already paid.
			name: "settlement",
			type: "group",
			fields: [
				{
					name: "mode",
					type: "select",
					options: ORDER_SETTLEMENT_MODES.map((value) => ({
						label: value,
						value,
					})),
				},
				{
					name: "releaseModel",
					type: "select",
					options: ORDER_RELEASE_MODELS.map((value) => ({
						label: value,
						value,
					})),
				},
				{
					name: "connectedAccount",
					type: "relationship",
					relationTo: "connected-accounts",
				},
				{ name: "releaseEligibleAt", type: "date", index: true },
				{ name: "releasedAt", type: "date" },
				{ name: "payout", type: "relationship", relationTo: "payouts" },
				{ name: "refundedAmount", type: "number", defaultValue: 0 },
			],
		},
		{
			name: "commission",
			type: "group",
			// Informational for everyone who can see the order at all, but the
			// money itself is an owner/manager matter — staff process orders
			// without seeing the shop's margin.
			access: { read: commissionFieldAccess },
			fields: [
				{
					name: "rateBps",
					type: "number",
					access: { read: commissionFieldAccess },
				},
				{
					name: "amount",
					type: "number",
					access: { read: commissionFieldAccess },
				},
				{
					name: "line",
					type: "relationship",
					relationTo: "commission-lines",
					access: { read: commissionFieldAccess },
				},
			],
		},
		{
			name: "risk",
			type: "group",
			fields: [
				{
					name: "phoneTier",
					type: "select",
					options: [
						{ label: "New", value: "new" },
						{ label: "Regular", value: "regular" },
						{ label: "Trusted", value: "trusted" },
						{ label: "Watch", value: "watch" },
					],
				},
				{ name: "refusalsAtPlacement", type: "number" },
				{ name: "capsApplied", type: "json" },
			],
		},
		{
			name: "deadlines",
			type: "group",
			fields: [
				{ name: "confirmBy", type: "date" },
				{ name: "acceptBy", type: "date" },
				{ name: "staleAt", type: "date" },
				{ name: "completeAt", type: "date" },
				{ name: "withdrawalUntil", type: "date" },
			],
		},
		{
			name: "timestamps",
			type: "group",
			fields: [
				{ name: "placedAt", type: "date" },
				{ name: "confirmedAt", type: "date" },
				{ name: "acceptedAt", type: "date" },
				{ name: "shippedAt", type: "date" },
				{ name: "deliveredAt", type: "date" },
				{ name: "completedAt", type: "date" },
				{ name: "cancelledAt", type: "date" },
				{ name: "failedAt", type: "date" },
			],
		},
		{
			name: "cancellation",
			type: "group",
			fields: [
				{
					name: "by",
					type: "select",
					options: [
						{ label: "Buyer", value: "buyer" },
						{ label: "Seller", value: "seller" },
						{ label: "Staff", value: "staff" },
						{ label: "System", value: "system" },
					],
				},
				{
					name: "reason",
					type: "select",
					options: ORDER_CANCELLATION_REASONS.map((value) => ({
						label: value,
						value,
					})),
				},
				{ name: "note", type: "text" },
			],
		},
		{
			name: "deliveryFailure",
			type: "group",
			fields: [
				{
					name: "reason",
					type: "select",
					options: ORDER_DELIVERY_FAILURE_REASONS.map((value) => ({
						label: value,
						value,
					})),
				},
				{ name: "attempts", type: "number", defaultValue: 0, max: 2 },
				{ name: "note", type: "text" },
			],
		},
		{
			name: "completionHold",
			type: "select",
			defaultValue: "none",
			options: [
				{ label: "None", value: "none" },
				{ label: "Return case", value: "return_case" },
				{ label: "Dispute", value: "dispute" },
			],
		},
		{ name: "returnCase", type: "relationship", relationTo: "return-cases" },
		{
			name: "activeDispute",
			type: "relationship",
			relationTo: "disputes",
			index: true,
		},
		{ name: "conversation", type: "relationship", relationTo: "conversations" },
		{
			name: "contract",
			type: "group",
			fields: [
				{ name: "termsVersion", type: "text" },
				{
					name: "locale",
					type: "select",
					options: [
						{ label: "French", value: "fr" },
						{ label: "English", value: "en" },
					],
				},
				{ name: "acceptedAt", type: "date" },
				{ name: "snapshot", type: "json" },
				{ name: "snapshotHash", type: "text" },
				{ name: "receiptSentAt", type: "date" },
			],
		},
		{
			name: "source",
			type: "select",
			options: [
				{ label: "Web", value: "web" },
				{ label: "iOS", value: "ios" },
				{ label: "Android", value: "android" },
			],
		},
	],
	timestamps: true,
};
