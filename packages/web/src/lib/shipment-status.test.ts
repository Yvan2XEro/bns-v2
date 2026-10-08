import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import {
	DELIVERY_HINT_LABELS,
	FAILURE_REASON_LABELS,
	READY_FOR_PICKUP_LABELS,
	SHIPMENT_STATUS_LABELS,
	shipmentStatusLabel,
	WINDOW_LABELS,
} from "./shipment-status";

type Json = { [key: string]: Json | string };

function leaf(node: Json, path: string): string | undefined {
	const value = path
		.split(".")
		.reduce<Json | string | undefined>(
			(acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined),
			node,
		);
	return typeof value === "string" ? value : undefined;
}

const ENGLISH = en.Delivery;
const FRENCH = fr.Delivery;

/** A key is a path from the root of the locale file (mobile) or of the namespace (web). */
function pathOf(key: string): string {
	return key;
}

const MAPS: ReadonlyArray<{
	name: string;
	map: Readonly<Record<string, string>>;
}> = [
	{ name: "buyer statuses", map: SHIPMENT_STATUS_LABELS.buyer },
	{ name: "seller statuses", map: SHIPMENT_STATUS_LABELS.seller },
	{ name: "failure reasons", map: FAILURE_REASON_LABELS },
	{ name: "windows", map: WINDOW_LABELS },
	{ name: "ready for pickup", map: READY_FOR_PICKUP_LABELS },
	{ name: "hints", map: DELIVERY_HINT_LABELS },
];

describe("the shipment vocabulary resolves in both languages", () => {
	for (const { name, map } of MAPS) {
		test(`every ${name} key is a non-empty string in en and fr`, () => {
			for (const key of Object.values(map)) {
				expect(key.length).toBeGreaterThan(0);
				expect(leaf(ENGLISH, pathOf(key))?.length).toBeGreaterThan(0);
				expect(leaf(FRENCH, pathOf(key))?.length).toBeGreaterThan(0);
			}
		});
	}

	test("the labelled statuses and reasons are the API's seven and eight", () => {
		expect(Object.keys(SHIPMENT_STATUS_LABELS.buyer)).toHaveLength(7);
		expect(Object.keys(SHIPMENT_STATUS_LABELS.seller)).toHaveLength(7);
		expect(Object.keys(FAILURE_REASON_LABELS)).toHaveLength(8);
		expect(Object.keys(WINDOW_LABELS)).toHaveLength(3);
	});

	test("the audiences read the same shipment differently", () => {
		expect(leaf(ENGLISH, pathOf(SHIPMENT_STATUS_LABELS.buyer.returned))).toBe(
			"Returned to seller",
		);
		expect(leaf(ENGLISH, pathOf(SHIPMENT_STATUS_LABELS.seller.returned))).toBe(
			"Back at the shop",
		);
		expect(leaf(FRENCH, pathOf(SHIPMENT_STATUS_LABELS.buyer.returned))).toBe(
			"Retournée au vendeur",
		);
		expect(leaf(FRENCH, pathOf(SHIPMENT_STATUS_LABELS.seller.returned))).toBe(
			"Revenue en boutique",
		);
	});

	test("only a pending shipment awaiting collection reads as ready", () => {
		expect(shipmentStatusLabel("buyer", "pending", true)).toBe(
			READY_FOR_PICKUP_LABELS.buyer,
		);
		expect(shipmentStatusLabel("seller", "pending", true)).toBe(
			READY_FOR_PICKUP_LABELS.seller,
		);
		expect(shipmentStatusLabel("buyer", "pending")).toBe(
			SHIPMENT_STATUS_LABELS.buyer.pending,
		);
		expect(shipmentStatusLabel("buyer", "in_transit", true)).toBe(
			SHIPMENT_STATUS_LABELS.buyer.in_transit,
		);
	});
});
