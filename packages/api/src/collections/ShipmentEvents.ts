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
			name: "shipment",
			type: "relationship",
			relationTo: "shipments",
			required: true,
			index: true,
		},
		{ name: "order", type: "relationship", relationTo: "orders", index: true },
		{
			name: "type",
			type: "select",
			required: true,
			index: true,
			options: SHIPMENT_EVENT_TYPES.map((value) => ({ label: value, value })),
		},
		{ name: "statusFrom", type: "text" },
		{ name: "statusTo", type: "text" },
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
		},
		{ name: "actor", type: "relationship", relationTo: "users" },
		{ name: "providerEventId", type: "text" },
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
			name: "visibility",
			type: "select",
			required: true,
			options: ["buyer", "shop", "courier", "both", "staff"].map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "occurredAt", type: "date", required: true, index: true },
	],
	timestamps: true,
};
