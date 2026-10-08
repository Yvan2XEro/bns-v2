import { describe, expect, test } from "bun:test";
import { ApiError } from "./apiError";
import {
	attemptBody,
	capturePosition,
	handoverBody,
	photoFor,
	pickedUpBody,
	RIDER_BUTTONS,
	type RiderAction,
	riderButtons,
	riderErrorScreen,
} from "./rider-page";

const ALL: RiderAction[] = ["picked_up", "attempt", "handover", "photo"];

describe("riderButtons", () => {
	test("is total over the union: every action has exactly one button", () => {
		expect(Object.keys(RIDER_BUTTONS).sort()).toEqual([...ALL].sort());
		for (const action of ALL) {
			expect(riderButtons([action]).map((b) => b.action)).toEqual([action]);
		}
	});

	test("shows nothing for an empty list", () => {
		expect(riderButtons([])).toEqual([]);
	});

	test("a pending parcel shows the pickup button alone", () => {
		expect(riderButtons(["picked_up"])).toEqual([
			{ action: "picked_up", labelKey: "pickedUp", tone: "primary" },
		]);
	});

	test("on the road the four buttons come in the page's fixed order, whatever order the API lists", () => {
		expect(
			riderButtons(["photo", "handover", "attempt", "picked_up"]).map(
				(b) => b.labelKey,
			),
		).toEqual(["pickedUp", "failed", "enterCode", "addPhoto"]);
	});

	test("never adds a button the route did not allow", () => {
		expect(
			riderButtons(["attempt", "handover", "photo"]).map((b) => b.action),
		).toEqual(["attempt", "handover", "photo"]);
	});
});

describe("riderErrorScreen", () => {
	test("a 404 or an invalid-link code is the one generic screen", () => {
		expect(
			riderErrorScreen(new ApiError("x", 404, "shipment.riderLinkInvalid")),
		).toBe("invalid");
		expect(riderErrorScreen(new ApiError("x", 404, "generic.notFound"))).toBe(
			"invalid",
		);
	});

	test("rate limiting and other failures are told apart from it", () => {
		expect(
			riderErrorScreen(new ApiError("x", 429, "generic.rateLimited")),
		).toBe("rateLimited");
		expect(riderErrorScreen(new ApiError("x", 500, "generic.server"))).toBe(
			"failed",
		);
		expect(riderErrorScreen(new Error("offline"))).toBe("failed");
	});
});

describe("request bodies", () => {
	const gps = { lat: 4.05, lng: 9.7 };

	test("pickup carries the position only when there is one", () => {
		expect(pickedUpBody(gps)).toEqual({ gps });
		expect(pickedUpBody(null)).toEqual({});
	});

	test("an attempt trims the note and drops what is empty", () => {
		expect(attemptBody({ reason: "absent", note: "  ", gps: null })).toEqual({
			reason: "absent",
		});
		expect(
			attemptBody({
				reason: "absent",
				note: " rang twice ",
				gps,
				photoId: "p1",
			}),
		).toEqual({ reason: "absent", note: "rang twice", gps, photoId: "p1" });
	});

	test("a handover is the code plus optional position and photo, nothing else", () => {
		expect(handoverBody({ code: "1234", gps: null })).toEqual({ code: "1234" });
		expect(handoverBody({ code: "1234", gps, photoId: "p1" })).toEqual({
			code: "1234",
			gps,
			photoId: "p1",
		});
	});
});

describe("photoFor", () => {
	test("a photo goes only to the kind of action it was taken for", () => {
		const stored = { id: "p1", kind: "handover" as const };
		expect(photoFor("handover", stored)).toBe("p1");
		expect(photoFor("attempt", stored)).toBeUndefined();
		expect(photoFor("handover", null)).toBeUndefined();
	});
});

describe("capturePosition", () => {
	test("resolves the fix as lat and lng", async () => {
		const geo = {
			getCurrentPosition: (ok: PositionCallback) =>
				ok({
					coords: { latitude: 4.05, longitude: 9.7 },
				} as GeolocationPosition),
		};
		expect(await capturePosition(geo)).toEqual({ lat: 4.05, lng: 9.7 });
	});

	test("a refusal reads as no position", async () => {
		const geo = {
			getCurrentPosition: (
				_ok: PositionCallback,
				fail?: PositionErrorCallback | null,
			) => fail?.({ code: 1 } as GeolocationPositionError),
		};
		expect(await capturePosition(geo)).toBeNull();
	});

	test("a device without geolocation reads as no position", async () => {
		expect(await capturePosition(undefined)).toBeNull();
	});

	test("a callback that never answers gives up after the timeout", async () => {
		const geo = { getCurrentPosition: () => undefined };
		expect(await capturePosition(geo, 10)).toBeNull();
	});
});
