import type { Payload } from "payload";
import { beforeEach, describe, expect, it } from "vitest";
import {
	approveListing,
	decideReport,
	ModerationError,
	rejectListing,
	suspendUser,
	unsuspendUser,
} from "../../src/services/moderation";

type Doc = Record<string, any>;

/**
 * In-memory stand-in for the Payload local API. Only the handful of methods
 * the moderation service calls are implemented, which keeps the tests about
 * the moderation rules rather than about Payload.
 */
function fakePayload(seed: Record<string, Doc[]>) {
	const store: Record<string, Doc[]> = {
		listings: [],
		users: [],
		reports: [],
		"moderation-log": [],
		...seed,
	};
	let logSeq = 0;

	const matches = (doc: Doc, where: any): boolean => {
		if (!where) return true;
		if (where.and) return where.and.every((w: any) => matches(doc, w));
		if (where.or) return where.or.some((w: any) => matches(doc, w));
		return Object.entries(where).every(([field, cond]: [string, any]) => {
			const value = doc[field];
			if ("equals" in cond) return String(value) === String(cond.equals);
			if ("in" in cond) return cond.in.map(String).includes(String(value));
			return true;
		});
	};

	const payload = {
		store,
		async findByID({ collection, id }: any) {
			const doc = store[collection]?.find((d) => String(d.id) === String(id));
			if (!doc) throw new Error("not found");
			return { ...doc };
		},
		async find({ collection, where, sort }: any) {
			let docs = (store[collection] ?? []).filter((d) => matches(d, where));
			if (sort === "-createdAt") {
				docs = [...docs].sort(
					(a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
				);
			}
			return { docs: docs.map((d) => ({ ...d })), totalDocs: docs.length };
		},
		async update({ collection, id, data }: any) {
			const doc = store[collection]?.find((d) => String(d.id) === String(id));
			if (!doc) throw new Error("not found");
			Object.assign(doc, data);
			return { ...doc };
		},
		async create({ collection, data }: any) {
			const doc = {
				id: `${collection}-${++logSeq}`,
				createdAt: logSeq,
				...data,
			};
			store[collection] = store[collection] ?? [];
			store[collection].push(doc);
			return { ...doc };
		},
	};

	return payload as unknown as Payload & { store: Record<string, Doc[]> };
}

const MOD = { id: "mod-1", role: "moderator" };
const ADMIN = { id: "admin-1", role: "admin" };

const logs = (p: any) => p.store["moderation-log"] as Doc[];

describe("listing moderation", () => {
	let payload: any;

	beforeEach(() => {
		payload = fakePayload({
			listings: [
				{ id: "l-pending", status: "pending", title: "A", seller: "u-1" },
				{ id: "l-live", status: "published", title: "B", seller: "u-1" },
			],
		});
	});

	it("approves a pending listing and clears any old rejection reason", async () => {
		await approveListing(payload, MOD, "l-pending");
		const listing = payload.store.listings.find(
			(l: Doc) => l.id === "l-pending",
		);
		expect(listing.status).toBe("published");
		expect(listing.rejectionReason).toBeNull();
	});

	it("refuses to approve a listing that is already published", async () => {
		await expect(approveListing(payload, MOD, "l-live")).rejects.toBeInstanceOf(
			ModerationError,
		);
	});

	it("refuses a rejection with no reason", async () => {
		await expect(
			rejectListing(payload, MOD, "l-pending", "   "),
		).rejects.toMatchObject({ code: "moderation.reasonRequired" });
	});

	it("logs a pending rejection as a reject", async () => {
		await rejectListing(payload, MOD, "l-pending", "Counterfeit goods");
		expect(logs(payload)[0]).toMatchObject({
			action: "listing.reject",
			targetType: "listing",
			targetId: "l-pending",
			reason: "Counterfeit goods",
		});
	});

	it("logs pulling a live listing as a takedown, not a reject", async () => {
		await rejectListing(payload, MOD, "l-live", "Reported as a scam");
		expect(logs(payload)[0]).toMatchObject({
			action: "listing.takedown",
			metadata: { previousStatus: "published" },
		});
	});

	it("rejects a plain user outright", async () => {
		await expect(
			approveListing(payload, { id: "u-9", role: "user" }, "l-pending"),
		).rejects.toMatchObject({ code: "moderation.forbidden" });
	});

	it("reports a missing listing as not found", async () => {
		await expect(approveListing(payload, MOD, "nope")).rejects.toMatchObject({
			status: 404,
		});
	});
});

describe("user suspension", () => {
	let payload: any;

	beforeEach(() => {
		payload = fakePayload({
			users: [
				{ id: "u-1", role: "user", name: "Seller" },
				{ id: "mod-2", role: "moderator", name: "Colleague" },
				{ id: "admin-1", role: "admin", name: "Boss" },
			],
			listings: [
				{ id: "l-1", status: "published", seller: "u-1" },
				{ id: "l-2", status: "published", seller: "u-1" },
				{ id: "l-3", status: "sold", seller: "u-1" },
				{ id: "l-other", status: "published", seller: "u-2" },
			],
		});
	});

	it("takes the account's published listings down and records which ones", async () => {
		const result = await suspendUser(payload, MOD, "u-1", {
			reason: "fraud",
			durationDays: 7,
		});

		expect(result.unpublishedListingIds.sort()).toEqual(["l-1", "l-2"]);
		expect(
			payload.store.listings.filter((l: Doc) => l.status === "draft").length,
		).toBe(2);
	});

	it("leaves listings that were not published alone", async () => {
		await suspendUser(payload, MOD, "u-1", {
			reason: "fraud",
			durationDays: 7,
		});
		expect(payload.store.listings.find((l: Doc) => l.id === "l-3").status).toBe(
			"sold",
		);
	});

	it("never touches another seller's listings", async () => {
		await suspendUser(payload, MOD, "u-1", {
			reason: "fraud",
			durationDays: 7,
		});
		expect(
			payload.store.listings.find((l: Doc) => l.id === "l-other").status,
		).toBe("published");
	});

	it("stores who suspended, why and until when", async () => {
		await suspendUser(payload, MOD, "u-1", {
			reason: "harassment",
			durationDays: 7,
			note: "Third complaint",
		});
		const user = payload.store.users.find((u: Doc) => u.id === "u-1");
		expect(user.suspendedBy).toBe("mod-1");
		expect(user.suspendedReason).toBe("harassment");
		expect(user.suspendedNote).toBe("Third complaint");
		expect(user.suspendedAt).toBeTruthy();
		expect(user.suspendedUntil).toBeTruthy();
	});

	it("refuses a reason outside the agreed taxonomy", async () => {
		await expect(
			suspendUser(payload, MOD, "u-1", {
				reason: "because I said so",
				durationDays: 7,
			}),
		).rejects.toMatchObject({ code: "moderation.reasonRequired" });
	});

	it("stops a moderator suspending another moderator", async () => {
		await expect(
			suspendUser(payload, MOD, "mod-2", { reason: "spam", durationDays: 7 }),
		).rejects.toMatchObject({ code: "moderation.rankTooLow" });
	});

	it("stops a moderator suspending an admin", async () => {
		await expect(
			suspendUser(payload, MOD, "admin-1", { reason: "spam", durationDays: 7 }),
		).rejects.toMatchObject({ code: "moderation.rankTooLow" });
	});

	it("stops anyone suspending themselves", async () => {
		await expect(
			suspendUser(payload, ADMIN, "admin-1", {
				reason: "spam",
				durationDays: 7,
			}),
		).rejects.toMatchObject({ code: "moderation.rankTooLow" });
	});

	it("stops a moderator handing out an indefinite suspension", async () => {
		await expect(
			suspendUser(payload, MOD, "u-1", { reason: "fraud", durationDays: null }),
		).rejects.toMatchObject({ code: "moderation.durationInvalid" });
	});

	it("stops a moderator exceeding the 30-day cap", async () => {
		await expect(
			suspendUser(payload, MOD, "u-1", { reason: "fraud", durationDays: 90 }),
		).rejects.toMatchObject({ code: "moderation.durationInvalid" });
	});

	it("lets an admin suspend indefinitely", async () => {
		const result = await suspendUser(payload, ADMIN, "u-1", {
			reason: "fraud",
			durationDays: null,
		});
		expect(result.until).toBeNull();
	});

	it("lets an admin suspend a moderator", async () => {
		await expect(
			suspendUser(payload, ADMIN, "mod-2", { reason: "spam", durationDays: 7 }),
		).resolves.toBeTruthy();
	});
});

describe("lifting a suspension", () => {
	let payload: any;

	beforeEach(async () => {
		payload = fakePayload({
			users: [{ id: "u-1", role: "user" }],
			listings: [
				{ id: "l-1", status: "published", seller: "u-1" },
				{ id: "l-2", status: "published", seller: "u-1" },
			],
		});
		await suspendUser(payload, MOD, "u-1", {
			reason: "fraud",
			durationDays: 7,
		});
	});

	it("clears every suspension field", async () => {
		await unsuspendUser(payload, MOD, "u-1");
		const user = payload.store.users.find((u: Doc) => u.id === "u-1");
		expect(user.suspendedAt).toBeNull();
		expect(user.suspendedUntil).toBeNull();
		expect(user.suspendedReason).toBeNull();
		expect(user.suspendedBy).toBeNull();
	});

	it("republishes exactly what the suspension took down", async () => {
		const result = await unsuspendUser(payload, MOD, "u-1");
		expect(result.restoredListingIds.sort()).toEqual(["l-1", "l-2"]);
		expect(
			payload.store.listings.every((l: Doc) => l.status === "published"),
		).toBe(true);
	});

	it("does not drag back a listing whose status changed in the meantime", async () => {
		payload.store.listings.find((l: Doc) => l.id === "l-2").status = "deleted";
		const result = await unsuspendUser(payload, MOD, "u-1");
		expect(result.restoredListingIds).toEqual(["l-1"]);
		expect(payload.store.listings.find((l: Doc) => l.id === "l-2").status).toBe(
			"deleted",
		);
	});

	it("leaves listings down when the caller says not to restore", async () => {
		const result = await unsuspendUser(payload, MOD, "u-1", {
			restoreListings: false,
		});
		expect(result.restoredListingIds).toEqual([]);
		expect(payload.store.listings.every((l: Doc) => l.status === "draft")).toBe(
			true,
		);
	});

	it("refuses to lift a suspension that does not exist", async () => {
		await unsuspendUser(payload, MOD, "u-1");
		await expect(unsuspendUser(payload, MOD, "u-1")).rejects.toMatchObject({
			code: "moderation.invalidTransition",
		});
	});

	it("writes both the suspension and the lifting to the log", async () => {
		await unsuspendUser(payload, MOD, "u-1");
		expect(logs(payload).map((l) => l.action)).toEqual([
			"user.suspend",
			"user.unsuspend",
		]);
	});
});

describe("report decisions", () => {
	let payload: any;

	beforeEach(() => {
		payload = fakePayload({
			reports: [
				{
					id: "r-1",
					status: "pending",
					targetType: "listing",
					targetId: "l-1",
				},
				{ id: "r-done", status: "resolved", targetType: "user", targetId: "u" },
			],
		});
	});

	it("resolves a pending report with its resolution", async () => {
		await decideReport(payload, MOD, "r-1", {
			outcome: "resolved",
			resolution: "Listing removed",
		});
		const report = payload.store.reports.find((r: Doc) => r.id === "r-1");
		expect(report.status).toBe("resolved");
		expect(report.resolution).toBe("Listing removed");
		expect(report.resolvedBy).toBe("mod-1");
	});

	it("dismisses without requiring the moderator to type anything", async () => {
		await decideReport(payload, MOD, "r-1", { outcome: "dismissed" });
		expect(payload.store.reports.find((r: Doc) => r.id === "r-1").status).toBe(
			"reviewed",
		);
	});

	it("refuses to decide a report twice", async () => {
		await expect(
			decideReport(payload, MOD, "r-done", {
				outcome: "resolved",
				resolution: "x",
			}),
		).rejects.toMatchObject({ code: "moderation.invalidTransition" });
	});

	it("carries what was reported into the log", async () => {
		await decideReport(payload, MOD, "r-1", { outcome: "dismissed" });
		expect(logs(payload)[0]).toMatchObject({
			action: "report.dismiss",
			metadata: { reportedTargetType: "listing", reportedTargetId: "l-1" },
		});
	});
});
