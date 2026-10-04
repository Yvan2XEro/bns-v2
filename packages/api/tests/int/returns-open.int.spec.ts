// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RETURN_CASE_STATUSES } from "../../src/collections/ReturnCases";
import { ERROR_CODES } from "../../src/lib/errors";
import { ServiceError } from "../../src/lib/serviceError";
import { withTransaction } from "../../src/lib/transactions";
import type { ReturnCase } from "../../src/payload-types";
import {
	assertReturnTransition,
	moveCase,
	RETURN_TRANSITIONS,
} from "../../src/services/returns";
import { fakePayload } from "./helpers/fakePayload";

describe("return case transitions", () => {
	it("declares a transition row for every stored status", () => {
		expect(Object.keys(RETURN_TRANSITIONS).sort()).toEqual(
			[...RETURN_CASE_STATUSES].sort(),
		);
	});

	it("allows each specified transition and refuses every other pair", () => {
		let allowed = 0;
		let refused = 0;
		for (const from of RETURN_CASE_STATUSES) {
			for (const to of RETURN_CASE_STATUSES) {
				if (RETURN_TRANSITIONS[from].includes(to)) {
					assertReturnTransition(from, to);
					allowed += 1;
					continue;
				}
				try {
					assertReturnTransition(from, to);
				} catch (error) {
					if (
						error instanceof ServiceError &&
						error.code === ERROR_CODES.returnInvalidTransition
					) {
						refused += 1;
						continue;
					}
					throw error;
				}
				throw new Error(`unexpected allowed transition: ${from} -> ${to}`);
			}
		}
		expect(allowed).toBe(16);
		expect(refused).toBe(13 * 13 - 16);
	});

	it("writes a transition and appends its actor to the history", async () => {
		const kase: ReturnCase = {
			id: "ret-1",
			number: "RET-1",
			basis: "withdrawal",
			order: "order-1",
			shop: "shop-1",
			buyer: "buyer-1",
			openedByType: "buyer",
			status: "requested",
			statusHistory: [
				{ status: "requested", actorType: "buyer", actor: "buyer-1" },
			],
			createdAt: "2026-10-04T00:00:00.000Z",
			updatedAt: "2026-10-04T00:00:00.000Z",
		};
		const payload = fakePayload({
			"return-cases": [
				{
					id: kase.id,
					number: kase.number,
					basis: kase.basis,
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "requested",
					statusHistory: [
						{ status: "requested", actorType: "buyer", actor: "buyer-1" },
					],
				},
			],
		});
		const updated = await withTransaction(payload, (req) =>
			moveCase(req, kase, "approved", {
				actorType: "system",
				note: "eligible",
			}),
		);
		expect(updated.status).toBe("approved");
		expect(updated.statusHistory).toHaveLength(2);
		expect(updated.statusHistory?.[1]).toMatchObject({
			status: "approved",
			actorType: "system",
			note: "eligible",
		});
	});
});
