// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { countListingView } from "../../src/services/listingViews";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");

function world() {
	return fakePayload({
		users: [{ id: "owner" }, { id: "buyer" }, { id: "member" }],
		shops: [{ id: "shop-1", owner: "owner", status: "active" }],
		listings: [
			{ id: "live", seller: "owner", shop: "shop-1", status: "published" },
			{ id: "draft", seller: "owner", shop: "shop-1", status: "pending" },
		],
		"shop-members": [
			{ id: "member-1", user: "member", shop: "shop-1", status: "active" },
		],
	});
}

describe("countListingView", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("counts one published listing view per viewer in a 30-minute window", async () => {
		vi.stubEnv("RISK_HASH_SECRET", "0123456789abcdef0123456789abcdef");
		const payload = world();
		const store = new MemoryCounterStore(() => NOW.getTime());
		const input = {
			listingId: "live",
			viewerId: "buyer",
			installId: null,
			ip: "192.0.2.1",
			userAgent: "test-agent",
			now: NOW,
		};

		expect(await countListingView(payload, input, { store })).toEqual({
			counted: true,
		});
		expect(await countListingView(payload, input, { store })).toEqual({
			counted: false,
		});
		expect(
			await store.incrementHash?.("stats:views:20261004", "live", 691200),
		).toBe(2);
	});

	it("does not count unpublished, owner, or active shop-member views", async () => {
		vi.stubEnv("RISK_HASH_SECRET", "0123456789abcdef0123456789abcdef");
		const payload = world();
		const store = new MemoryCounterStore(() => NOW.getTime());
		const base = {
			listingId: "live",
			installId: null,
			ip: "192.0.2.1",
			userAgent: "test-agent",
			now: NOW,
		};

		for (const [listingId, viewerId] of [
			["draft", "buyer"],
			["live", "owner"],
			["live", "member"],
		] as const) {
			expect(
				await countListingView(
					payload,
					{ ...base, listingId, viewerId },
					{ store },
				),
			).toEqual({ counted: false });
		}
		expect(
			await store.incrementHash?.("stats:views:20261004", "live", 691200),
		).toBe(1);
	});

	it("uses a hashed installation or network fallback without persisting raw identifiers", async () => {
		vi.stubEnv("RISK_HASH_SECRET", "0123456789abcdef0123456789abcdef");
		const payload = world();
		const store = new MemoryCounterStore(() => NOW.getTime());
		const keys: string[] = [];
		const counters = {
			increment: store.increment.bind(store),
			setIfAbsent: (key: string, value: string, ttl: number) => {
				keys.push(key);
				return store.setIfAbsent(key, value, ttl);
			},
			incrementHash: store.incrementHash.bind(store),
		};
		const result = await countListingView(
			payload,
			{
				listingId: "live",
				viewerId: null,
				installId: "raw-install-id",
				ip: "192.0.2.1",
				userAgent: "test-agent",
				now: NOW,
			},
			{ store: counters },
		);
		expect(result).toEqual({ counted: true });
		expect(keys).toHaveLength(1);
		expect(keys[0]).not.toContain("raw-install-id");
	});
});
