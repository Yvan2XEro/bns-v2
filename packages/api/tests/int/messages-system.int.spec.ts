import { describe, expect, it } from "vitest";
import { Messages } from "../../src/collections/Messages";
import { runBeforeChange } from "./helpers/runBeforeChange";

describe("system messages", () => {
	it("refuses kind: system from a request without the order-service flag", async () => {
		await expect(
			runBeforeChange(Messages, {
				data: { conversation: "c-1", content: "x", kind: "system" },
				req: { user: { id: "u-1" }, context: {} },
				operation: "create",
			}),
		).rejects.toMatchObject({ status: 403 });
	});

	it("refuses kind: system even for an admin acting without the flag", async () => {
		// The field cannot be rescued by rank: only the order service's own
		// `req.context.orderService` lets it through, not an elevated role.
		await expect(
			runBeforeChange(Messages, {
				data: { conversation: "c-1", content: "x", kind: "system" },
				req: { user: { id: "u-admin", role: "admin" }, context: {} },
				operation: "create",
			}),
		).rejects.toMatchObject({ status: 403 });
	});

	it("accepts kind: system with no sender from the order service", async () => {
		const data = await runBeforeChange(Messages, {
			data: {
				conversation: "c-1",
				content: "Commande BNS-2609-000123 passee",
				kind: "system",
				systemEvent: "order.placed",
			},
			req: { user: null, context: { orderService: true } },
			operation: "create",
		});
		expect(data.kind).toBe("system");
		expect(data.sender ?? null).toBeNull();
		expect(data.systemEvent).toBe("order.placed");
	});

	it("still requires a sender for a user message", async () => {
		const field = Messages.fields.find(
			(f) => "name" in f && f.name === "sender",
		) as { validate?: (value: unknown, options: unknown) => unknown };
		expect(field.validate?.(undefined, { siblingData: { kind: "user" } })).toBe(
			"A sender is required.",
		);
		expect(field.validate?.(undefined, { siblingData: {} })).toBe(
			"A sender is required.",
		);
		expect(field.validate?.("u-1", { siblingData: { kind: "user" } })).toBe(
			true,
		);
		expect(
			field.validate?.(undefined, { siblingData: { kind: "system" } }),
		).toBe(true);
	});

	it("only create is guarded: a non-create operation passes kind straight through", async () => {
		const data = await runBeforeChange(Messages, {
			data: { kind: "system" },
			req: { user: { id: "u-1" }, context: {} },
			operation: "update",
		});
		expect(data.kind).toBe("system");
	});
});
