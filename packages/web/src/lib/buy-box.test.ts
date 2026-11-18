import { describe, expect, it } from "bun:test";
import {
	type BuyBoxInput,
	decideBuyBox,
	deliveryLine,
	signInToAddHref,
} from "./buy-box";
import { parseAddToCart } from "./cart-lines";
import { safeReturnTo } from "./return-to";

function input(patch: Partial<BuyBoxInput> = {}): BuyBoxInput {
	return {
		ordersEnabled: true,
		orderable: true,
		shop: { id: "s-1", restricted: false },
		ownShop: false,
		productAvailable: true,
		signedIn: true,
		...patch,
	};
}

/**
 * One case per reason the page stays as it is today, each flipped alone from
 * a listing that would otherwise be bought — so a reason that silently stops
 * being checked turns its own case red rather than hiding behind another.
 */
describe("decideBuyBox — the nine cases", () => {
	it("offers the buy box to a signed-in buyer when every condition holds", () => {
		expect(decideBuyBox(input())).toEqual({ kind: "buy", signedIn: true });
	});

	it("offers it to a signed-out visitor too, who is sent to sign in on add", () => {
		expect(decideBuyBox(input({ signedIn: false }))).toEqual({
			kind: "buy",
			signedIn: false,
		});
	});

	it("hides it when ordering is off, even for an orderable listing", () => {
		expect(decideBuyBox(input({ ordersEnabled: false }))).toEqual({
			kind: "hidden",
			reason: "ordersDisabled",
		});
	});

	it("hides it for a classified ad with no shop", () => {
		expect(decideBuyBox(input({ shop: null }))).toEqual({
			kind: "hidden",
			reason: "noShop",
		});
	});

	it("hides it from a member of the listing's own shop", () => {
		expect(decideBuyBox(input({ ownShop: true }))).toEqual({
			kind: "hidden",
			reason: "ownShop",
		});
	});

	it("says orders are paused when the shop is restricted", () => {
		expect(
			decideBuyBox(
				input({ orderable: false, shop: { id: "s-1", restricted: true } }),
			),
		).toEqual({ kind: "restricted" });
	});

	it("hides it when the listing is not orderable", () => {
		expect(decideBuyBox(input({ orderable: false }))).toEqual({
			kind: "hidden",
			reason: "notOrderable",
		});
	});

	it("hides it when the read carries no orderable field", () => {
		expect(decideBuyBox(input({ orderable: undefined }))).toEqual({
			kind: "hidden",
			reason: "notOrderable",
		});
	});

	it("hides it when orderable is null", () => {
		expect(decideBuyBox(input({ orderable: null }))).toEqual({
			kind: "hidden",
			reason: "notOrderable",
		});
	});

	it("hides it when the product has no available variant", () => {
		expect(decideBuyBox(input({ productAvailable: false }))).toEqual({
			kind: "hidden",
			reason: "soldOut",
		});
	});
});

describe("deliveryLine", () => {
	const cities = [
		{ key: "douala", label: "Douala", fee: 2_000 },
		{ key: "yaounde", label: "Yaoundé", fee: 1_500 },
	];

	it("uses the shop's own fee over the city default", () => {
		expect(
			deliveryLine(
				{
					city: "douala",
					sellerDeliveryEnabled: true,
					deliveryFee: 1_000,
					pickupEnabled: false,
					pickupAddress: null,
				},
				cities,
			),
		).toEqual({ delivery: { city: "Douala", fee: 1_000 }, pickup: false });
	});

	it("falls back to the launch city's default fee", () => {
		expect(
			deliveryLine(
				{
					city: "douala",
					sellerDeliveryEnabled: true,
					deliveryFee: null,
					pickupEnabled: true,
					pickupAddress: "Akwa, face pharmacie",
				},
				cities,
			),
		).toEqual({ delivery: { city: "Douala", fee: 2_000 }, pickup: true });
	});

	it("offers pickup only when a pickup address exists", () => {
		expect(
			deliveryLine(
				{
					city: "douala",
					sellerDeliveryEnabled: false,
					deliveryFee: null,
					pickupEnabled: true,
					pickupAddress: null,
				},
				cities,
			),
		).toBeNull();
	});

	it("names no delivery for a city outside the launch list", () => {
		expect(
			deliveryLine(
				{
					city: "bafoussam",
					sellerDeliveryEnabled: true,
					deliveryFee: null,
					pickupEnabled: true,
					pickupAddress: "Marché A",
				},
				cities,
			),
		).toEqual({ delivery: null, pickup: true });
	});
});

describe("signInToAddHref", () => {
	it("sends the add through sign-in to the cart, which replays it", () => {
		const href = signInToAddHref({
			listingId: "l-1",
			variantId: "v-1",
			quantity: 3,
		});
		const url = new URL(href, "https://buynsellem.test");
		expect(url.pathname).toBe("/auth/login");
		const back = safeReturnTo(url.searchParams.get("redirect"));
		expect(back).toBe("/cart?addToCart=l-1%3Av-1%3A3");
		const backUrl = new URL(back ?? "", "https://buynsellem.test");
		expect(backUrl.pathname).toBe("/cart");
		expect(parseAddToCart(backUrl.searchParams.get("addToCart"))).toEqual({
			listingId: "l-1",
			variantId: "v-1",
			quantity: 3,
		});
	});
});
