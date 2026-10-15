import type { CollectionConfig } from "payload";
import { can, shopRoleFieldAccess } from "../access/shopRoles";
import { staffOnly } from "../access/staff";
import { FAILURE_REASONS, SHIPMENT_STATUSES } from "../lib/delivery/types";

const WINDOWS = ["morning", "afternoon", "evening"] as const;
const SHIPMENT_FLAGS = [
	"gps_far",
	"delivered_without_code",
	"late",
	"return_overdue",
	"cod_remittance_disputed",
	"courier_cancel_refused",
] as const;

const coordinatesFields = [
	{ name: "lat", type: "number" as const, min: -90, max: 90 },
	{ name: "lng", type: "number" as const, min: -180, max: 180 },
	{ name: "accuracyMeters", type: "number" as const, min: 0 },
];

export const Shipments: CollectionConfig = {
	slug: "shipments",
	admin: {
		useAsTitle: "shipmentNumber",
		defaultColumns: [
			"shipmentNumber",
			"order",
			"carrier",
			"status",
			"promisedBy",
		],
	},
	access: {
		read: staffOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	indexes: [
		{ fields: ["order", "status"] },
		{ fields: ["providerShipmentId"] },
	],
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "shipmentNumber",
					type: "text",
					required: true,
					unique: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "storefrontShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "fulfillingShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			name: "items",
			type: "array",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "orderItem",
							type: "relationship",
							relationTo: "order-items",
							required: true,
							admin: { width: "50%" },
						},
						{
							name: "quantity",
							type: "number",
							required: true,
							min: 1,
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
					name: "method",
					type: "select",
					required: true,
					options: ["seller_delivery", "courier", "pickup"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
				{
					name: "carrier",
					type: "select",
					required: true,
					options: ["self", "courier"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
				{
					name: "courier",
					type: "relationship",
					relationTo: "couriers",
					admin: { width: "34%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "provider",
					type: "select",
					options: ["manual", "yango", "campost"].map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "50%" },
				},
				{ name: "providerShipmentId", type: "text", admin: { width: "50%" } },
			],
		},
		{
			name: "providerStatus",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ name: "providerStatus", type: "text", admin: { width: "50%" } },
						{
							name: "status",
							type: "select",
							options: SHIPMENT_STATUSES.map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{ name: "occurredAt", type: "date", admin: { width: "50%" } },
						{ name: "providerEventId", type: "text", admin: { width: "50%" } },
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "trackingCode", type: "text", admin: { width: "50%" } },
				{ name: "trackingUrl", type: "text", admin: { width: "50%" } },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "zone",
					type: "relationship",
					relationTo: "delivery-zones",
					admin: { width: "50%" },
				},
				{
					name: "pickupLocation",
					type: "relationship",
					relationTo: "shop-locations",
					admin: { width: "50%" },
				},
			],
		},
		{ name: "origin", type: "json", required: true },
		{ name: "destination", type: "json", required: true },
		{
			type: "row",
			fields: [
				{
					name: "fee",
					type: "number",
					required: true,
					min: 0,
					admin: { width: "50%" },
				},
				{
					name: "courierCost",
					type: "number",
					min: 0,
					access: {
						read: shopRoleFieldAccess(
							(role) => can(role, "costs.view"),
							"fulfillingShop",
						),
					},
					admin: { width: "50%" },
				},
			],
		},
		{
			name: "rider",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "user",
							type: "relationship",
							relationTo: "users",
							admin: { width: "33%" },
						},
						{ name: "name", type: "text", admin: { width: "33%" } },
						{ name: "phone", type: "text", admin: { width: "34%" } },
					],
				},
				{
					type: "row",
					fields: [
						{ name: "vehicle", type: "text", admin: { width: "33%" } },
						{ name: "assignedAt", type: "date", admin: { width: "33%" } },
						{
							name: "assignedBy",
							type: "relationship",
							relationTo: "users",
							admin: { width: "34%" },
						},
					],
				},
			],
		},
		{
			name: "riderLink",
			type: "group",
			fields: [
				{ name: "tokenHash", type: "text", access: { read: () => false } },
				{
					type: "row",
					fields: [
						{ name: "createdAt", type: "date", admin: { width: "50%" } },
						{ name: "expiresAt", type: "date", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{ name: "revokedAt", type: "date", admin: { width: "50%" } },
						{ name: "lastUsedAt", type: "date", admin: { width: "50%" } },
					],
				},
			],
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "pending",
			index: true,
			options: SHIPMENT_STATUSES.map((value) => ({ label: value, value })),
		},
		{
			name: "attempts",
			type: "array",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "number",
							type: "number",
							required: true,
							min: 1,
							admin: { width: "33%" },
						},
						{
							name: "outcome",
							type: "select",
							required: true,
							options: ["delivered", "failed"].map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "33%" },
						},
						{
							name: "reason",
							type: "select",
							options: FAILURE_REASONS.map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "34%" },
						},
					],
				},
				{ name: "note", type: "text", maxLength: 300 },
				{ name: "gps", type: "group", fields: coordinatesFields },
				{
					type: "row",
					fields: [
						{
							name: "photo",
							type: "relationship",
							relationTo: "delivery-proofs",
							admin: { width: "50%" },
						},
						{
							name: "actorType",
							type: "select",
							required: true,
							options: [
								"seller",
								"rider",
								"rider_link",
								"dispatcher",
								"courier_webhook",
								"courier_poll",
								"staff",
								"system",
							].map((value) => ({ label: value, value })),
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "actor",
							type: "relationship",
							relationTo: "users",
							admin: { width: "50%" },
						},
						{
							name: "at",
							type: "date",
							required: true,
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "finalFailure",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "reason",
							type: "select",
							options: FAILURE_REASONS.map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "33%" },
						},
						{ name: "at", type: "date", admin: { width: "33%" } },
						{
							name: "returnInitiatedAt",
							type: "date",
							admin: { width: "34%" },
						},
					],
				},
			],
		},
		{
			name: "redelivery",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ name: "scheduledFor", type: "date", admin: { width: "33%" } },
						{
							name: "window",
							type: "select",
							options: WINDOWS.map((value) => ({ label: value, value })),
							admin: { width: "33%" },
						},
						{
							name: "requestedBy",
							type: "select",
							options: ["buyer", "seller"].map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "34%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{ name: "rescheduleBy", type: "date", admin: { width: "50%" } },
						{
							name: "note",
							type: "text",
							maxLength: 300,
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "proof",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "handoverMethod",
							type: "select",
							options: [
								"otp",
								"buyer_confirmation",
								"seller_declaration",
								"carrier_pod",
							].map((value) => ({ label: value, value })),
							admin: { width: "50%" },
						},
						{ name: "otpVerifiedAt", type: "date", admin: { width: "50%" } },
					],
				},
				{ name: "photo", type: "relationship", relationTo: "delivery-proofs" },
				{ name: "gps", type: "group", fields: coordinatesFields },
				{
					type: "row",
					fields: [
						{
							name: "distanceFromDestinationMeters",
							type: "number",
							min: 0,
							admin: { width: "50%" },
						},
						{ name: "recipientName", type: "text", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{ name: "providerPodUrl", type: "text", admin: { width: "33%" } },
						{
							name: "capturedBy",
							type: "relationship",
							relationTo: "users",
							admin: { width: "33%" },
						},
						{ name: "capturedAt", type: "date", admin: { width: "34%" } },
					],
				},
			],
		},
		{
			name: "codCollection",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "expectedAmount",
							type: "number",
							min: 0,
							admin: { width: "33%" },
						},
						{
							name: "collectedBy",
							type: "select",
							options: ["seller", "rider", "courier"].map((value) => ({
								label: value,
								value,
							})),
							admin: { width: "33%" },
						},
						{
							name: "collectedAmount",
							type: "number",
							min: 0,
							admin: { width: "34%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "remittanceStatus",
							type: "select",
							options: [
								"not_applicable",
								"pending",
								"declared_remitted",
								"confirmed",
								"disputed",
							].map((value) => ({ label: value, value })),
							admin: { width: "33%" },
						},
						{
							name: "declaredRemittedAt",
							type: "date",
							admin: { width: "33%" },
						},
						{ name: "confirmedAt", type: "date", admin: { width: "34%" } },
					],
				},
				{ name: "note", type: "text" },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "failureCostBearer",
					type: "select",
					options: ["shop", "reseller", "supplier", "buyer", "none"].map(
						(value) => ({ label: value, value }),
					),
					admin: { width: "33%" },
				},
				{ name: "readyForPickupAt", type: "date", admin: { width: "33%" } },
				{ name: "pickupDeadline", type: "date", admin: { width: "34%" } },
			],
		},
		{
			type: "row",
			fields: [
				{ name: "pickedUpAt", type: "date", admin: { width: "33%" } },
				{ name: "inTransitAt", type: "date", admin: { width: "33%" } },
				{ name: "deliveredAt", type: "date", admin: { width: "34%" } },
			],
		},
		{
			type: "row",
			fields: [
				{ name: "failedAt", type: "date", admin: { width: "33%" } },
				{ name: "returnedAt", type: "date", admin: { width: "33%" } },
				{ name: "cancelledAt", type: "date", admin: { width: "34%" } },
			],
		},
		{ name: "promisedBy", type: "date", index: true },
		{
			name: "flags",
			type: "select",
			hasMany: true,
			options: SHIPMENT_FLAGS.map((value) => ({ label: value, value })),
		},
		{ name: "lastProviderSyncAt", type: "date" },
		{ name: "metadata", type: "json" },
	],
	timestamps: true,
};
