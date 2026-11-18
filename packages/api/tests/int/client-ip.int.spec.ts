// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "../../src/lib/clientIp";

function requestWithForwarded(
	value: string,
	extraHeaders: Record<string, string> = {},
) {
	return new Request("http://x", {
		headers: { "x-forwarded-for": value, ...extraHeaders },
	});
}

describe("clientIp", () => {
	afterEach(() => {
		Reflect.deleteProperty(process.env, "TRUSTED_PROXY_COUNT");
	});

	it("trusts the last hop, not the client-supplied prefix", () => {
		expect(clientIp(requestWithForwarded("9.9.9.9, 5.5.5.5"))).toBe("5.5.5.5");
	});

	it("a forged prefix cannot mint a fresh rate-limit bucket: the trusted hop is stable across requests", () => {
		const first = clientIp(requestWithForwarded("attacker-forged-1, 5.5.5.5"));
		const second = clientIp(requestWithForwarded("attacker-forged-2, 5.5.5.5"));
		expect(first).toBe("5.5.5.5");
		expect(second).toBe(first);
	});

	it("trusts a single hop when the client sent no prefix at all", () => {
		expect(clientIp(requestWithForwarded("5.5.5.5"))).toBe("5.5.5.5");
	});

	it("respects a configured trusted proxy count deeper than one", () => {
		process.env.TRUSTED_PROXY_COUNT = "2";
		expect(clientIp(requestWithForwarded("9.9.9.9, 8.8.8.8, 5.5.5.5"))).toBe(
			"8.8.8.8",
		);
	});

	it("falls back to x-real-ip when there are fewer hops than trusted proxies", () => {
		process.env.TRUSTED_PROXY_COUNT = "2";
		const req = requestWithForwarded("5.5.5.5", { "x-real-ip": "10.0.0.1" });
		expect(clientIp(req)).toBe("10.0.0.1");
	});

	it("falls back to unknown with no headers at all", () => {
		expect(clientIp(new Request("http://x"))).toBe("unknown");
	});
});
