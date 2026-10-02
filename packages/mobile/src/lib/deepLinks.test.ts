import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { isScreenFile, matchRoute, routeNameOf } from "./appRoutes";
import { notificationUrl, toAppPath } from "./deepLinks";

const APP_ROOT = join(import.meta.dir, "../../app");
const ROUTES = [...new Glob("**/*").scanSync({ cwd: APP_ROOT })]
	.filter(isScreenFile)
	.map(routeNameOf);

function screenFor(url: string): string | null {
	const path = toAppPath(url);
	return path ? matchRoute(path, ROUTES) : null;
}

describe("the order deep links land on their screens", () => {
	test("buynsellem://purchases/{id} opens the buyer's order", () => {
		expect(toAppPath("buynsellem://purchases/o-1")).toBe("/purchases/o-1");
		expect(screenFor("buynsellem://purchases/o-1")).toBe("purchases/[id]");
	});

	test("buynsellem://seller/orders/{id} opens the shop's order", () => {
		expect(toAppPath("buynsellem://seller/orders/o-1")).toBe(
			"/seller/orders/o-1",
		);
		expect(screenFor("buynsellem://seller/orders/o-1")).toBe(
			"seller/orders/[id]",
		);
	});

	test("a static segment wins over a dynamic one", () => {
		expect(screenFor("/purchases/o-1/withdrawal")).toBe(
			"purchases/[id]/withdrawal",
		);
		expect(screenFor("/purchases")).toBe("purchases/index");
		expect(screenFor("/seller/orders/o-1/handover")).toBe(
			"seller/orders/[id]/handover",
		);
	});

	test("a link outside the app stays outside", () => {
		expect(toAppPath("https://example.com/purchases/o-1")).toBeNull();
	});
});

describe("notificationUrl", () => {
	test("prefers the payload's url", () => {
		expect(notificationUrl({ orderId: "o-1", url: "/purchases/o-1" })).toBe(
			"/purchases/o-1",
		);
	});

	test("falls back to a conversation, then a listing", () => {
		expect(notificationUrl({ conversationId: "c-1", listingId: "l-1" })).toBe(
			"/messages/c-1",
		);
		expect(notificationUrl({ listingId: "l-1" })).toBe("/listing/l-1");
	});

	test("ignores an empty url and says nothing for an empty payload", () => {
		expect(notificationUrl({ url: "", listingId: "l-1" })).toBe("/listing/l-1");
		expect(notificationUrl({})).toBeNull();
	});
});
