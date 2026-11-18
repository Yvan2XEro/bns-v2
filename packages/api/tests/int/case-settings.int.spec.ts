// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSettings } from "../../src/globals/AppSettings";
import {
	type CaseGateId,
	getDisputeSettings,
	getReturnSettings,
	hasWithdrawalExclusionApproval,
	isDisputesOpen,
} from "../../src/lib/caseSettings";
import { validateCaseSettings } from "../../src/lib/caseSettingsValidation";
import { fakePayload } from "./helpers/fakePayload";

const findGlobal = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
vi.mock("payload", () => ({
	APIError: class APIError extends Error {},
	getPayload: vi.fn(async () => ({ findGlobal })),
}));

const RETURN_DEFAULTS = {
	shipByDays: 15,
	nonConformityShipByDays: 7,
	sellerPickupDays: 5,
	inspectDays: 3,
	receivePresumptionDays: 7,
	refundDays: 15,
	codRefundConfirmSilenceDays: 7,
	lateDeliveryGraceDays: 7,
	returnWaiverMaxGoodsValue: 10_000,
	refundOutboundDeliveryOnWithdrawal: true,
	maxReturnShippingReimbursement: 5000,
};

const DISPUTE_DEFAULTS = {
	enabled: false,
	submitAutoHours: 24,
	respondHours: 72,
	reminderHours: 48,
	proposalHours: 72,
	maxProposalRounds: 3,
	reviewBusinessDays: 5,
	maxInfoRequests: 2,
	moderatorRefundLimit: 250_000,
	notReceivedMaxDays: 60,
	conformityWindowDays: 15,
	counterfeitWindowDays: 60,
	noShowWindowDays: 7,
	evidenceRetentionDays: 1095,
	evidenceLimit: { perParty: 10, total: 30 },
	strikeEffectsEnabled: false,
	sellerLossFee: 0,
	gates: [],
};

const gate = (id: CaseGateId) => ({
	gate: id,
	clearedAt: "2026-10-01T00:00:00.000Z",
	clearedBy: "Product owner",
	evidence: `evidence-${id}`,
	note: null,
});

const settingsGlobal = (doc: Record<string, unknown>) =>
	fakePayload({}, { globals: { "app-settings": doc } });

describe("getReturnSettings", () => {
	it("fails closed to the spec defaults when the global is unreadable", async () => {
		const unreadable = fakePayload();
		unreadable.failWhen = (method) => method === "findGlobal";
		for (const payload of [unreadable, fakePayload()]) {
			expect(await getReturnSettings(payload)).toEqual(RETURN_DEFAULTS);
		}
	});

	it("reads the admin's returns group", async () => {
		const settings = await getReturnSettings(
			settingsGlobal({ returns: { refundDays: 20, sellerPickupDays: 9 } }),
		);
		expect(settings).toEqual({
			...RETURN_DEFAULTS,
			refundDays: 20,
			sellerPickupDays: 9,
		});
	});

	it("keeps legal defaults for malformed numeric values instead of coercing them to zero", async () => {
		expect(
			await getReturnSettings(
				settingsGlobal({
					returns: {
						shipByDays: "",
						refundDays: false,
						inspectDays: [],
						sellerPickupDays: -1,
						nonConformityShipByDays: 1.5,
					},
				}),
			),
		).toEqual(RETURN_DEFAULTS);
		expect(
			await getDisputeSettings(
				settingsGlobal({
					disputes: {
						respondHours: "",
						proposalHours: false,
						evidenceLimit: { perParty: [], total: -1 },
					},
				}),
			),
		).toEqual(DISPUTE_DEFAULTS);
	});
});

describe("getDisputeSettings", () => {
	it("fails closed: disputes disabled, every field at the spec default", async () => {
		const unreadable = fakePayload();
		unreadable.failWhen = (method) => method === "findGlobal";
		for (const payload of [unreadable, fakePayload()]) {
			expect(await getDisputeSettings(payload)).toEqual(DISPUTE_DEFAULTS);
		}
	});

	it("reads the admin's disputes group and its gates", async () => {
		const settings = await getDisputeSettings(
			settingsGlobal({
				disputes: {
					enabled: true,
					sellerLossFee: 500,
					gates: [gate("G1"), gate("G4")],
				},
			}),
		);
		expect(settings).toEqual({
			...DISPUTE_DEFAULTS,
			enabled: true,
			sellerLossFee: 500,
			gates: [gate("G1"), gate("G4")],
		});
	});
});

describe("withdrawal exclusions", () => {
	it("requires both G1 evidence and its recorded legal exception note", () => {
		expect(hasWithdrawalExclusionApproval([gate("G1")])).toBe(false);
		expect(
			hasWithdrawalExclusionApproval([
				{ ...gate("G1"), note: "Counsel approved the listed exception." },
			]),
		).toBe(true);
		expect(hasWithdrawalExclusionApproval([gate("G2")])).toBe(false);
	});
});

describe("isDisputesOpen", () => {
	it("re-checks the gates on read, not only on save", () => {
		expect(
			isDisputesOpen({
				...DISPUTE_DEFAULTS,
				enabled: true,
				gates: [gate("G2"), gate("G3")],
			}),
		).toBe(true);
		expect(
			isDisputesOpen({ ...DISPUTE_DEFAULTS, enabled: true, gates: [] }),
		).toBe(false);
		expect(
			isDisputesOpen({
				...DISPUTE_DEFAULTS,
				enabled: false,
				gates: [gate("G2"), gate("G3")],
			}),
		).toBe(false);
	});
});

const beforeChange = validateCaseSettings;

const SAVED_ORIGINAL = {
	orders: { withdrawalDays: 15 },
	returns: {},
	disputes: {},
};

/** The hook's refusal message, or null when it let the save through. */
function refusalOf(args: {
	orders?: Record<string, unknown>;
	returns?: Record<string, unknown>;
	disputes?: Record<string, unknown>;
}): string | null {
	try {
		beforeChange({
			data: {
				orders: args.orders ?? { withdrawalDays: 15 },
				returns: args.returns ?? {},
				disputes: args.disputes ?? {},
			},
			originalDoc: SAVED_ORIGINAL,
		});
		return null;
	} catch (error) {
		if (error instanceof Error) return error.message;
		throw error;
	}
}

describe("AppSettings beforeChange — returns and disputes", () => {
	it("registers the tested validator on global saves", () => {
		expect(AppSettings.hooks?.beforeChange).toContain(beforeChange);
	});
	it("lets the shipped defaults save untouched", () => {
		expect(refusalOf({})).toBeNull();
		const out = beforeChange({
			data: { orders: { withdrawalDays: 15 }, returns: {}, disputes: {} },
			originalDoc: SAVED_ORIGINAL,
		});
		expect(out.returns).toEqual({});
		expect(out.disputes).toEqual({});
	});

	it("refuses disputes.enabled without a G2 row", () => {
		expect(
			refusalOf({ disputes: { enabled: true, gates: [gate("G3")] } }),
		).toContain("G2");
	});

	it("refuses disputes.enabled without a G3 row", () => {
		expect(
			refusalOf({ disputes: { enabled: true, gates: [gate("G2")] } }),
		).toContain("G3");
	});

	it("accepts disputes.enabled once both G2 and G3 are filed", () => {
		expect(
			refusalOf({
				disputes: { enabled: true, gates: [gate("G2"), gate("G3")] },
			}),
		).toBeNull();
	});

	it("does not count a gate whose evidence has not been filed", () => {
		expect(
			refusalOf({
				disputes: {
					enabled: true,
					gates: [gate("G2"), { ...gate("G3"), evidence: null }],
				},
			}),
		).toContain("G3");
	});

	it("validates retained flags against removed gates on a partial save", () => {
		expect(() =>
			beforeChange({
				data: { disputes: { gates: [gate("G2")] } },
				originalDoc: {
					disputes: { enabled: true, gates: [gate("G2"), gate("G3")] },
				},
			}),
		).toThrow("G3");
		const patch = { disputes: { respondHours: 96 } };
		expect(
			beforeChange({
				data: patch,
				originalDoc: {
					disputes: { enabled: true, gates: [gate("G2"), gate("G3")] },
				},
			}),
		).toEqual(patch);
	});

	it("allows disabling intake while retaining dispute deadlines", () => {
		const patch = { disputes: { enabled: false, gates: [], respondHours: 96 } };
		expect(
			beforeChange({
				data: patch,
				originalDoc: {
					disputes: { enabled: true, gates: [gate("G2"), gate("G3")] },
				},
			}),
		).toEqual(patch);
	});

	it.each([
		{ orders: { withdrawalDays: 14 } },
		{ returns: { refundDays: 10 } },
	])("guards each G1 legal minimum independently: %j", (patch) => {
		expect(refusalOf(patch)).toContain("G1");
	});

	it("refuses strikeEffectsEnabled without a G4 row", () => {
		expect(refusalOf({ disputes: { strikeEffectsEnabled: true } })).toContain(
			"G4",
		);
	});

	it("refuses sellerLossFee > 0 without a G4 row", () => {
		expect(refusalOf({ disputes: { sellerLossFee: 100 } })).toContain("G4");
	});

	it("accepts strikeEffectsEnabled and sellerLossFee > 0 once G4 is filed", () => {
		expect(
			refusalOf({
				disputes: {
					strikeEffectsEnabled: true,
					sellerLossFee: 100,
					gates: [gate("G4")],
				},
			}),
		).toBeNull();
	});

	it("refuses orders.withdrawalDays: 14 and returns.refundDays: 10 without a G1 row, accepts both with one", () => {
		expect(
			refusalOf({
				orders: { withdrawalDays: 14 },
				returns: { refundDays: 10 },
			}),
		).toContain("G1");
		expect(
			refusalOf({
				orders: { withdrawalDays: 14 },
				returns: { refundDays: 10 },
				disputes: { gates: [gate("G1")] },
			}),
		).toBeNull();
	});
});

describe("GET /api/public/config — disputesEnabled", () => {
	beforeEach(() => {
		findGlobal.mockReset();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("answers disputesEnabled false then true as the gate rows are filed", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);

		findGlobal.mockResolvedValue({ disputes: { enabled: true } });
		expect(await (await GET()).json()).toMatchObject({
			disputesEnabled: false,
		});

		findGlobal.mockResolvedValue({
			disputes: { enabled: true, gates: [gate("G2"), gate("G3")] },
		});
		expect(await (await GET()).json()).toMatchObject({
			disputesEnabled: true,
		});
	});
});
