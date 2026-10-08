// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nobody } from "../../src/access/staff";
import { CourierMembers } from "../../src/collections/CourierMembers";
import { Couriers } from "../../src/collections/Couriers";
import { DeliveryProofs } from "../../src/collections/DeliveryProofs";
import { DeliveryZones } from "../../src/collections/DeliveryZones";
import { OrderEvents } from "../../src/collections/OrderEvents";
import { Orders } from "../../src/collections/Orders";
import { Reports } from "../../src/collections/Reports";
import { ShipmentEvents } from "../../src/collections/ShipmentEvents";
import { Shipments } from "../../src/collections/Shipments";
import { ShopLocations } from "../../src/collections/ShopLocations";
import { WebhookEvents } from "../../src/collections/WebhookEvents";
import config from "../../src/payload.config";
import { fakePayload } from "./helpers/fakePayload";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(
	fields: readonly unknown[],
	name: string,
): Record<string, unknown> | undefined {
	const [head, ...rest] = name.split(".");
	const found = fields.find(
		(item): item is Record<string, unknown> =>
			isRecord(item) && item.name === head,
	);
	if (!found || rest.length === 0) return found;
	return field(Array.isArray(found.fields) ? found.fields : [], rest.join("."));
}

function optionValues(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((option) =>
		isRecord(option) && typeof option.value === "string" ? [option.value] : [],
	);
}

function accessResult(access: unknown, args: unknown): unknown {
	return typeof access === "function"
		? Reflect.apply(access, undefined, [args])
		: access;
}

function beforeValidateHook(collection: {
	hooks?: { beforeValidate?: unknown[] };
}) {
	const hook = collection.hooks?.beforeValidate?.[0];
	if (typeof hook !== "function")
		throw new Error("Expected beforeValidate hook");
	return hook;
}

describe("P7 delivery collections", () => {
	it("registers all seven schemas with Payload", async () => {
		const slugs = (await config).collections.map(
			(collection) => collection.slug,
		);
		expect(slugs).toEqual(
			expect.arrayContaining([
				"delivery-zones",
				"shop-locations",
				"couriers",
				"courier-members",
				"shipments",
				"shipment-events",
				"delivery-proofs",
			]),
		);
	});

	it("keeps zone and shipment REST writes closed and hides rider token hashes", () => {
		for (const collection of [
			DeliveryZones,
			Shipments,
			ShipmentEvents,
			DeliveryProofs,
		]) {
			for (const operation of ["create", "update", "delete"] as const) {
				expect(
					accessResult(collection.access?.[operation], {
						req: { user: { id: "u1", role: "user" } },
					}),
				).toBe(false);
			}
		}
		const tokenHashAccess = field(
			Shipments.fields,
			"riderLink.tokenHash",
		)?.access;
		expect(
			isRecord(tokenHashAccess)
				? accessResult(tokenHashAccess.read, {
						req: { user: { id: "admin", role: "admin" } },
					})
				: undefined,
		).toBe(false);
	});

	it("stores delivery defaults and enforces the shop-account-only courier rule", () => {
		expect(field(DeliveryZones.fields, "deliveryDays")?.defaultValue).toEqual([
			"mon",
			"tue",
			"wed",
			"thu",
			"fri",
			"sat",
		]);
		expect(field(DeliveryZones.fields, "codAllowed")?.defaultValue).toBe(true);
		const validate = field(Couriers.fields, "billingMode")?.validate;
		if (typeof validate !== "function")
			throw new Error("billing validator missing");
		expect(Reflect.apply(validate, undefined, ["shop_account"])).toBe(true);
		expect(Reflect.apply(validate, undefined, ["platform_account"])).toContain(
			"shop_account only",
		);
	});

	it("keeps courier memberships unique and proof uploads private and bounded", () => {
		expect(CourierMembers.indexes).toContainEqual({
			fields: ["courier", "user"],
			unique: true,
		});
		expect(DeliveryProofs.access?.read).toBe(nobody);
		expect(DeliveryProofs.access?.create).toBe(nobody);
		expect(DeliveryProofs.access?.update).toBe(nobody);
		expect(DeliveryProofs.access?.delete).toBe(nobody);
		expect(DeliveryProofs.access?.unlock).toBe(nobody);
		const upload = isRecord(DeliveryProofs.upload)
			? DeliveryProofs.upload
			: undefined;
		expect(upload?.mimeTypes).toEqual(["image/jpeg", "image/png"]);
		expect(upload?.withMetadata).toBe(false);
		expect(
			isRecord(upload?.formatOptions) ? upload.formatOptions.format : undefined,
		).toBe("jpeg");
	});

	it("adds shipment reporting and the order-address timeline event", () => {
		const targetType = field(Reports.fields, "targetType");
		const reasons = field(Reports.fields, "reason");
		expect(optionValues(targetType?.options)).toContain("shipment");
		expect(optionValues(reasons?.options)).toEqual(
			expect.arrayContaining(["cod_remittance", "return_overdue"]),
		);
		expect(optionValues(field(OrderEvents.fields, "type")?.options)).toContain(
			"order.address_updated",
		);
		expect(
			optionValues(field(WebhookEvents.fields, "provider")?.options),
		).toEqual(expect.arrayContaining(["yango", "campost"]));
		const extensions = field(Orders.fields, "shipments");
		expect(extensions).toMatchObject({
			type: "relationship",
			hasMany: true,
			relationTo: "shipments",
		});
	});

	it("exposes shop pickup points publicly only through its active pickup filter", async () => {
		const read = ShopLocations.access?.read;
		if (typeof read !== "function")
			throw new Error("Expected an access function");
		expect(await Reflect.apply(read, undefined, [{ req: {} }])).toEqual({
			and: [{ active: { equals: true } }, { pickupEnabled: { equals: true } }],
		});
	});

	it("refuses impossible zone ETAs and pickup locations without valid hours", () => {
		const zoneHook = beforeValidateHook(DeliveryZones);
		expect(() =>
			Reflect.apply(zoneHook, undefined, [
				{ data: { etaMinHours: 9, etaMaxHours: 8 } },
			]),
		).toThrow("Minimum delivery ETA cannot exceed maximum ETA.");

		const locationHook = beforeValidateHook(ShopLocations);
		expect(() =>
			Reflect.apply(locationHook, undefined, [
				{ data: { pickupEnabled: true, openingHours: [] } },
			]),
		).toThrow("Pickup-enabled locations require opening hours.");
		expect(() =>
			Reflect.apply(locationHook, undefined, [
				{
					data: {
						pickupEnabled: true,
						openingHours: [{ day: "mon", opens: "17:00", closes: "09:00" }],
					},
				},
			]),
		).toThrow("Opening hours must be HH:mm with closing after opening.");
	});

	it("refuses courier members whose account phone is not verified", async () => {
		const hook = beforeValidateHook(CourierMembers);
		const payload = fakePayload({
			users: [{ id: "rider-1", phone: "+237670000001", phoneVerifiedAt: null }],
		});
		await expect(
			Reflect.apply(hook, undefined, [
				{
					data: { courier: "courier-1", user: "rider-1", role: "rider" },
					req: { payload },
				},
			]),
		).rejects.toMatchObject({ status: 400 });
	});
});
