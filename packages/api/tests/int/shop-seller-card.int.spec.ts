// @vitest-environment node
import { describe, expect, it } from "vitest";
import { paymentPill } from "../../src/contracts/orderPayment";
import { publicAddressLine, sinceYearOf } from "../../src/lib/shopSellerCard";
import type { ShopLocation } from "../../src/payload-types";
import { shopSellerDetails } from "../../src/services/delivery/locations";
import { fakePayload } from "./helpers/fakePayload";

const SHOP = {
	id: "s-1",
	status: "active" as const,
	createdAt: "2024-03-10T09:00:00.000Z",
};

type LocationPatch = Partial<
	Pick<
		ShopLocation,
		| "id"
		| "name"
		| "city"
		| "district"
		| "address"
		| "landmark"
		| "active"
		| "pickupEnabled"
	>
> & { shop?: string };

const location = (patch: LocationPatch = {}) => ({
	id: "loc-1",
	shop: "s-1",
	name: "Akwa",
	city: "douala" as ShopLocation["city"],
	district: "Akwa",
	address: "Rue Joffre",
	landmark: "Face à la pharmacie du port",
	active: true,
	pickupEnabled: true,
	...patch,
});

describe("publicAddressLine (W19)", () => {
	it("joins the street, the district and the city's label", () => {
		expect(publicAddressLine(location())).toBe("Rue Joffre, Akwa, Douala");
	});

	it("falls back to the landmark when the shop gave no street", () => {
		expect(publicAddressLine(location({ address: null }))).toBe(
			"Face à la pharmacie du port, Akwa, Douala",
		);
	});

	it("names a district stored as a key by its label", () => {
		expect(
			publicAddressLine(
				location({ city: "yaounde", district: "yaounde.mvan" }),
			),
		).toBe("Rue Joffre, Mvan, Yaoundé");
	});
});

describe("sinceYearOf (W19)", () => {
	it("reads the calendar year off the shop's creation date", () => {
		expect(sinceYearOf("2024-03-10T09:00:00.000Z")).toBe(2024);
	});

	it("is null for a missing or unreadable date", () => {
		expect(sinceYearOf(undefined)).toBeNull();
		expect(sinceYearOf("")).toBeNull();
		expect(sinceYearOf("not a date")).toBeNull();
	});
});

describe("shopSellerDetails (W19)", () => {
	it("takes the first public pickup point, by name, as the shop page lists them", async () => {
		const payload = fakePayload({
			"shop-locations": [
				location({ id: "loc-b", name: "Bonapriso", address: "Rue Tokoto" }),
				location({ id: "loc-a", name: "Akwa" }),
			],
		});
		expect(await shopSellerDetails(payload, SHOP)).toEqual({
			address: "Rue Joffre, Akwa, Douala",
			sinceYear: 2024,
		});
	});

	it("never surfaces a point the shop page hides: inactive, pickup off, or another shop's", async () => {
		const payload = fakePayload({
			"shop-locations": [
				location({ id: "a", active: false }),
				location({ id: "b", pickupEnabled: false }),
				location({ id: "c", shop: "s-2" }),
			],
		});
		expect(await shopSellerDetails(payload, SHOP)).toEqual({
			address: null,
			sinceYear: 2024,
		});
	});

	it("gives no address for a shop that is not active, nor anything for no shop", async () => {
		const payload = fakePayload({ "shop-locations": [location()] });
		expect(
			await shopSellerDetails(payload, { ...SHOP, status: "suspended" }),
		).toEqual({ address: null, sinceYear: 2024 });
		expect(await shopSellerDetails(payload, null)).toEqual({
			address: null,
			sinceYear: null,
		});
	});
});

describe("paymentPill: the one reading of an order's payment status (W20)", () => {
	it("reads cash on delivery by its collection state", () => {
		expect(
			paymentPill({ paymentMethod: "cod", paymentStatus: "cod_pending" }),
		).toBe("cod");
		expect(
			paymentPill({ paymentMethod: "cod", paymentStatus: "cod_collected" }),
		).toBe("codCollected");
		expect(
			paymentPill({ paymentMethod: "cod", paymentStatus: "cod_refused" }),
		).toBe("codRefused");
	});

	it("reads a protected payment as paid, refunded, failed or awaiting", () => {
		const pill = (paymentStatus: string) =>
			paymentPill({ paymentMethod: "mobile_money", paymentStatus });
		expect(pill("paid")).toBe("paid");
		expect(pill("refunded")).toBe("refunded");
		expect(pill("partially_refunded")).toBe("refunded");
		expect(pill("failed")).toBe("failed");
		expect(pill("awaiting_payment")).toBe("awaiting");
		expect(pill("unpaid")).toBe("awaiting");
	});

	it("is null without a payment method", () => {
		expect(paymentPill({})).toBeNull();
	});
});
