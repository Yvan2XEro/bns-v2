// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	ORDER_STATUS_LABEL_KEYS as mobileKeys,
	ORDER_STATUSES as mobileStatuses,
	TAB_STATUSES as mobileTabStatuses,
	SHOP_ORDER_TABS as mobileTabs,
} from "../../../mobile/src/lib/orderStatus";
import {
	ORDER_STATUS_LABEL_KEYS as webKeys,
	ORDER_STATUSES as webStatuses,
	TAB_STATUSES as webTabStatuses,
	SHOP_ORDER_TABS as webTabs,
} from "../../../web/src/lib/order-status";
import {
	ORDER_STATUS_LABEL_KEYS,
	ORDER_STATUS_NAMES,
} from "../../src/lib/orderFormat";

/**
 * The order vocabulary is hand-mirrored in both clients (Task 7) for the same
 * reason `shop-permissions-parity.int.spec.ts` gives for the permission
 * matrix: a client importing `lib/orderFormat.ts` directly drags Payload's
 * type surface into a type-check where it does not resolve the same way it
 * does here. This file runs the other direction — API code importing both
 * client mirrors into its own type-check and diffing them against the real
 * source at runtime — so editing only `lib/orderFormat.ts` fails this, not a
 * test that only proves a copy matches itself.
 *
 * The "a tab's statuses are reachable in the transition graph" assertion is
 * deliberately NOT here: it needs `STATUS_TRANSITIONS`, which is Task 8's
 * module. Importing it from this file would make this suite red until Task 8
 * merges — exactly the mistake P3 made between its Tasks 14 and 15 — so that
 * check lives in Task 8's own spec instead.
 */
describe("the order vocabulary is the same in all three packages", () => {
	it("both clients list the API's eleven statuses, in the API's order", () => {
		expect(webStatuses).toEqual(ORDER_STATUS_NAMES);
		expect(mobileStatuses).toEqual(ORDER_STATUS_NAMES);
	});

	it("both clients map every status to the API's label keys", () => {
		expect(webKeys).toEqual(ORDER_STATUS_LABEL_KEYS);
		expect(mobileKeys).toEqual(ORDER_STATUS_LABEL_KEYS);
	});

	it("both clients' tabs cover the same statuses", () => {
		expect(webTabs).toEqual(mobileTabs);
		expect(webTabStatuses).toEqual(mobileTabStatuses);
	});
});
