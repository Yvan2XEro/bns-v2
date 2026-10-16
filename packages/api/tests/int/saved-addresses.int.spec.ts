// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Addresses } from "../../src/collections/Addresses";
import {
	addressPatchFromPlace,
	deliveryAddressIssue,
	preselectedAddress,
	SAVED_ADDRESS_LIMIT,
	savedAddressInput,
} from "../../src/contracts/deliveryAddress";
import { marketAddressRules } from "../../src/lib/addressRules";
import { launchCitySeedRows } from "../../src/lib/launchCities";
import { ServiceError } from "../../src/lib/serviceError";
import {
	createAddress,
	deleteAddress,
	listAddresses,
	saveCheckoutAddress,
	updateAddress,
} from "../../src/services/addresses";
import { parseDeliveryAddress } from "../../src/services/checkout";
import { fakePayload } from "./helpers/fakePayload";

const buyer = { id: "user-a", role: "user" };
const other = { id: "user-b", role: "user" };

const home = {
	label: "Maison",
	recipientName: "Awa Ngono",
	phone: "+237699124408",
	city: "douala",
	district: "douala.akwa",
	landmark: "En face de la pharmacie du Rond-point",
	gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 },
};

const asPayload = (fake: ReturnType<typeof fakePayload>) =>
	fake as unknown as Parameters<typeof listAddresses>[0];

const svc = (user: { id: string; role: string }) =>
	user as Parameters<typeof listAddresses>[1];

describe("the addresses collection is owner-only", () => {
	const read = Addresses.access?.read as (args: unknown) => unknown;
	it("reads: nobody signed out, the owner's rows, staff everything", () => {
		expect(read({ req: { user: null } })).toBe(false);
		expect(read({ req: { user: { id: "u1", role: "user" } } })).toEqual({
			user: { equals: "u1" },
		});
		expect(read({ req: { user: { id: "m1", role: "moderator" } } })).toBe(true);
	});

	it("accepts no write through the REST surface, staff included", () => {
		for (const op of ["create", "update", "delete"] as const) {
			const access = Addresses.access?.[op] as (args: unknown) => unknown;
			expect(access({ req: { user: { id: "a", role: "admin" } } })).toBe(false);
		}
	});
});

describe("saved addresses service", () => {
	it("makes the first address the default and keeps exactly one", async () => {
		const fake = fakePayload();
		const payload = asPayload(fake);
		const first = await createAddress(payload, svc(buyer), home);
		expect(first.isDefault).toBe(true);
		const second = await createAddress(payload, svc(buyer), {
			...home,
			label: "Bureau",
			district: "douala.bonanjo",
		});
		expect(second.isDefault).toBe(false);
		await updateAddress(payload, svc(buyer), second.id, { isDefault: true });
		const list = await listAddresses(payload, svc(buyer));
		expect(list.addresses.filter((a) => a.isDefault).map((a) => a.id)).toEqual([
			second.id,
		]);
		expect(list.addresses[0]?.id).toBe(second.id);
		expect(list.limit).toBe(SAVED_ADDRESS_LIMIT);
	});

	it("promotes another address when the default is deleted", async () => {
		const payload = asPayload(fakePayload());
		const first = await createAddress(payload, svc(buyer), home);
		const second = await createAddress(payload, svc(buyer), {
			...home,
			district: "douala.bonanjo",
		});
		await deleteAddress(payload, svc(buyer), first.id);
		const list = await listAddresses(payload, svc(buyer));
		expect(list.addresses).toHaveLength(1);
		expect(list.addresses[0]).toMatchObject({ id: second.id, isDefault: true });
	});

	it("refuses an eleventh address", async () => {
		const payload = asPayload(fakePayload());
		for (let i = 0; i < SAVED_ADDRESS_LIMIT; i++)
			await createAddress(payload, svc(buyer), { ...home, label: `A${i}` });
		await expect(
			createAddress(payload, svc(buyer), home),
		).rejects.toMatchObject({ code: "address.limitReached", status: 409 });
		// The limit is per user.
		await expect(
			createAddress(payload, svc(other), home),
		).resolves.toMatchObject({ isDefault: true });
	});

	it("never lists, edits or deletes another user's address", async () => {
		const payload = asPayload(fakePayload());
		const mine = await createAddress(payload, svc(buyer), home);
		expect((await listAddresses(payload, svc(other))).addresses).toEqual([]);
		await expect(
			updateAddress(payload, svc(other), mine.id, { label: "Pris" }),
		).rejects.toMatchObject({ code: "address.notFound", status: 404 });
		await expect(
			deleteAddress(payload, svc(other), mine.id),
		).rejects.toMatchObject({ code: "address.notFound", status: 404 });
		expect((await listAddresses(payload, svc(buyer))).addresses).toHaveLength(
			1,
		);
	});

	it("refuses with the checkout code and the field, label included", async () => {
		const payload = asPayload(fakePayload());
		await expect(
			createAddress(payload, svc(buyer), { ...home, phone: "+237222123456" }),
		).rejects.toMatchObject({
			code: "checkout.addressInvalid",
			details: { field: "phone" },
		});
		await expect(
			createAddress(payload, svc(buyer), { ...home, landmark: "" }),
		).rejects.toMatchObject({ details: { field: "landmark" } });
		await expect(
			createAddress(payload, svc(buyer), { ...home, label: "x".repeat(31) }),
		).rejects.toMatchObject({ details: { field: "label" } });
	});

	it("saves at placement once, and never throws", async () => {
		const payload = asPayload(fakePayload());
		const { label: _label, ...address } = home;
		const saved = await saveCheckoutAddress(
			payload,
			svc(buyer),
			address,
			"Maison",
		);
		expect(saved).toMatchObject({ label: "Maison", isDefault: true });
		const again = await saveCheckoutAddress(
			payload,
			svc(buyer),
			{ ...address, recipientName: " awa ngono " },
			undefined,
		);
		expect(again?.id).toBe(saved?.id);
		// A pickup order without a landmark is not a deliverable address.
		expect(
			await saveCheckoutAddress(
				payload,
				svc(buyer),
				{ ...address, landmark: "" },
				undefined,
			),
		).toBeNull();
		expect((await listAddresses(payload, svc(buyer))).addresses).toHaveLength(
			1,
		);
	});

	it("round-trips into an address checkout accepts", async () => {
		const payload = asPayload(fakePayload());
		const saved = await createAddress(payload, svc(buyer), {
			...home,
			district: "douala.other",
			districtOther: " Ndogbong ",
		});
		const parsed = parseDeliveryAddress(
			savedAddressInput(saved),
			"seller_delivery",
		);
		expect(parsed).toMatchObject({
			district: "douala.other",
			districtOther: "Ndogbong",
			gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 },
		});
	});
});

describe("one rule for checkout and the address book", () => {
	const rules = marketAddressRules(launchCitySeedRows("seed"));
	const rows: Array<[string, Record<string, unknown>, string]> = [
		["valid", {}, "seller_delivery"],
		["short name", { recipientName: "A" }, "seller_delivery"],
		["landline", { phone: "+237222123456" }, "seller_delivery"],
		["unknown city", { city: "bafoussam" }, "seller_delivery"],
		["foreign district", { district: "yaounde.bastos" }, "seller_delivery"],
		["other without text", { district: "douala.other" }, "seller_delivery"],
		["no landmark", { landmark: "" }, "seller_delivery"],
		["no landmark pickup", { landmark: "" }, "pickup"],
		["long instructions", { instructions: "a".repeat(301) }, "courier"],
	];
	for (const [name, patch, method] of rows) {
		it(name, () => {
			const raw = { ...home, ...patch };
			const contract = deliveryAddressIssue(raw, method as "pickup", rules);
			let server: string | null = null;
			try {
				parseDeliveryAddress(raw, method as "pickup");
			} catch (error) {
				if (!(error instanceof ServiceError)) throw error;
				server = String(error.details?.field).replace(/^delivery\./, "");
			}
			expect(contract).toBe(server);
		});
	}
});

describe("address helpers", () => {
	it("preselects the default, else the newest", () => {
		const a = { id: "a", isDefault: false, updatedAt: "2026-01-02" };
		const b = { id: "b", isDefault: true, updatedAt: "2026-01-01" };
		const c = { id: "c", isDefault: false, updatedAt: "2026-01-03" };
		expect(preselectedAddress([a, b, c])?.id).toBe("b");
		expect(preselectedAddress([a, c])?.id).toBe("c");
		expect(preselectedAddress([])).toBeNull();
	});

	it("maps a geocoder suggestion onto city and district", () => {
		const cities = [
			{
				key: "douala",
				label: "Douala",
				districts: [{ key: "douala.deido", label: "Deïdo" }],
			},
		];
		expect(
			addressPatchFromPlace({ name: "Douala", district: "Deido" }, cities),
		).toEqual({ city: "douala", district: "douala.deido", districtOther: "" });
		expect(
			addressPatchFromPlace({ name: "Douala", district: "Ndogbong" }, cities),
		).toEqual({
			city: "douala",
			district: "douala.other",
			districtOther: "Ndogbong",
		});
		expect(addressPatchFromPlace({ name: "Kribi" }, cities)).toBeNull();
	});
});
