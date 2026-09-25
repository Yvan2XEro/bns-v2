// @vitest-environment node
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();
	return { ...actual, getPayload: getPayloadMock };
});

const HASH_KEY = "notch-hash";
const STRIPE_SECRET = "whsec_routes";

type Handler = (request: Request) => Promise<Response>;
let notchpayPOST: Handler;
let stripePOST: Handler;

beforeAll(async () => {
	({ POST: notchpayPOST } = await import(
		"../../src/app/(frontend)/api/public/boost/webhook/notchpay/route"
	));
	({ POST: stripePOST } = await import(
		"../../src/app/(frontend)/api/public/boost/webhook/stripe/route"
	));
}, 30_000);

const notchBody = JSON.stringify({
	id: "evt_route_1",
	event: "payment.complete",
	data: {
		merchant_reference: "PI-x",
		reference: "trx.x",
		amount: 900,
		currency: "XAF",
		status: "complete",
	},
});
const validSignature = createHmac("sha256", HASH_KEY)
	.update(notchBody)
	.digest("hex");
const wrongSignature = createHmac("sha256", "wrong")
	.update(notchBody)
	.digest("hex");

const notchRequest = (signature: string, body = notchBody) =>
	new Request("http://localhost/api/public/boost/webhook/notchpay", {
		method: "POST",
		headers: { "x-notch-signature": signature },
		body,
	});

describe("payment webhook routes", () => {
	let payload: ReturnType<typeof fakePayload>;
	const logSpies: Array<ReturnType<typeof vi.spyOn>> = [];

	beforeEach(() => {
		process.env.NOTCHPAY_PUBLIC_KEY = "pk_test";
		process.env.NOTCHPAY_HASH_KEY = HASH_KEY;
		process.env.STRIPE_SECRET_KEY = "sk_test_routes";
		process.env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;
		payload = fakePayload(
			{},
			{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
		);
		getPayloadMock.mockResolvedValue(payload);
		for (const method of ["log", "info", "warn", "error"] as const) {
			logSpies.push(
				vi.spyOn(console, method).mockImplementation(() => undefined),
			);
		}
	});

	afterEach(() => {
		for (const spy of logSpies.splice(0)) spy.mockRestore();
	});

	const everythingLogged = () =>
		JSON.stringify([
			...logSpies.flatMap((spy) => spy.mock.calls),
			payload.logger.info.mock.calls,
			payload.logger.warn.mock.calls,
			payload.logger.error.mock.calls,
		]);

	it("stores a signed NotchPay event and queues its processing", async () => {
		const response = await notchpayPOST(notchRequest(validSignature));

		expect(response.status).toBe(200);
		expect(payload.store["webhook-events"]).toHaveLength(1);
		expect(payload.jobs.queue).toHaveBeenCalledWith({
			task: "processWebhookEvent",
			input: { eventId: payload.store["webhook-events"][0].id },
			queue: "payments",
		});
	});

	it("answers 400 to a bad signature and never logs a signature value", async () => {
		const response = await notchpayPOST(notchRequest(wrongSignature));

		expect(response.status).toBe(400);
		expect(payload.store["webhook-events"] ?? []).toHaveLength(0);
		const logged = everythingLogged();
		expect(logged).not.toContain(wrongSignature);
		expect(logged).not.toContain(validSignature);
	});

	it("answers 200 to a duplicate event without queuing it again", async () => {
		await notchpayPOST(notchRequest(validSignature));
		const second = await notchpayPOST(notchRequest(validSignature));

		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({ duplicate: true });
		expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
	});

	it("answers 500 when the event cannot be stored, so the provider retries", async () => {
		vi.spyOn(payload, "create").mockRejectedValue(new Error("mongo is down"));
		vi.spyOn(payload, "find").mockResolvedValue({
			docs: [],
			totalDocs: 0,
			hasNextPage: false,
			nextPage: null,
		} as never);
		expect((await notchpayPOST(notchRequest(validSignature))).status).toBe(500);
	});

	it("answers 500 when the stored event cannot be queued", async () => {
		payload.jobs.queue.mockRejectedValueOnce(new Error("queue is down"));

		const response = await notchpayPOST(notchRequest(validSignature));

		expect(response.status).toBe(500);
		expect(payload.store["webhook-events"]).toHaveLength(1);
	});

	it("stores a signed Stripe event", async () => {
		const body = JSON.stringify({
			id: "evt_stripe_1",
			object: "event",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_1",
					object: "checkout.session",
					amount_total: 900,
					currency: "xaf",
					payment_status: "paid",
					status: "complete",
					metadata: { reference: "PI-x" },
				},
			},
		});
		const header = Stripe.webhooks.generateTestHeaderString({
			payload: body,
			secret: STRIPE_SECRET,
		});
		const response = await stripePOST(
			new Request("http://localhost/api/public/boost/webhook/stripe", {
				method: "POST",
				headers: { "stripe-signature": header },
				body,
			}),
		);

		expect(response.status).toBe(200);
		expect(payload.store["webhook-events"][0]).toMatchObject({
			provider: "stripe",
			providerEventId: "evt_stripe_1",
			reference: "PI-x",
		});
	});

	it("answers 400 to a Stripe event signed with another secret", async () => {
		const body = JSON.stringify({
			id: "evt_s",
			object: "event",
			type: "ping",
			data: { object: {} },
		});
		const header = Stripe.webhooks.generateTestHeaderString({
			payload: body,
			secret: "whsec_other",
		});
		const response = await stripePOST(
			new Request("http://localhost/api/public/boost/webhook/stripe", {
				method: "POST",
				headers: { "stripe-signature": header },
				body,
			}),
		);
		expect(response.status).toBe(400);
	});
});
