import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import type { RiskFlagStats } from "../../../api/src/contracts/moderationConsole";
import {
	AUTO_EFFECT_LABELS,
	availableDecisions,
	durationChoices,
	evidenceValue,
	falsePositiveRate,
	parseRiskTab,
	RESOLUTION_LABELS,
	RISK_DECISION_LABELS,
	RISK_STATUS_LABELS,
	RISK_SUBJECT_LABELS,
	RISK_TAB_LABELS,
	RISK_TABS,
	type RiskSubjectView,
	riskDecisionBody,
	riskFlagsPath,
	riskStatusView,
	riskSubjectView,
	riskTabCount,
	riskTabHref,
} from "./moderation-risk";

type Json = { [key: string]: Json | string };
const leaf = (root: Json, path: string) =>
	path
		.split(".")
		.reduce<Json | string | undefined>(
			(node, key) => (node && typeof node === "object" ? node[key] : undefined),
			root,
		);

const STATS: RiskFlagStats = {
	open: 9,
	openBySubject: { user: 2, shop: 4, phone: 2, device: 1 },
	highScore: 3,
	highScoreThreshold: 80,
	payoutHeld: 1,
	reviewed: 5,
	decidedLast30Days: 74,
	dismissedLast30Days: 9,
};

const SHOP: RiskSubjectView = {
	type: "shop",
	id: "s1",
	name: "Deïdo Mobile",
	level: 2,
	status: "active",
	sellerCancellationRate: 0.12,
	openDisputes: 1,
};
const USER: RiskSubjectView = {
	type: "user",
	id: "u1",
	name: "Franck",
	accountAgeDays: 14,
	level: 1,
	shops: [],
};
const PHONE: RiskSubjectView = {
	type: "phone",
	label: "+237 6•• •• •• 63",
	linkedUsers: ["u1"],
	linkedShops: ["s1"],
};

describe("risk labels", () => {
	test("every label resolves in both locales", () => {
		const keys = [
			...Object.values(RISK_TAB_LABELS),
			...Object.values(RISK_STATUS_LABELS),
			...Object.values(RISK_SUBJECT_LABELS),
			...Object.values(AUTO_EFFECT_LABELS),
			...Object.values(RESOLUTION_LABELS),
			...Object.values(RISK_DECISION_LABELS).flatMap(({ title, body }) => [
				title,
				body,
			]),
			...Object.keys(RISK_DECISION_LABELS).map(
				(choice) => `risk.decision.confirm.${choice}`,
			),
			...["yes", "no", "none"].map((key) => `risk.value.${key}`),
		];
		for (const key of keys)
			for (const messages of [en, fr])
				expect(typeof leaf(messages as Json, `ModerationConsole.${key}`)).toBe(
					"string",
				);
	});
});

describe("tabs", () => {
	test("unknown tabs fall back to open", () => {
		expect(parseRiskTab(null)).toBe("open");
		expect(parseRiskTab("bogus")).toBe("open");
		expect(parseRiskTab("dismissed")).toBe("dismissed");
	});

	test("each tab maps to the list route's status and subject filters", () => {
		expect(riskFlagsPath("open")).toBe(
			"/api/moderation/risk-flags?status=open",
		);
		expect(riskFlagsPath("shop", "c1")).toBe(
			"/api/moderation/risk-flags?status=open&subjectType=shop&cursor=c1",
		);
		expect(riskFlagsPath("reviewed")).toBe(
			"/api/moderation/risk-flags?status=reviewed",
		);
		expect(riskFlagsPath("dismissed")).toBe(
			"/api/moderation/risk-flags?status=dismissed",
		);
	});

	test("hrefs and counts", () => {
		expect(riskTabHref("/moderation/risk", "open")).toBe("/moderation/risk");
		expect(riskTabHref("/moderation/risk", "phone")).toBe(
			"/moderation/risk?tab=phone",
		);
		expect(RISK_TABS.map((tab) => riskTabCount(STATS, tab))).toEqual([
			9,
			4,
			2,
			2,
			1,
			5,
			null,
		]);
		expect(riskTabCount(undefined, "open")).toBeNull();
	});
});

describe("falsePositiveRate", () => {
	test("dismissals over decisions in 30 days, none without decisions", () => {
		expect(falsePositiveRate(STATS)).toBe(12);
		expect(falsePositiveRate({ ...STATS, decidedLast30Days: 0 })).toBeNull();
	});
});

describe("riskStatusView", () => {
	test("open flags read new, mine or in review; decided ones their status", () => {
		expect(riskStatusView({ status: "open", assignedTo: null }, "m1")).toBe(
			"new",
		);
		expect(riskStatusView({ status: "open", assignedTo: "m1" }, "m1")).toBe(
			"mine",
		);
		expect(riskStatusView({ status: "open", assignedTo: "m2" }, "m1")).toBe(
			"inReview",
		);
		expect(riskStatusView({ status: "reviewed", assignedTo: null }, null)).toBe(
			"monitored",
		);
		expect(riskStatusView({ status: "actioned", assignedTo: "m1" }, "m1")).toBe(
			"actioned",
		);
	});
});

describe("riskSubjectView", () => {
	test("reads what the detail route returns for each subject type", () => {
		expect(
			riskSubjectView({
				type: "shop",
				id: "s1",
				name: "Deïdo Mobile",
				level: 2,
				status: "active",
				rates: { sellerCancellation: 0.12 },
				openDisputes: 1,
			}),
		).toEqual(SHOP);
		expect(
			riskSubjectView({
				type: "user",
				id: "u1",
				name: "Franck",
				accountAgeDays: 14,
				level: 1,
				shops: [{ id: "s1", name: "Deïdo", status: "active", level: 2 }, {}],
				suspensionHistory: [],
			}),
		).toEqual({
			...USER,
			shops: [{ id: "s1", name: "Deïdo", status: "active", level: 2 }],
		});
		expect(
			riskSubjectView({
				type: "phone",
				label: "+237 6•• •• •• 63",
				linkedUsers: ["u1", 4],
				linkedShops: ["s1"],
			}),
		).toEqual(PHONE);
	});

	test("an unidentified subject reads as nothing", () => {
		expect(riskSubjectView({ type: "shop" })).toBeNull();
		expect(riskSubjectView({})).toBeNull();
	});
});

describe("availableDecisions", () => {
	test("open flags can be watched; sanctions follow the subject", () => {
		expect(availableDecisions("open", SHOP)).toEqual([
			"dismiss",
			"monitor",
			"suspend_shop",
			"hold_payouts",
		]);
		expect(availableDecisions("open", USER)).toEqual([
			"dismiss",
			"monitor",
			"suspend_user",
		]);
		expect(availableDecisions("open", PHONE)).toEqual(["dismiss", "monitor"]);
	});

	test("a watched flag can still be decided, a closed one cannot", () => {
		expect(availableDecisions("reviewed", USER)).toEqual([
			"dismiss",
			"suspend_user",
		]);
		expect(availableDecisions("dismissed", USER)).toEqual([]);
		expect(availableDecisions("actioned", SHOP)).toEqual([]);
	});
});

describe("durationChoices", () => {
	test("indefinite suspensions are an administrator's; holds may always run until released", () => {
		expect(durationChoices("suspend_shop", false)).toEqual([7, 30]);
		expect(durationChoices("suspend_user", true)).toEqual([7, 30, null]);
		expect(durationChoices("hold_payouts", false)).toEqual([7, 30, null]);
		expect(durationChoices("dismiss", true)).toEqual([]);
	});
});

describe("riskDecisionBody", () => {
	const base = { subject: SHOP, note: " Self-dealing ", durationDays: 7 };

	test("dismissing is a false positive with a mandatory reason", () => {
		expect(riskDecisionBody("dismiss", base)).toEqual({
			outcome: "dismissed",
			resolution: "false_positive",
			note: "Self-dealing",
		});
		expect(riskDecisionBody("dismiss", { ...base, note: " " })).toBeNull();
	});

	test("watching needs no reason", () => {
		expect(riskDecisionBody("monitor", { ...base, note: "" })).toEqual({
			outcome: "reviewed",
			resolution: "none",
		});
	});

	test("sanctions carry the matching resolution and the subject's id", () => {
		expect(riskDecisionBody("suspend_shop", base)).toEqual({
			outcome: "actioned",
			resolution: "shop_suspended",
			note: "Self-dealing",
			action: {
				type: "suspend_shop",
				targetId: "s1",
				reason: "fraud",
				durationDays: 7,
			},
		});
		expect(
			riskDecisionBody("hold_payouts", { ...base, durationDays: null }),
		).toEqual({
			outcome: "actioned",
			resolution: "payouts_held",
			note: "Self-dealing",
			action: {
				type: "hold_payouts",
				targetId: "s1",
				reason: "moderation",
				durationDays: null,
			},
		});
		expect(
			riskDecisionBody("suspend_user", { ...base, subject: USER }),
		).toEqual({
			outcome: "actioned",
			resolution: "user_suspended",
			note: "Self-dealing",
			action: {
				type: "suspend_user",
				targetId: "u1",
				reason: "fraud",
				durationDays: 7,
			},
		});
	});

	test("a sanction that does not fit the subject, or has no reason, is refused", () => {
		expect(riskDecisionBody("suspend_user", base)).toBeNull();
		expect(
			riskDecisionBody("suspend_shop", { ...base, subject: PHONE }),
		).toBeNull();
		expect(riskDecisionBody("suspend_shop", { ...base, note: "" })).toBeNull();
	});
});

describe("evidenceValue", () => {
	test("words for booleans and nulls, locale digits for numbers", () => {
		expect(evidenceValue(true, "en")).toEqual({ key: "yes" });
		expect(evidenceValue(false, "en")).toEqual({ key: "no" });
		expect(evidenceValue(null, "en")).toEqual({ key: "none" });
		expect(evidenceValue(18400, "en")).toEqual({ text: "18,400" });
		expect(evidenceValue("PO-2609-0415", "fr")).toEqual({
			text: "PO-2609-0415",
		});
	});
});
