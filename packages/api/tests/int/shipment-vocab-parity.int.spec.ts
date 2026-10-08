// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mobile from "../../../mobile/src/lib/shipmentStatus";
import mobileEn from "../../../mobile/src/locales/en.json";
import mobileFr from "../../../mobile/src/locales/fr.json";
import webEn from "../../../web/messages/en.json";
import webFr from "../../../web/messages/fr.json";
import * as web from "../../../web/src/lib/shipment-status";
import type { DeliveryWindow } from "../../src/lib/delivery/eta";
import type {
	FailureReason,
	ShipmentStatus,
} from "../../src/lib/delivery/types";

/**
 * The shipment vocabulary is hand-mirrored in both clients, the split
 * `payment-vocab-parity.int.spec.ts` makes: each client's own test can only
 * check itself, so this file imports both and holds them to the backend's
 * enums and to each other, cell for cell. Mobile calls `t()` without a
 * namespace, so its keys carry `delivery.`; web's are relative to `Delivery`.
 */

type KeyMap = Readonly<Record<string, string>>;

/**
 * `Record<T, true>` makes the compiler hold each list to the API's own union:
 * a value added server-side is a missing property here, a value removed is an
 * excess one, under `check-types:tests`, before any assertion runs.
 */
function keysOf<T extends string>(record: Record<T, true>): string[] {
	return Object.keys(record);
}

/** Every cell where the two clients disagree, named, so a failure says which. */
function divergentCells(
	webMap: KeyMap,
	mobileMap: KeyMap,
	mobilePrefix: string,
): string[] {
	const values = new Set([...Object.keys(webMap), ...Object.keys(mobileMap)]);
	return [...values]
		.filter((value) => mobileMap[value] !== `${mobilePrefix}${webMap[value]}`)
		.map(
			(value) =>
				`${value}: web ${String(webMap[value])}, mobile ${String(mobileMap[value])}`,
		)
		.sort();
}

type Tree = { [key: string]: Tree | string };

function leaves(node: Tree, prefix = ""): Array<[string, string]> {
	return Object.entries(node).flatMap(([key, value]) =>
		typeof value === "string"
			? [[`${prefix}${key}`, value] as [string, string]]
			: leaves(value, `${prefix}${key}.`),
	);
}

const toMobileBraces = (value: string) => value.replace(/\{(\w+)\}/g, "{{$1}}");

const API_STATUSES = keysOf<ShipmentStatus>({
	pending: true,
	picked_up: true,
	in_transit: true,
	delivered: true,
	failed: true,
	returned: true,
	cancelled: true,
});

const API_FAILURE_REASONS = keysOf<FailureReason>({
	refused: true,
	absent: true,
	unreachable: true,
	address_not_found: true,
	rescheduled_by_buyer: true,
	not_collected: true,
	damaged: true,
	other: true,
});

const API_WINDOWS = keysOf<DeliveryWindow>({
	morning: true,
	afternoon: true,
	evening: true,
});

const AUDIENCES = ["buyer", "seller"];
// The quote's two hint sentences are not an enum: `UnavailableOption.reason`
// also carries cod_not_allowed and not_served, which the checkout words itself.
const HINTS = ["freeAbove", "minimum"];

const MAPS: ReadonlyArray<{
	name: string;
	web: KeyMap;
	mobile: KeyMap;
	values: readonly string[];
}> = [
	{
		name: "SHIPMENT_STATUS_LABELS.buyer",
		web: web.SHIPMENT_STATUS_LABELS.buyer,
		mobile: mobile.SHIPMENT_STATUS_LABELS.buyer,
		values: API_STATUSES,
	},
	{
		name: "SHIPMENT_STATUS_LABELS.seller",
		web: web.SHIPMENT_STATUS_LABELS.seller,
		mobile: mobile.SHIPMENT_STATUS_LABELS.seller,
		values: API_STATUSES,
	},
	{
		name: "READY_FOR_PICKUP_LABELS",
		web: web.READY_FOR_PICKUP_LABELS,
		mobile: mobile.READY_FOR_PICKUP_LABELS,
		values: AUDIENCES,
	},
	{
		name: "FAILURE_REASON_LABELS",
		web: web.FAILURE_REASON_LABELS,
		mobile: mobile.FAILURE_REASON_LABELS,
		values: API_FAILURE_REASONS,
	},
	{
		name: "WINDOW_LABELS",
		web: web.WINDOW_LABELS,
		mobile: mobile.WINDOW_LABELS,
		values: API_WINDOWS,
	},
	{
		name: "DELIVERY_HINT_LABELS",
		web: web.DELIVERY_HINT_LABELS,
		mobile: mobile.DELIVERY_HINT_LABELS,
		values: HINTS,
	},
];

const MOBILE_PREFIX = "delivery.";

const webNs: Record<"en" | "fr", Tree> = {
	en: webEn.Delivery,
	fr: webFr.Delivery,
};
const mobileNs: Record<"en" | "fr", Tree> = {
	en: mobileEn.delivery,
	fr: mobileFr.delivery,
};

describe("each client's shipment vocabulary covers the backend's enums", () => {
	for (const { name, web: webMap, mobile: mobileMap, values } of MAPS) {
		it(`${name} labels exactly the values the API can send`, () => {
			expect(values.length).toBeGreaterThan(1);
			expect(Object.keys(webMap).sort()).toEqual([...values].sort());
			expect(Object.keys(mobileMap).sort()).toEqual([...values].sort());
		});
	}
});

describe("the two clients' shipment vocabularies are the same table", () => {
	for (const { name, web: webMap, mobile: mobileMap, values } of MAPS) {
		it(`${name} agrees cell for cell`, () => {
			expect(divergentCells(webMap, mobileMap, MOBILE_PREFIX)).toEqual([]);
			expect(Object.keys(webMap)).toHaveLength(values.length);
		});
	}

	it("covers 29 key cells across the six maps", () => {
		// 7 + 7 buyer/seller statuses, 2 ready-for-pickup, 8 failure reasons,
		// 3 windows, 2 hints.
		expect(MAPS.reduce((sum, map) => sum + map.values.length, 0)).toBe(29);
	});

	it("words `returned` differently for the buyer and the seller", () => {
		expect(webNs.en.statusBuyer).toMatchObject({
			returned: "Returned to seller",
		});
		expect(webNs.en.statusSeller).toMatchObject({
			returned: "Back at the shop",
		});
		expect(webNs.fr.statusBuyer).toMatchObject({
			returned: "Retournée au vendeur",
		});
		expect(webNs.fr.statusSeller).toMatchObject({
			returned: "Revenue en boutique",
		});
	});
});

describe("the delivery copy is the same on web and mobile", () => {
	for (const lang of ["en", "fr"] as const) {
		it(`every ${lang} string matches, modulo each library's placeholder braces`, () => {
			const webStrings = new Map(leaves(webNs[lang]));
			const mobileStrings = new Map(leaves(mobileNs[lang]));
			expect([...mobileStrings.keys()].sort()).toEqual(
				[...webStrings.keys()].sort(),
			);
			const differing = [...webStrings]
				.filter(
					([key, value]) => mobileStrings.get(key) !== toMobileBraces(value),
				)
				.map(([key]) => key);
			expect(differing).toEqual([]);
			// 29 map cells (see above) plus nothing else: the namespace holds the
			// vocabulary and the two hint sentences, no screen copy yet. A screen
			// string added to one client without its mirror fails the key-set
			// comparison above before this count moves.
			expect(webStrings.size).toBe(29);
		});
	}
});
