// @vitest-environment node
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	PANEL_ACTION_ROUTES,
	PANEL_TRANSITION_TARGET,
	type PanelAction,
	panelActions,
} from "../../../web/src/lib/shipment-panel";
import type { ShipmentStatus } from "../../src/lib/delivery/types";
import { SHIPMENT_TRANSITIONS } from "../../src/services/delivery/shipmentTransitions";

/**
 * The web panel decides which buttons a shipment shows. Every action that
 * changes the status must be one the API's own table allows from that status,
 * and every action must post to a route that exists, so the panel cannot
 * offer a button the API will refuse with `shipment.invalidTransition` or 404.
 */
const STATUSES = Object.keys(SHIPMENT_TRANSITIONS) as ShipmentStatus[];

function* fixtures() {
	for (const status of STATUSES) {
		for (const carrier of ["self", "courier"] as const) {
			for (const method of ["seller_delivery", "courier", "pickup"] as const) {
				for (const readyForPickupAt of [null, "2026-10-09T10:00:00.000Z"]) {
					for (const finalAt of [undefined, "2026-10-09T10:00:00.000Z"]) {
						yield {
							status,
							carrier,
							method,
							readyForPickupAt,
							finalFailure: finalAt ? { at: finalAt } : undefined,
							rider: { name: "Paul", phone: "+237670000000" },
							codCollection: { remittanceStatus: "declared_remitted" as const },
						};
					}
				}
			}
		}
	}
}

describe("the shipment panel against the API's transition table", () => {
	it("offers a status-changing action only from a status that allows its target", () => {
		const checked = new Set<PanelAction>();
		for (const fixture of fixtures()) {
			for (const action of panelActions(fixture, { costsView: true })) {
				if (!(action in PANEL_TRANSITION_TARGET)) continue;
				const target =
					PANEL_TRANSITION_TARGET[
						action as keyof typeof PANEL_TRANSITION_TARGET
					];
				checked.add(action);
				expect(
					SHIPMENT_TRANSITIONS[fixture.status],
					`${action} from ${fixture.status}`,
				).toContain(target);
			}
		}
		expect([...checked].sort()).toEqual(
			Object.keys(PANEL_TRANSITION_TARGET).sort(),
		);
	});

	it("posts every action to a route file that exists", () => {
		const base = path.resolve(
			__dirname,
			"../../src/app/(frontend)/api/shipments/[id]",
		);
		for (const [action, segment] of Object.entries(PANEL_ACTION_ROUTES)) {
			expect(existsSync(path.join(base, segment, "route.ts")), action).toBe(
				true,
			);
		}
	});
});
