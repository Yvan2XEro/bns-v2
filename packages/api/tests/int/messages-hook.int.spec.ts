import { beforeEach, describe, expect, it } from "vitest";
import { Messages } from "../../src/collections/Messages";
import { fakePayload } from "./helpers/fakePayload";

type Hook = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
const beforeChange = (Messages.hooks?.beforeChange as Hook[])[0];

function seed(over: { shopStatus?: string } = {}) {
	return fakePayload({
		users: [
			{
				id: "u-owner",
				role: "user",
				name: "Aicha",
				email: "aicha@example.com",
			},
			{
				id: "u-staff",
				role: "user",
				name: "Bruno",
				email: "bruno@example.com",
			},
			{
				id: "u-buyer",
				role: "user",
				name: "Clara",
				email: "clara@example.com",
			},
			{ id: "u-other", role: "user", name: "Dede", email: "dede@example.com" },
			{
				id: "u-chat",
				role: "user",
				name: "chat",
				email: "chat@buynsellem.com",
			},
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-owner",
				status: over.shopStatus ?? "active",
				level: 2,
				levelExpiresAt: null,
			},
		],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
				inboxNotifications: "all",
			},
			{
				id: "m-staff",
				shop: "s-1",
				user: "u-staff",
				role: "staff",
				status: "active",
				inboxNotifications: "assigned",
			},
		],
		conversations: [
			{
				id: "c-shop",
				participants: ["u-buyer", "u-owner"],
				shop: "s-1",
				buyer: "u-buyer",
				listing: "l-1",
				inboxStatus: "done",
				awaitingReply: false,
			},
			{
				id: "c-solo",
				participants: ["u-buyer", "u-other"],
				shop: null,
				buyer: null,
				listing: null,
			},
		],
		messages: [],
		"blocked-users": [],
	});
}

const req = (
	payload: ReturnType<typeof seed>,
	user: Record<string, unknown> | null,
) => ({ payload, context: {}, user }) as never;

const asUser = (payload: ReturnType<typeof seed>, id: string) =>
	req(payload, payload.store.users.find((u) => u.id === id) ?? null);

beforeEach(() => {
	process.env.CHAT_SERVICE_EMAIL = "chat@buynsellem.com";
});

describe("sender trust", () => {
	it("ignores a sender named in the body by an ordinary REST caller", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: asUser(payload, "u-buyer"),
			operation: "create",
			data: { conversation: "c-shop", sender: "u-owner", content: "hello" },
		});
		expect(data.sender).toBe("u-buyer");
	});

	it("honours the sender the chat-service account names", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: asUser(payload, "u-chat"),
			operation: "create",
			data: { conversation: "c-shop", sender: "u-buyer", content: "hello" },
		});
		expect(data.sender).toBe("u-buyer");
	});

	it("refuses the chat-service account naming a sender with no access", async () => {
		const payload = seed();
		await expect(
			beforeChange({
				req: asUser(payload, "u-chat"),
				operation: "create",
				data: { conversation: "c-shop", sender: "u-other", content: "hello" },
			}),
		).rejects.toMatchObject({ data: { code: "messages.notParticipant" } });
	});
});

describe("membership", () => {
	it("lets a staff member answer a shop conversation they do not participate in", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: asUser(payload, "u-staff"),
			operation: "create",
			data: { conversation: "c-shop", content: "on arrive" },
		});
		expect(data).toMatchObject({ sender: "u-staff", senderSide: "shop" });
	});

	it("marks a buyer message as the buyer side", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: asUser(payload, "u-buyer"),
			operation: "create",
			data: { conversation: "c-shop", content: "bonjour" },
		});
		expect(data.senderSide).toBe("buyer");
	});

	it("refuses a non-member, non-participant", async () => {
		const payload = seed();
		await expect(
			beforeChange({
				req: asUser(payload, "u-other"),
				operation: "create",
				data: { conversation: "c-shop", content: "coucou" },
			}),
		).rejects.toMatchObject({ data: { code: "messages.notParticipant" } });
	});

	it("refuses a participant-less caller on a classic conversation too", async () => {
		const payload = seed();
		await expect(
			beforeChange({
				req: asUser(payload, "u-staff"),
				operation: "create",
				data: { conversation: "c-solo", content: "coucou" },
			}),
		).rejects.toMatchObject({ data: { code: "messages.notParticipant" } });
	});

	it("leaves senderSide unset on a classic conversation", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: asUser(payload, "u-buyer"),
			operation: "create",
			data: { conversation: "c-solo", content: "bonjour" },
		});
		expect(data.senderSide).toBeUndefined();
	});
});

describe("shop state", () => {
	it("refuses both sides once the shop is suspended", async () => {
		const payload = seed({ shopStatus: "suspended" });
		await expect(
			beforeChange({
				req: asUser(payload, "u-buyer"),
				operation: "create",
				data: { conversation: "c-shop", content: "bonjour" },
			}),
		).rejects.toMatchObject({ data: { code: "shop.inactive" } });
		await expect(
			beforeChange({
				req: asUser(payload, "u-owner"),
				operation: "create",
				data: { conversation: "c-shop", content: "bonjour" },
			}),
		).rejects.toMatchObject({ data: { code: "shop.inactive" } });
	});
});

describe("blocking still applies", () => {
	it("refuses a message between two users where either has blocked the other", async () => {
		const payload = seed();
		payload.store["blocked-users"].push({
			id: "b-1",
			blocker: "u-other",
			blocked: "u-buyer",
		});
		await expect(
			beforeChange({
				req: asUser(payload, "u-buyer"),
				operation: "create",
				data: { conversation: "c-solo", content: "bonjour" },
			}),
		).rejects.toMatchObject({ data: { code: "messages.blocked" } });
	});

	it("does not block a shop conversation on a block between the buyer and a member who is not the owner", async () => {
		const payload = seed();
		payload.store["blocked-users"].push({
			id: "b-2",
			blocker: "u-staff",
			blocked: "u-buyer",
		});
		const data = await beforeChange({
			req: asUser(payload, "u-buyer"),
			operation: "create",
			data: { conversation: "c-shop", content: "bonjour" },
		});
		expect(data.sender).toBe("u-buyer");
	});
});

describe("senderSide and formerMemberAuthor are service-only", () => {
	type FieldAccessFn = (args: unknown) => unknown;
	const fieldAccess = (name: string, operation: "create" | "update") => {
		const field = Messages.fields.find(
			(f) => "name" in f && f.name === name,
		) as { access?: Record<string, FieldAccessFn> };
		return field.access?.[operation] as FieldAccessFn;
	};
	const asBody = (user: Record<string, unknown> | null) => ({ req: { user } });

	// A body-supplied `senderSide` on a classic conversation used to route
	// `afterChange` into the shop branch, which resolves no recipient — the
	// message arrives in the database and nobody is ever notified. Closing
	// the field at this layer is what Payload's own REST handler consults
	// (`beforeValidate`, ahead of this collection's `beforeChange`), so it is
	// the layer that matters; `beforeChange` directly assigning
	// `data.senderSide` for a shop conversation is unaffected, because that
	// assignment happens after field access and does not go through it again.
	it("refuses create and update for an ordinary caller", () => {
		expect(fieldAccess("senderSide", "create")(asBody({ id: "u-buyer" }))).toBe(
			false,
		);
		expect(fieldAccess("senderSide", "update")(asBody({ id: "u-buyer" }))).toBe(
			false,
		);
	});

	// Admin and moderator hold `Messages.access.update` at the collection
	// level, but neither should be able to set these two fields by hand
	// either — only the service paths (`beforeChange`'s own derivation, and
	// account deletion's `overrideAccess` write) may.
	it("refuses create and update for an admin too", () => {
		expect(
			fieldAccess("senderSide", "create")(asBody({ id: "u-admin", role: "admin" })),
		).toBe(false);
		expect(
			fieldAccess("formerMemberAuthor", "update")(
				asBody({ id: "u-admin", role: "admin" }),
			),
		).toBe(false);
	});

	it("leaves senderSide server-derived: a classic conversation ignores a body-supplied value once the REST layer strips it", async () => {
		// Simulates what Payload's `beforeValidate` field access already did
		// before this hook ever ran: an ordinary REST caller's `senderSide`
		// never reaches `data` for a classic conversation, so the hook sees
		// none to preserve and none to derive.
		const payload = seed();
		const data = await beforeChange({
			req: asUser(payload, "u-buyer"),
			operation: "create",
			data: { conversation: "c-solo", content: "bonjour" },
		});
		expect(data.senderSide).toBeUndefined();
	});

	it("still lets the shop-conversation derivation run, unaffected by the field being closed to REST", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: asUser(payload, "u-staff"),
			operation: "create",
			data: { conversation: "c-shop", content: "on arrive" },
		});
		expect(data.senderSide).toBe("shop");
	});
});

describe("Messages.access.read", () => {
	it("adds the caller's inbox shops' conversations to the cached id list", async () => {
		const payload = seed();
		const request = {
			payload,
			context: {},
			user: { id: "u-staff", role: "user" },
		} as never;
		const where = await Messages.access?.read?.({ req: request } as never);
		expect(where).toEqual({ conversation: { in: ["c-shop"] } });
	});

	it("gives a stranger nothing", async () => {
		const payload = seed();
		const request = {
			payload,
			context: {},
			user: { id: "u-nobody", role: "user" },
		} as never;
		expect(await Messages.access?.read?.({ req: request } as never)).toBe(
			false,
		);
	});
});
