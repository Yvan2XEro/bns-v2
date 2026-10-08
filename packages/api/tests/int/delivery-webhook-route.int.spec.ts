// @vitest-environment node
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { FakeCourierProvider } from "../../src/lib/delivery/fakeCourier";
import type { CourierWebhookEvent } from "../../src/lib/delivery/types";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();
	return { ...actual, getPayload: getPayloadMock };
});

let post: (
	request: Request,
	context: { params: Promise<{ provider: string }> },
) => Promise<Response>;

beforeAll(async () => {
	({ POST: post } = await import(
		"../../src/app/(frontend)/api/public/delivery/webhook/[provider]/route"
	));
});

describe("courier webhook route", () => {
	const provider = new FakeCourierProvider();
	let payload: ReturnType<typeof fakePayload>;
	const event: CourierWebhookEvent = {
		reference: "SHP-1",
		providerShipmentId: "carrier-1",
		providerStatus: "picked_up",
		status: "picked_up",
		occurredAt: new Date("2026-10-04T12:00:00.000Z"),
		providerEventId: "evt-route-1",
		type: "shipment.picked_up",
	};

	beforeEach(() => {
		vi.stubEnv("COURIER_PROVIDER", "fake");
		payload = fakePayload(
			{},
			{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
		);
		getPayloadMock.mockClear();
		getPayloadMock.mockResolvedValue(payload);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	function request(signed = provider.emit(event)) {
		return new Request("https://api.test/api/public/delivery/webhook/yango", {
			method: "POST",
			headers: signed.headers,
			body: signed.rawBody,
		});
	}

	const context = { params: Promise.resolve({ provider: "yango" }) };

	it("rejects an invalid signature without storing or logging it", async () => {
		const signed = provider.emit(event);
		const signature = signed.headers["x-fake-courier-signature"];
		const warn = vi.spyOn(payload.logger, "warn");
		const response = await post(
			request({
				...signed,
				headers: { ...signed.headers, "x-fake-courier-signature": "invalid" },
			}),
			context,
		);

		expect(response.status).toBe(400);
		expect(payload.store["webhook-events"] ?? []).toHaveLength(0);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(warn.mock.calls)).not.toContain(signature);
	});

	it("stores and queues one verified event, then acknowledges its duplicate", async () => {
		const first = await post(request(), context);
		const duplicate = await post(request(), context);

		expect(first.status).toBe(200);
		expect(duplicate.status).toBe(200);
		expect(payload.store["webhook-events"]).toHaveLength(1);
		expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
		expect(payload.jobs.queue).toHaveBeenCalledWith({
			task: "processCourierWebhookEvent",
			input: { eventId: payload.store["webhook-events"][0].id },
			queue: "delivery",
		});
	});

	it("answers 500 when event persistence fails and does not queue work", async () => {
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "webhook-events";

		const response = await post(request(), context);

		expect(response.status).toBe(500);
		expect(payload.store["webhook-events"] ?? []).toHaveLength(0);
		expect(payload.jobs.queue).not.toHaveBeenCalled();
	});

	it("does not expose a webhook for manual delivery", async () => {
		const response = await post(request(), {
			params: Promise.resolve({ provider: "manual" }),
		});

		expect(response.status).toBe(404);
		expect(getPayloadMock).not.toHaveBeenCalled();
	});
});
