// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	DEFAULT_TIMEOUT_MS,
	liveTransport,
	TransportFailure,
} from "../../src/lib/payments/notchpayWire";
import {
	loadNotchpayFixtures,
	type NotchPayFixture,
	ReplayTransport,
} from "./helpers/notchpayReplay";

describe("liveTransport", () => {
	let server: Server;
	let baseUrl = "";
	let seen: { headers: IncomingHttpHeaders; url: string; body: string };

	beforeAll(async () => {
		server = createServer((req, res) => {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk;
			});
			req.on("end", () => {
				seen = { headers: req.headers, url: req.url ?? "", body };
				if (req.url?.startsWith("/hang")) return;
				res.setHeader("Content-Type", "application/json");
				if (req.url?.startsWith("/bad")) {
					res.statusCode = 422;
					res.end(JSON.stringify({ message: "nope" }));
				} else if (req.url?.startsWith("/boom")) {
					res.statusCode = 503;
					res.end("<html>down</html>");
				} else res.end(JSON.stringify({ ok: true }));
			});
		});
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const address = server.address();
		baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
	});
	afterAll(() => {
		server.closeAllConnections();
		server.close();
	});

	const make = (timeoutMs?: number) =>
		liveTransport({ baseUrl, publicKey: "pk", privateKey: "sk", timeoutMs });

	it("sends the auth headers, idempotency key, query and body", async () => {
		const res = await make()({
			method: "POST",
			path: "/ok",
			query: { a: "1" },
			body: { x: 1 },
			idempotencyKey: "idem-1",
		});
		expect(res).toEqual({ status: 200, body: { ok: true } });
		expect(seen.url).toBe("/ok?a=1");
		expect(seen.body).toBe('{"x":1}');
		expect(seen.headers).toMatchObject({
			authorization: "pk",
			"x-grant": "sk",
			"idempotency-key": "idem-1",
			"content-type": "application/json",
			accept: "application/json",
		});
	});

	it("omits Idempotency-Key when none is given", async () => {
		await make()({ method: "GET", path: "/ok" });
		expect(seen.headers["idempotency-key"]).toBeUndefined();
		expect(seen.headers.authorization).toBe("pk");
	});

	it("returns 4xx and 5xx as responses, null for an unparseable body", async () => {
		expect(await make()({ method: "GET", path: "/bad" })).toEqual({
			status: 422,
			body: { message: "nope" },
		});
		expect(await make()({ method: "GET", path: "/boom" })).toEqual({
			status: 503,
			body: null,
		});
	});

	it("throws TransportFailure on a hang and on a refused connection", async () => {
		await expect(
			make(50)({ method: "GET", path: "/hang" }),
		).rejects.toBeInstanceOf(TransportFailure);
		const dead = liveTransport({
			baseUrl: "http://127.0.0.1:1",
			publicKey: "pk",
			privateKey: "sk",
		});
		await expect(dead({ method: "GET", path: "/x" })).rejects.toBeInstanceOf(
			TransportFailure,
		);
	});

	it("defaults the timeout to 15 000 ms", () => {
		expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
	});
});

const fixtures: NotchPayFixture[] = [
	{
		key: "charge",
		request: { method: "POST", path: "/payments" },
		response: {
			status: 201,
			body: { transaction: { reference: "{reference}" } },
		},
		sets: "payment:{reference}=pending",
	},
	{
		key: "verify-initial",
		request: {
			method: "GET",
			path: "/payments/{ref}",
			when: "payment:{ref}=initial",
		},
		response: { status: 404, body: { message: "{ref} not found" } },
	},
	{
		key: "verify-pending",
		request: {
			method: "GET",
			path: "/payments/{ref}",
			when: "payment:{ref}=pending",
		},
		response: {
			status: 200,
			body: { transaction: { status: "pending", ref: "{ref}" } },
		},
	},
	{
		key: "verify-succeeded",
		request: {
			method: "GET",
			path: "/payments/{ref}",
			when: "payment:{ref}=succeeded",
		},
		response: {
			status: 200,
			body: { transaction: { status: "complete", ref: "{ref}" } },
		},
	},
	{
		key: "refund",
		request: { method: "POST", path: "/refunds" },
		response: { status: 201, body: {} },
		binds: { refundIdempotencyKey: "body.metadata.idempotency_key" },
	},
	{
		key: "history",
		request: { method: "GET", path: "/balance/history" },
		response: {
			status: 200,
			body: { items: [{ metadata: "{refundIdempotencyKey}" }] },
		},
	},
];

describe("ReplayTransport", () => {
	it("substitutes path tokens and walks the payment state machine", async () => {
		const replay = new ReplayTransport(fixtures);
		const send = replay.transport();
		expect(await send({ method: "GET", path: "/payments/PI-1" })).toEqual({
			status: 404,
			body: { message: "PI-1 not found" },
		});
		await send({
			method: "POST",
			path: "/payments",
			body: { reference: "PI-1" },
		});
		expect(
			(await send({ method: "GET", path: "/payments/PI-1" })).body,
		).toEqual({
			transaction: { status: "pending", ref: "PI-1" },
		});
		replay.setMode("payment:PI-1", "succeeded");
		expect(
			(await send({ method: "GET", path: "/payments/PI-1" })).body,
		).toEqual({
			transaction: { status: "complete", ref: "PI-1" },
		});
		expect((await send({ method: "GET", path: "/payments/PI-2" })).status).toBe(
			404,
		);
	});

	it("carries a bound capture into a later response", async () => {
		const send = new ReplayTransport(fixtures).transport();
		await send({
			method: "POST",
			path: "/refunds",
			body: { metadata: { idempotency_key: "idem-9" } },
		});
		expect(
			(await send({ method: "GET", path: "/balance/history" })).body,
		).toEqual({
			items: [{ metadata: "idem-9" }],
		});
	});

	it("fails closed on an unmatched request and journals it", async () => {
		const replay = new ReplayTransport(fixtures);
		await expect(
			replay.transport()({ method: "PUT", path: "/nowhere" }),
		).rejects.toThrow("no NotchPay fixture for PUT /nowhere");
		expect(replay.journal).toEqual([{ method: "PUT", path: "/nowhere" }]);
	});
});

describe("loadNotchpayFixtures", () => {
	it("round-trips a fixture file from a directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "np-fixtures-"));
		writeFileSync(join(dir, "a.json"), JSON.stringify(fixtures[0]));
		writeFileSync(
			join(dir, "b.json"),
			JSON.stringify([fixtures[1], fixtures[2]]),
		);
		expect(loadNotchpayFixtures(dir).map((f) => f.key)).toEqual([
			"charge",
			"verify-initial",
			"verify-pending",
		]);
	});
});
