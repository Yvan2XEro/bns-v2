// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { reconcilePendingPaymentsTask } from "../../src/jobs/reconcilePendingPayments";
import { reconcilePendingPayments } from "../../src/services/paymentReconciliation";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const ago = (minutes: number) =>
	new Date(NOW.getTime() - minutes * 60_000).toISOString();

const intent = (id: string, overrides: Record<string, unknown>) => ({
	id,
	purpose: "boost",
	targetId: `bp-${id}`,
	amount: 900,
	currency: "XAF",
	provider: "notchpay",
	providerReference: `trx.${id}`,
	reference: `PI-${id}`,
	status: "pending",
	statusHistory: [],
	createdAt: ago(30),
	expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
	...overrides,
});

function world(intents: Record<string, unknown>[]) {
	return fakePayload({
		listings: [{ id: "l-1", status: "published", boostedUntil: null }],
		"boost-payments": intents.map((i) => ({
			id: `bp-${i.id}`,
			listing: "l-1",
			duration: "7",
			status: "pending",
		})),
		"payment-intents": intents,
	});
}

function providerReporting(
	statuses: Record<string, { status: string; amount?: number }>,
) {
	const verifyPayment = vi.fn(async (ref: string) => {
		const report = statuses[ref];
		if (!report) throw new Error(`no answer for ${ref}`);
		return {
			reference: "",
			status: report.status,
			amount: report.amount ?? 900,
			currency: "XAF",
			providerTransactionId: ref,
		};
	});
	return { verifyPayment, getProvider: () => ({ verifyPayment }) as never };
}

const statusOf = (payload: ReturnType<typeof world>, id: string) =>
	payload.store["payment-intents"].find((i) => i.id === id)?.status;

describe("reconcilePendingPayments", () => {
	it("settles an intent the provider reports as paid", async () => {
		const payload = world([intent("a", {})]);
		const { getProvider } = providerReporting({
			"trx.a": { status: "succeeded" },
		});

		const stats = await reconcilePendingPayments(payload, {
			now: NOW,
			getProvider,
		});

		expect(stats).toMatchObject({
			checked: 1,
			settled: 1,
			expired: 0,
			errors: 0,
		});
		expect(statusOf(payload, "a")).toBe("succeeded");
		expect(
			payload.store["payment-intents"][0].statusHistory.at(-1).source,
		).toBe("reconcile");
	});

	it("leaves intents younger than ten minutes alone", async () => {
		const payload = world([intent("young", { createdAt: ago(5) })]);
		const { verifyPayment, getProvider } = providerReporting({});
		const stats = await reconcilePendingPayments(payload, {
			now: NOW,
			getProvider,
		});
		expect(stats.checked).toBe(0);
		expect(verifyPayment).not.toHaveBeenCalled();
	});

	it("expires a pending intent past expiresAt and fails its boost payment", async () => {
		const payload = world([
			intent("old", { expiresAt: ago(1), createdAt: ago(25 * 60) }),
		]);
		const { getProvider } = providerReporting({
			"trx.old": { status: "pending" },
		});

		const stats = await reconcilePendingPayments(payload, {
			now: NOW,
			getProvider,
		});

		expect(stats.expired).toBe(1);
		expect(statusOf(payload, "old")).toBe("expired");
		expect(payload.store["boost-payments"][0].status).toBe("failed");
	});

	it("prefers a late success over expiry", async () => {
		const payload = world([intent("late", { expiresAt: ago(1) })]);
		const { getProvider } = providerReporting({
			"trx.late": { status: "succeeded" },
		});
		await reconcilePendingPayments(payload, { now: NOW, getProvider });
		expect(statusOf(payload, "late")).toBe("succeeded");
	});

	it("never expires an intent whose amount did not match", async () => {
		const payload = world([intent("odd", { expiresAt: ago(1) })]);
		const { getProvider } = providerReporting({
			"trx.odd": { status: "succeeded", amount: 100 },
		});
		await reconcilePendingPayments(payload, { now: NOW, getProvider });
		expect(statusOf(payload, "odd")).toBe("pending");
	});

	it("expires a created intent that never reached the provider", async () => {
		const payload = world([
			intent("stuck", {
				status: "created",
				providerReference: undefined,
				expiresAt: ago(1),
			}),
		]);
		const { verifyPayment, getProvider } = providerReporting({});
		await reconcilePendingPayments(payload, { now: NOW, getProvider });
		expect(verifyPayment).not.toHaveBeenCalled();
		expect(statusOf(payload, "stuck")).toBe("expired");
	});

	it("keeps going when one intent fails", async () => {
		const payload = world([intent("broken", {}), intent("fine", {})]);
		const { getProvider } = providerReporting({
			"trx.fine": { status: "succeeded" },
		});
		const stats = await reconcilePendingPayments(payload, {
			now: NOW,
			getProvider,
		});
		expect(stats).toMatchObject({ checked: 2, settled: 1, errors: 1 });
		expect(payload.logger.error).toHaveBeenCalled();
	});

	it("runs every 15 minutes on the payments queue", () => {
		expect(reconcilePendingPaymentsTask.schedule).toEqual([
			{ cron: "*/15 * * * *", queue: "payments" },
		]);
	});
});
