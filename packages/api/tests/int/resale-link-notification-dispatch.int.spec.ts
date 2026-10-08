// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	notifyResaleLinkDecidedMock,
	notifyResaleLinkRequestedMock,
	notifyResaleLinkSuspendedMock,
} = vi.hoisted(() => ({
	notifyResaleLinkDecidedMock: vi.fn(async () => undefined),
	notifyResaleLinkRequestedMock: vi.fn(async () => undefined),
	notifyResaleLinkSuspendedMock: vi.fn(async () => undefined),
}));
vi.mock("../../src/services/resaleNotifications", () => ({
	notifyResaleLinkDecided: notifyResaleLinkDecidedMock,
	notifyResaleLinkRequested: notifyResaleLinkRequestedMock,
	notifyResaleLinkSuspended: notifyResaleLinkSuspendedMock,
}));

import {
	decideResaleLink,
	requestResaleLink,
} from "../../src/services/resaleLinks";
import { fakePayload } from "./helpers/fakePayload";

function seed() {
	return fakePayload(
		{
			shops: [
				{ id: "supplier", owner: "supplier-owner", status: "active", level: 3 },
				{ id: "reseller", owner: "reseller-owner", status: "active", level: 2 },
			],
			"shop-members": [
				{
					id: "supplier-owner-member",
					shop: "supplier",
					user: "supplier-owner",
					role: "owner",
					status: "active",
				},
				{
					id: "reseller-owner-member",
					shop: "reseller",
					user: "reseller-owner",
					role: "owner",
					status: "active",
				},
			],
			"resale-terms": [
				{
					id: "current-terms",
					role: "reseller",
					version: "2026-10-01",
					publishedAt: "2026-10-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "acceptance",
					shop: "reseller",
					role: "reseller",
					version: "2026-10-01",
				},
			],
		},
		{ globals: { "app-settings": { resale: { enabled: true } } } },
	);
}

beforeEach(() => {
	notifyResaleLinkDecidedMock.mockClear();
	notifyResaleLinkRequestedMock.mockClear();
	notifyResaleLinkSuspendedMock.mockClear();
});

describe("resale link notification dispatch", () => {
	it("notifies the supplier after creating a link request", async () => {
		const payload = seed();
		const link = await requestResaleLink(
			payload,
			{ id: "reseller-owner" },
			"reseller",
			{
				supplierShop: "supplier",
				message: "Please approve",
				acceptTermsVersion: "2026-10-01",
			},
			{ now: new Date("2026-10-04T12:00:00.000Z") },
		);

		expect(payload.store["resale-links"]).toHaveLength(1);
		expect(link.status).toBe("requested");
		expect(notifyResaleLinkRequestedMock).toHaveBeenCalledExactlyOnceWith(
			payload,
			link,
		);
	});

	it("does not notify when persistence fails", async () => {
		const payload = seed();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "resale-links";

		await expect(
			requestResaleLink(
				payload,
				{ id: "reseller-owner" },
				"reseller",
				{
					supplierShop: "supplier",
					message: "Please approve",
					acceptTermsVersion: "2026-10-01",
				},
				{ now: new Date("2026-10-04T12:00:00.000Z") },
			),
		).rejects.toThrow();
		expect(notifyResaleLinkRequestedMock).not.toHaveBeenCalled();
		expect(payload.store["resale-links"] ?? []).toHaveLength(0);
	});

	it("notifies the reseller after the supplier approves a request", async () => {
		const payload = seed();
		await payload.create({
			collection: "resale-links",
			data: {
				supplierShop: "supplier",
				resellerShop: "reseller",
				status: "requested",
				riskHold: false,
			},
		});

		const link = await decideResaleLink(
			payload,
			{ id: "supplier-owner" },
			String(payload.store["resale-links"]?.[0]?.id),
			{ action: "approve" },
			{ now: new Date("2026-10-04T12:00:00.000Z") },
		);

		expect(link.status).toBe("approved");
		expect(notifyResaleLinkDecidedMock).toHaveBeenCalledExactlyOnceWith(
			payload,
			link,
			"approved",
		);
	});
});
