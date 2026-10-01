import { describe, expect, it } from "vitest";
import {
	INBOX_NOTIFICATION_PREFERENCES,
	SHOP_MEMBER_REVOKE_REASONS,
	ShopMembers,
} from "../../src/collections/ShopMembers";
import { isUniqueViolation } from "../../src/services/shops";
import { fakePayload } from "./helpers/fakePayload";

type Field = {
	name?: string;
	type?: string;
	options?: Array<{ value: string }>;
	relationTo?: string;
	access?: { read?: (args: unknown) => unknown };
	defaultValue?: unknown;
};

const fields = ShopMembers.fields as Field[];
const field = (name: string) => fields.find((f) => f.name === name);

describe("shop-members fields", () => {
	it("carries the invitation that created or reactivated the row", () => {
		expect(field("invitation")).toMatchObject({
			type: "relationship",
			relationTo: "shop-invitations",
		});
	});

	it("carries the join and revocation stamps", () => {
		expect(field("joinedAt")?.type).toBe("date");
		expect(field("revokedAt")?.type).toBe("date");
		expect(field("revokedBy")).toMatchObject({
			type: "relationship",
			relationTo: "users",
		});
	});

	it("names the four revocation reasons", () => {
		expect(field("revokedReason")?.options?.map((o) => o.value)).toEqual([
			"removed",
			"left",
			"shop_closed",
			"account_deleted",
		]);
		expect([...SHOP_MEMBER_REVOKE_REASONS]).toEqual([
			"removed",
			"left",
			"shop_closed",
			"account_deleted",
		]);
	});

	it("offers the three inbox notification preferences", () => {
		expect(field("inboxNotifications")?.options?.map((o) => o.value)).toEqual([
			"all",
			"assigned",
			"none",
		]);
		expect([...INBOX_NOTIFICATION_PREFERENCES]).toEqual([
			"all",
			"assigned",
			"none",
		]);
	});

	it("keeps writes closed to every request", () => {
		const admin = { req: { user: { id: "u-admin", role: "admin" } } } as never;
		expect(ShopMembers.access?.create?.(admin)).toBe(false);
		expect(ShopMembers.access?.update?.(admin)).toBe(false);
		expect(ShopMembers.access?.delete?.(admin)).toBe(false);
	});

	it("keeps the (shop, user) unique index", () => {
		expect(ShopMembers.indexes).toEqual([
			{ fields: ["shop", "user"], unique: true },
		]);
	});
});

describe("reactivation, not duplication", () => {
	it("refuses a second (shop, user) row rather than creating a duplicate", async () => {
		const payload = fakePayload(
			{
				"shop-members": [
					{
						id: "m-1",
						shop: "s-1",
						user: "u-staff",
						role: "staff",
						status: "revoked",
						joinedAt: "2026-01-01T00:00:00.000Z",
						inboxNotifications: "all",
					},
				],
			},
			{ uniques: { "shop-members": [["shop", "user"]] } },
		);

		await expect(
			payload.create({
				collection: "shop-members",
				data: {
					shop: "s-1",
					user: "u-staff",
					role: "manager",
					status: "active",
					joinedAt: new Date().toISOString(),
					inboxNotifications: "all",
				},
			}),
		).rejects.toSatisfy((error: unknown) => isUniqueViolation(error));
	});
});

describe("read access", () => {
	const args = (userId: string | null, role = "user") => {
		const user = userId ? { id: userId, role } : null;
		return {
			req: {
				user,
				context: {},
				payload: {
					find: async ({ collection }: { collection: string }) =>
						collection === "shop-members"
							? {
									docs: [
										{
											id: "m-1",
											shop: "s-1",
											user: "u-staff",
											role: "staff",
											status: "active",
										},
									],
								}
							: { docs: [] },
					findByID: async ({ collection }: { collection: string }) =>
						collection === "shops"
							? { id: "s-1", status: "active", level: 2, levelExpiresAt: null }
							: { id: "u-staff", suspendedAt: null, suspendedUntil: null },
				},
			},
		} as never;
	};

	it("refuses an anonymous reader", async () => {
		expect(await ShopMembers.access?.read?.(args(null))).toBe(false);
	});

	it("lets a moderator read everything", async () => {
		expect(await ShopMembers.access?.read?.(args("u-mod", "moderator"))).toBe(
			true,
		);
	});

	it("scopes a member to their own row plus every row of their shops", async () => {
		const where = await ShopMembers.access?.read?.(args("u-staff"));
		expect(where).toEqual({
			or: [{ user: { equals: "u-staff" } }, { shop: { in: ["s-1"] } }],
		});
	});

	it("falls back to the own-row-only scope when the caller holds no team.view shop", async () => {
		const noShops = {
			req: {
				user: { id: "u-lone", role: "user" },
				context: {},
				payload: {
					find: async () => ({ docs: [] }),
					findByID: async ({ collection }: { collection: string }) =>
						collection === "shops"
							? { id: "s-1", status: "active", level: 2, levelExpiresAt: null }
							: { id: "u-lone", suspendedAt: null, suspendedUntil: null },
				},
			},
		} as never;
		expect(await ShopMembers.access?.read?.(noShops)).toEqual({
			user: { equals: "u-lone" },
		});
	});
});

describe("revokedBy is hidden from ordinary members", () => {
	it("is readable by a moderator and by nobody else", async () => {
		const read = field("revokedBy")?.access?.read;
		expect(
			await read?.({ req: { user: { id: "u-mod", role: "moderator" } } }),
		).toBe(true);
		expect(
			await read?.({ req: { user: { id: "u-staff", role: "user" } } }),
		).toBe(false);
		expect(await read?.({ req: { user: null } })).toBe(false);
	});
});

describe("inboxNotifications is not a public field", () => {
	const read = field("inboxNotifications")?.access?.read;
	const args = (role: string) =>
		({
			req: {
				user: { id: "u-x", role: "user" },
				context: {},
				payload: {
					find: async () => ({ docs: [{ role, status: "active" }] }),
					findByID: async ({ collection }: { collection: string }) =>
						collection === "shops"
							? { id: "s-1", status: "active", level: 2, levelExpiresAt: null }
							: { id: "u-x", suspendedAt: null, suspendedUntil: null },
				},
			},
			doc: { shop: "s-1" },
		}) as never;

	it("is readable by a manager of the shop and not by a staff member", async () => {
		expect(await read?.(args("manager"))).toBe(true);
		expect(await read?.(args("staff"))).toBe(false);
	});

	it("is readable by the owner of the shop", async () => {
		expect(await read?.(args("owner"))).toBe(true);
	});

	it("is readable by a global moderator regardless of shop role", async () => {
		expect(
			await read?.({
				req: { user: { id: "u-mod", role: "moderator" } },
			} as never),
		).toBe(true);
	});

	it("refuses an anonymous reader", async () => {
		expect(await read?.({ req: { user: null } } as never)).toBe(false);
	});
});
