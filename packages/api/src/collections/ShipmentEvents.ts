import type { CollectionConfig } from "payload";
import { serviceOnly } from "../access/caseRoles";
import { staffOnly } from "../access/staff";

export const SHIPMENT_EVENT_TYPES = [
	"shipment.created",
	"shipment.carrier_set",
	"shipment.rider_assigned",
	"shipment.rider_link_created",
	"shipment.rider_link_revoked",
	"shipment.ready_for_pickup",
	"shipment.picked_up",
	"shipment.in_transit",
	"shipment.attempt_failed",
	"shipment.rescheduled",
	"shipment.redelivery_started",
	"shipment.delivered",
	"shipment.failed_final",
	"shipment.return_initiated",
	"shipment.returned",
	"shipment.cancelled",
	"shipment.provider_status",
	"shipment.cod_remittance_declared",
	"shipment.cod_remittance_confirmed",
	"shipment.cod_remittance_disputed",
	"shipment.rider_phone_revealed",
] as const;

export const ShipmentEvents: CollectionConfig = {
	slug: "shipment-events",
	admin: {
		useAsTitle: "type",
		defaultColumns: ["shipment", "type", "visibility", "occurredAt"],
	},
	access: {
		read: staffOnly,
		create: serviceOnly,
		update: serviceOnly,
		delete: serviceOnly,
	},
	indexes: [
		{ fields: ["shipment", "occurredAt"] },
		{ fields: ["order", "occurredAt"] },
	],
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "shipment",
					type: "relationship",
					relationTo: "shipments",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "type",
					type: "select",
					required: true,
					index: true,
					options: SHIPMENT_EVENT_TYPES.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%" },
				},
				{ name: "statusFrom", type: "text", admin: { width: "33%" } },
				{ name: "statusTo", type: "text", admin: { width: "34%" } },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "actorType",
					type: "select",
					options: [
						"seller",
						"rider",
						"rider_link",
						"dispatcher",
						"courier_webhook",
						"courier_poll",
						"staff",
						"buyer",
						"system",
					].map((value) => ({ label: value, value })),
					admin: { width: "33%" },
				},
				{
					name: "actor",
					type: "relationship",
					relationTo: "users",
					admin: { width: "33%" },
				},
				{ name: "providerEventId", type: "text", admin: { width: "34%" } },
			],
		},
		{
			name: "webhookEvent",
			type: "relationship",
			relationTo: "webhook-events",
		},
		{
			name: "gps",
			type: "group",
			fields: [
				{ name: "lat", type: "number" },
				{ name: "lng", type: "number" },
				{ name: "accuracyMeters", type: "number" },
			],
		},
		{ name: "note", type: "text", maxLength: 1000 },
		{ name: "metadata", type: "json" },
		{
			type: "row",
			fields: [
				{
					name: "visibility",
					type: "select",
					required: true,
					options: ["buyer", "shop", "courier", "both", "staff"].map(
						(value) => ({
							label: value,
							value,
						}),
					),
					admin: { width: "50%" },
				},
				{
					name: "occurredAt",
					type: "date",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
			],
		},
	],
	timestamps: true,
};
