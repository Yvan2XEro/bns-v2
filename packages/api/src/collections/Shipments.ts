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
			name: "shipmentNumber",
			type: "text",
			required: true,
			unique: true,
			index: true,
		},
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			required: true,
			index: true,
		},
		{
			name: "storefrontShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "fulfillingShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "items",
			type: "array",
			fields: [
				{
					name: "orderItem",
					type: "relationship",
					relationTo: "order-items",
					required: true,
				},
				{ name: "quantity", type: "number", required: true, min: 1 },
			],
		},
		{
			name: "method",
			type: "select",
			required: true,
			options: ["seller_delivery", "courier", "pickup"].map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "carrier",
			type: "select",
			required: true,
			options: ["self", "courier"].map((value) => ({ label: value, value })),
		},
		{ name: "courier", type: "relationship", relationTo: "couriers" },
		{
			name: "provider",
			type: "select",
			options: ["manual", "yango", "campost"].map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "providerShipmentId", type: "text", index: true },
		{
			name: "providerStatus",
			type: "group",
			fields: [
				{ name: "providerStatus", type: "text" },
				{
					name: "status",
					type: "select",
					options: SHIPMENT_STATUSES.map((value) => ({ label: value, value })),
				},
				{ name: "occurredAt", type: "date" },
				{ name: "providerEventId", type: "text" },
			],
		},
		{ name: "trackingCode", type: "text" },
		{ name: "trackingUrl", type: "text" },
		{ name: "zone", type: "relationship", relationTo: "delivery-zones" },
		{
			name: "pickupLocation",
			type: "relationship",
			relationTo: "shop-locations",
		},
		{ name: "origin", type: "json", required: true },
		{ name: "destination", type: "json", required: true },
		{ name: "fee", type: "number", required: true, min: 0 },
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
		},
		{
			name: "rider",
			type: "group",
			fields: [
				{ name: "user", type: "relationship", relationTo: "users" },
				{ name: "name", type: "text" },
				{ name: "phone", type: "text" },
				{ name: "vehicle", type: "text" },
				{ name: "assignedAt", type: "date" },
				{ name: "assignedBy", type: "relationship", relationTo: "users" },
			],
		},
		{
			name: "riderLink",
			type: "group",
			fields: [
				{ name: "tokenHash", type: "text", access: { read: () => false } },
				{ name: "createdAt", type: "date" },
				{ name: "expiresAt", type: "date" },
				{ name: "revokedAt", type: "date" },
				{ name: "lastUsedAt", type: "date" },
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
				{ name: "number", type: "number", required: true, min: 1 },
				{
					name: "outcome",
					type: "select",
					required: true,
					options: ["delivered", "failed"].map((value) => ({
						label: value,
						value,
					})),
				},
				{
					name: "reason",
					type: "select",
					options: FAILURE_REASONS.map((value) => ({ label: value, value })),
				},
				{ name: "note", type: "text", maxLength: 300 },
				{ name: "gps", type: "group", fields: coordinatesFields },
				{ name: "photo", type: "relationship", relationTo: "delivery-proofs" },
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
				},
				{ name: "actor", type: "relationship", relationTo: "users" },
				{ name: "at", type: "date", required: true },
			],
		},
		{
			name: "finalFailure",
			type: "group",
			fields: [
				{
					name: "reason",
					type: "select",
					options: FAILURE_REASONS.map((value) => ({ label: value, value })),
				},
				{ name: "at", type: "date" },
				{ name: "returnInitiatedAt", type: "date" },
			],
		},
		{
			name: "redelivery",
			type: "group",
			fields: [
				{ name: "scheduledFor", type: "date" },
				{
					name: "window",
					type: "select",
					options: WINDOWS.map((value) => ({ label: value, value })),
				},
				{
					name: "requestedBy",
					type: "select",
					options: ["buyer", "seller"].map((value) => ({
						label: value,
						value,
					})),
				},
				{ name: "rescheduleBy", type: "date" },
				{ name: "note", type: "text", maxLength: 300 },
			],
		},
		{
			name: "proof",
			type: "group",
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
				},
				{ name: "otpVerifiedAt", type: "date" },
				{ name: "photo", type: "relationship", relationTo: "delivery-proofs" },
				{ name: "gps", type: "group", fields: coordinatesFields },
				{ name: "distanceFromDestinationMeters", type: "number", min: 0 },
				{ name: "recipientName", type: "text" },
				{ name: "providerPodUrl", type: "text" },
				{ name: "capturedBy", type: "relationship", relationTo: "users" },
				{ name: "capturedAt", type: "date" },
			],
		},
		{
			name: "codCollection",
			type: "group",
			fields: [
				{ name: "expectedAmount", type: "number", min: 0 },
				{
					name: "collectedBy",
					type: "select",
					options: ["seller", "rider", "courier"].map((value) => ({
						label: value,
						value,
					})),
				},
				{ name: "collectedAmount", type: "number", min: 0 },
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
				},
				{ name: "declaredRemittedAt", type: "date" },
				{ name: "confirmedAt", type: "date" },
				{ name: "note", type: "text" },
			],
		},
		{
			name: "failureCostBearer",
			type: "select",
			options: ["shop", "reseller", "supplier", "buyer", "none"].map(
				(value) => ({ label: value, value }),
			),
		},
		{ name: "readyForPickupAt", type: "date" },
		{ name: "pickupDeadline", type: "date" },
		{ name: "pickedUpAt", type: "date" },
		{ name: "inTransitAt", type: "date" },
		{ name: "deliveredAt", type: "date" },
		{ name: "failedAt", type: "date" },
		{ name: "returnedAt", type: "date" },
		{ name: "cancelledAt", type: "date" },
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
