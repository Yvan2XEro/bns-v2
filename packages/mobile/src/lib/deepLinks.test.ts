import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { isScreenFile, matchRoute, routeNameOf } from "./appRoutes";
import {
	CASE_DEEP_LINKS,
	canFollowPushTap,
	DELIVERY_DEEP_LINKS,
	GROUP_DEEP_LINKS,
	notificationUrl,
	PAYMENT_DEEP_LINKS,
	pushTapTarget,
	toAppPath,
} from "./deepLinks";

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

// Task 29: the five payment routes resolve the same way a push link does,
// even though none of them is ever reached by one (see PAYMENT_DEEP_LINKS).
describe("the payment deep links land on their screens", () => {
	test.each(
		PAYMENT_DEEP_LINKS.map(({ url, screen }) => [url, screen] as const),
	)("%s -> %s", (url, screen) => {
		expect(screenFor(url)).toBe(screen);
	});
});

describe("the case deep links land on their screens", () => {
	test.each(
		CASE_DEEP_LINKS.map(({ url, screen }) => [url, screen] as const),
	)("%s -> %s", (url, screen) => {
		expect(screenFor(url)).toBe(screen);
	});
});

describe("the delivery deep links land on their screens", () => {
	test.each(
		DELIVERY_DEEP_LINKS.map(({ url, screen }) => [url, screen] as const),
	)("%s -> %s", (url, screen) => {
		expect(screenFor(url)).toBe(screen);
	});
});

describe("the checkout-group deep links land on their screens", () => {
	test.each(
		GROUP_DEEP_LINKS.map(({ url, screen }) => [url, screen] as const),
	)("%s -> %s", (url, screen) => {
		expect(screenFor(notificationUrl({ url }) ?? "")).toBe(screen);
		expect(screenFor(url)).toBe(screen);
	});

	test("a push naming the group opens the grouped purchases screen", () => {
		expect(notificationUrl({ url: "/purchases/group/cg-1" })).toBe(
			"/purchases/group/cg-1",
		);
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

describe("a tap on a push notification", () => {
	const DEFAULT = "expo.modules.notifications.actions.DEFAULT";
	const tap = (data: unknown, actionIdentifier = DEFAULT) => ({
		actionIdentifier,
		notification: { request: { identifier: "n-1", content: { data } } },
	});

	test("leads where its data says, once per notification", () => {
		expect(
			pushTapTarget(
				tap({ url: "/messages/c-1", conversationId: "c-1" }),
				DEFAULT,
			),
		).toEqual({ id: "n-1", url: "/messages/c-1" });
		expect(pushTapTarget(tap({ conversationId: "c-2" }), DEFAULT)?.url).toBe(
			"/messages/c-2",
		);
	});

	test("goes nowhere without a destination, a tap, or on an action button", () => {
		expect(pushTapTarget(tap({}), DEFAULT)).toBeNull();
		expect(pushTapTarget(tap(null), DEFAULT)).toBeNull();
		expect(pushTapTarget(null, DEFAULT)).toBeNull();
		expect(pushTapTarget(tap({ url: "/x" }, "reply"), DEFAULT)).toBeNull();
	});
});

describe("when a notification tap is followed", () => {
	const ready = { navigationReady: true, pathname: "/home", signedIn: true };

	test("once the launch redirect to home has happened, signed in", () => {
		expect(canFollowPushTap(ready)).toBe(true);
	});

	test("not on the launch route, whose redirect would replace the screen", () => {
		expect(canFollowPushTap({ ...ready, pathname: "/" })).toBe(false);
	});

	test("not before the navigator, nor signed out", () => {
		expect(canFollowPushTap({ ...ready, navigationReady: false })).toBe(false);
		expect(canFollowPushTap({ ...ready, signedIn: false })).toBe(false);
	});
});
