// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppSettings } from "../../src/globals/AppSettings";
import { registerConfiguredAdapters } from "../../src/lib/payments/registerAdapters";
import { renderTextPdf } from "../../src/lib/textPdf";
import {
	buildNotchpayEvidence,
	NOTCHPAY_TAGS,
} from "../../src/scripts/packNotchpayEvidence";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const ENV = {
	NOTCHPAY_PUBLIC_KEY: "pk_sandbox_abcd1234",
	NOTCHPAY_BASE_URL: "https://sandbox.example.test",
};

function seedFixtures(options: {
	open?: Record<string, string[]>;
	verified?: string[];
}) {
	const dir = mkdtempSync(join(tmpdir(), "np-evidence-"));
	mkdirSync(join(dir, "manifest"));
	mkdirSync(join(dir, "webhooks"));
	const open = options.open ?? {};
	writeFileSync(
		join(dir, "payments.json"),
		JSON.stringify(
			Object.entries(open).map(([key, assumed]) => ({ key, assumed })),
		),
	);
	writeFileSync(
		join(dir, "webhooks", "payment.json"),
		JSON.stringify([{ key: "w", body: {} }]),
	);
	const verified =
		options.verified ??
		NOTCHPAY_TAGS.filter((t) => !Object.values(open).flat().includes(t));
	writeFileSync(
		join(dir, "manifest", "verified.json"),
		JSON.stringify({ verified }),
	);
	return dir;
}

type Status = "passed" | "failed" | "pending" | "skipped" | "todo";
function vitestJson(statuses: Status[]) {
	const dir = mkdtempSync(join(tmpdir(), "np-vitest-"));
	const file = join(dir, "vitest.json");
	writeFileSync(
		file,
		JSON.stringify({
			testResults: [
				{
					// The packer refuses a JSON that does not come from the
					// contract spec, so the seeded run names it.
					name: "tests/int/notchpay-marketplace-contract.int.spec.ts",
					assertionResults: statuses.map((status, i) => ({
						status,
						fullName: `contract test ${i}`,
					})),
				},
			],
		}),
	);
	return file;
}

const pack = (fixturesDir: string, vitestJsonPath: string) =>
	buildNotchpayEvidence({ fixturesDir, vitestJsonPath, now: NOW, env: ENV });

describe("the G5 evidence packer", () => {
	it("emits a document with all sixteen tags cleared from a genuine green record", () => {
		const { refusal, document } = pack(
			seedFixtures({}),
			vitestJson(["passed", "passed", "passed"]),
		);
		expect(refusal).toBeNull();
		const text = (document ?? []).map((l) => l.text);
		expect(text.filter((t) => /cleared$/.test(t))).toHaveLength(16);
		expect(text.filter((t) => /still assumed/.test(t))).toHaveLength(0);
		for (const tag of NOTCHPAY_TAGS) expect(text).toContain(`${tag}  cleared`);
		expect(text).toContain("Run date: 2026-10-08T12:00:00.000Z");
		expect(text).toContain("Sandbox base URL: https://sandbox.example.test");
		expect(text).toContain("Key id: ...1234");
		expect(text).toContain("Contract suite: 3 passed, 0 failed, 0 skipped");
		expect(text.join("\n")).not.toContain("pk_sandbox");
		expect(
			renderTextPdf(document ?? [])
				.subarray(0, 5)
				.toString(),
		).toBe("%PDF-");
	});

	it("refuses while a fixture still carries an assumption tag, naming it", () => {
		const dir = seedFixtures({ open: { "payment-create": ["A10"] } });
		const { refusal, document } = pack(dir, vitestJson(["passed"]));
		expect(refusal).toMatch(/unverified: A10\b/);
		expect(document).toBeUndefined();
	});

	it("refuses a tag that is neither open nor in the verified ledger", () => {
		const dir = seedFixtures({ verified: NOTCHPAY_TAGS.slice(0, 15) });
		const { refusal, document } = pack(dir, vitestJson(["passed"]));
		expect(refusal).toMatch(/unverified: A16\b/);
		expect(document).toBeUndefined();
	});

	it("refuses a failed contract test, naming it", () => {
		const { refusal, document } = pack(
			seedFixtures({}),
			vitestJson(["passed", "failed"]),
		);
		expect(refusal).toMatch(/failed contract tests: contract test 1/);
		expect(document).toBeUndefined();
	});

	it("refuses a skipped contract test, naming it", () => {
		for (const status of ["pending", "skipped", "todo"] as const) {
			const { refusal, document } = pack(
				seedFixtures({}),
				vitestJson(["passed", status]),
			);
			expect(refusal).toMatch(/skipped contract tests: contract test 1/);
			expect(document).toBeUndefined();
		}
	});

	it("refuses a run with no passing test", () => {
		expect(pack(seedFixtures({}), vitestJson([])).refusal).toMatch(
			/no passing test/,
		);
	});
});

describe("the gate record flips with the adapter registered", () => {
	const CM = {
		countryCode: "CM",
		currency: "XAF",
		provider: "notchpay",
		settlementMode: "provider_split",
		channels: ["cm.mtn", "cm.orange"],
		vatRateBps: 1925,
		enabled: true,
	};
	const IDS = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;

	type Hook = (args: {
		data: Record<string, unknown>;
		originalDoc?: Record<string, unknown>;
	}) => unknown;
	const refusalOf = (payments: Record<string, unknown>): string | null => {
		let data: Record<string, unknown> = {
			payments,
			orders: { vatRateBps: 1925 },
		};
		try {
			for (const hook of (AppSettings.hooks?.beforeChange ??
				[]) as unknown as Hook[])
				data = hook({
					data,
					originalDoc: { orders: { vatRateBps: 1925 }, payments: {} },
				}) as Record<string, unknown>;
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	};

	let evidence: Record<string, string>;
	const gates = (ids: readonly string[]) =>
		ids.map((gate) => ({
			gate,
			clearedAt: "2026-10-08T00:00:00.000Z",
			clearedBy: "Product owner",
			evidence: evidence[gate],
			note: null,
		}));
	const payments = (
		ids: readonly string[],
		releaseModel = "provider_schedule",
	) => ({
		protectedPayment: { enabled: true },
		releaseModel,
		markets: [CM],
		gates: gates(ids),
	});

	let savedEnv: NodeJS.ProcessEnv;
	let undo: (() => void) | undefined;
	beforeEach(async () => {
		savedEnv = { ...process.env };
		Object.assign(process.env, {
			NODE_ENV: "production",
			PROTECTED_PAYMENT_ALLOWED: "true",
			NOTCHPAY_PUBLIC_KEY: "pk_flip",
			NOTCHPAY_PRIVATE_KEY: "sk_flip",
			NOTCHPAY_HASH_KEY: "hash_flip",
		});
		Reflect.deleteProperty(process.env, "PAYMENTS_PROVIDER");
		undo = registerConfiguredAdapters();
		const payload = fakePayload();
		evidence = {};
		for (const id of IDS) {
			const doc = await payload.create({
				collection: "payment-gate-evidence",
				data: { filename: `${id}.pdf` },
			});
			evidence[id] = String(doc.id);
		}
	});
	afterEach(() => {
		undo?.();
		process.env = savedEnv;
	});

	it("saves with G1, G2, G4, G5, G6 filed", () => {
		expect(refusalOf(payments(["G1", "G2", "G4", "G5", "G6"]))).toBeNull();
	});

	it("requires G3 under provider_hold, and saves once it is filed", () => {
		const five = ["G1", "G2", "G4", "G5", "G6"];
		const refused = refusalOf(payments(five, "provider_hold"));
		expect(refused).toMatch(
			/evidence for G3 \(G3 because releaseModel is provider_hold\)/,
		);
		expect(refusalOf(payments(IDS, "provider_hold"))).toBeNull();
	});

	it("refuses once the G5 row is removed, naming G5", () => {
		const refused = refusalOf(payments(["G1", "G2", "G4", "G6"]));
		expect(refused).toMatch(/evidence for G5\./);
	});

	it("refuses with the adapter-presence sentence once the adapter is unregistered", () => {
		undo?.();
		undo = undefined;
		expect(refusalOf(payments(["G1", "G2", "G4", "G5", "G6"]))).toMatch(
			/no payment adapter is registered for "notchpay" and PAYMENTS_PROVIDER=fake is not set\. Build and register the adapter first\./,
		);
	});
});
