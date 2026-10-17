import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import type { ModerationSummary } from "../../../api/src/contracts/moderationConsole";
import {
	consoleHref,
	detailLabel,
	handledHref,
	isAssignable,
	isSectionActive,
	LOG_ACTION_LABELS,
	logActionLabel,
	OPS_SECTIONS,
	parseQueueFilters,
	parseSelection,
	QUEUE_TYPE_LABELS,
	QUEUE_TYPE_ORDER,
	queueQuery,
	REPORT_REASON_LABELS,
	RISK_SIGNAL_LABELS,
	sectionCount,
	selectionParam,
	TARGET_TYPE_LABELS,
	targetLabel,
	typeCount,
	workspaceHref,
} from "./moderation-console";

type Json = { [key: string]: Json | string };
const leaf = (root: Json, path: string) =>
	path
		.split(".")
		.reduce<Json | string | undefined>(
			(node, key) => (node && typeof node === "object" ? node[key] : undefined),
			root,
		);

describe("every console label resolves in both locales", () => {
	const families: Record<string, string[]> = {
		QUEUE_TYPE_LABELS: Object.values(QUEUE_TYPE_LABELS),
		REPORT_REASON_LABELS: Object.values(REPORT_REASON_LABELS),
		RISK_SIGNAL_LABELS: Object.values(RISK_SIGNAL_LABELS),
		TARGET_TYPE_LABELS: Object.values(TARGET_TYPE_LABELS),
		LOG_ACTION_LABELS: Object.values(LOG_ACTION_LABELS),
		computed: [
			...OPS_SECTIONS.map(({ key }) => `nav.${key}`),
			"severity.high",
			"severity.medium",
			"severity.low",
			...QUEUE_TYPE_ORDER.map((type) => `panel.open.${type}`),
		],
	};
	for (const [name, keys] of Object.entries(families))
		test(name, () => {
			for (const key of keys) {
				expect(typeof leaf(en as Json, `ModerationConsole.${key}`)).toBe(
					"string",
				);
				expect(typeof leaf(fr as Json, `ModerationConsole.${key}`)).toBe(
					"string",
				);
			}
		});

	test("detail keys outside the namespace resolve too", () => {
		for (const [type, code] of [
			["dispute", "not_received"],
			["payoutAccount", "orange_money"],
			["verification", "level:2"],
		] as const) {
			const label = detailLabel(type, code);
			if (!label || !("key" in label)) throw new Error(`${type} ${code}`);
			expect(typeof leaf(en as Json, label.key)).toBe("string");
			expect(typeof leaf(fr as Json, label.key)).toBe("string");
		}
	});

	test("the risk-flag assignment has its log label", () => {
		expect(logActionLabel("risk_flag.assign")).toEqual({
			key: "ModerationConsole.logAction.risk_flag_assign",
		});
		expect(
			leaf(fr as Json, "ModerationConsole.logAction.risk_flag_assign"),
		).toBe("Alerte de risque attribuée");
	});
});

describe("detailLabel", () => {
	test("translates each domain's code", () => {
		expect(detailLabel("report", "fraud")).toEqual({
			key: "ModerationConsole.reportReason.fraud",
		});
		expect(detailLabel("risk", "velocity.orders_per_phone")).toEqual({
			key: "ModerationConsole.riskSignal.velocity_orders_per_phone",
		});
		expect(detailLabel("dispute", "damaged")).toEqual({
			key: "Disputes.reason.damaged",
		});
		expect(detailLabel("payoutAccount", "mtn_momo")).toEqual({
			key: "Payments.payoutMethod_mtnMomo",
		});
		expect(detailLabel("verification", "level:3")).toEqual({
			key: "ModerationConsole.level",
			values: { level: 3 },
		});
	});

	test("an unknown or misplaced code falls back to the raw code", () => {
		expect(detailLabel("report", "brand_new_reason")).toEqual({
			raw: "brand_new_reason",
		});
		expect(detailLabel("risk", "fraud")).toEqual({ raw: "fraud" });
		expect(detailLabel("verification", "level:x")).toEqual({ raw: "level:x" });
		expect(detailLabel("listing", "anything")).toEqual({ raw: "anything" });
		expect(logActionLabel("unknown.action")).toEqual({ raw: "unknown.action" });
	});

	test("no detail renders nothing", () => {
		expect(detailLabel("report", null)).toBeNull();
		expect(detailLabel("report", "")).toBeNull();
	});

	test("target labels only for known subjects", () => {
		expect(targetLabel("shop")).toBe("target.shop");
		expect(targetLabel("device")).toBe("target.device");
		expect(targetLabel("planet")).toBeNull();
		expect(targetLabel(null)).toBeNull();
	});
});

describe("URL selection", () => {
	test("round-trips type:id", () => {
		const item = { type: "risk" as const, id: "665f1c2e9b1e8a0012345678" };
		expect(parseSelection(selectionParam(item))).toEqual(item);
	});

	test("refuses malformed or unknown values", () => {
		for (const value of [
			null,
			undefined,
			"",
			"risk",
			":abc",
			"risk:",
			"planet:abc",
			"risk:a/b",
			"report:<script>",
		])
			expect(parseSelection(value)).toBeNull();
	});

	test("the id may contain a colon-free slug", () => {
		expect(parseSelection("payoutAccount:abc-123_x")).toEqual({
			type: "payoutAccount",
			id: "abc-123_x",
		});
	});

	test("filters come from type and mine only", () => {
		const params = new URLSearchParams("type=dispute&mine=1&item=x");
		expect(parseQueueFilters(params)).toEqual({ type: "dispute", mine: true });
		expect(
			parseQueueFilters(new URLSearchParams("type=planet&mine=true")),
		).toEqual({ type: undefined, mine: undefined });
	});

	test("hrefs keep filters and the open item", () => {
		expect(consoleHref("/moderation", {})).toBe("/moderation");
		expect(
			consoleHref(
				"/moderation",
				{ type: "risk", mine: true },
				{ type: "risk", id: "r1" },
			),
		).toBe("/moderation?type=risk&mine=1&item=risk%3Ar1");
		expect(queueQuery({ type: "report" }, "c2")).toBe(
			"?type=report&limit=50&cursor=c2",
		);
		expect(queueQuery({ mine: true }, null)).toBe("?mine=1&limit=50");
	});
});

describe("where a row opens", () => {
	test("verifications and disputes open their workspaces", () => {
		expect(workspaceHref({ type: "verification", id: "v1" })).toBe(
			"/moderation/verification/v1",
		);
		expect(workspaceHref({ type: "dispute", id: "d1" })).toBe(
			"/moderation/disputes/d1",
		);
		expect(workspaceHref({ type: "risk", id: "r1" })).toBeNull();
	});

	test("panel items link to the section that handles them", () => {
		expect(handledHref({ type: "report", id: "a", shopId: null })).toBe(
			"/moderation/reports?item=report%3Aa",
		);
		expect(handledHref({ type: "listing", id: "b", shopId: "s" })).toBe(
			"/moderation/reports?item=listing%3Ab",
		);
		expect(handledHref({ type: "risk", id: "c", shopId: null })).toBe(
			"/moderation/risk?item=risk%3Ac",
		);
		expect(handledHref({ type: "payoutAccount", id: "p", shopId: "s9" })).toBe(
			"/moderation/shops/s9",
		);
		expect(
			handledHref({ type: "payoutAccount", id: "p", shopId: null }),
		).toBeNull();
	});

	test("only verifications, disputes and risk flags can be taken", () => {
		expect(isAssignable("risk")).toBe(true);
		expect(isAssignable("report")).toBe(false);
		expect(isAssignable(undefined)).toBe(false);
	});
});

const APP = join(import.meta.dir, "../app");
function pagePaths(dir = APP, prefix = ""): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			const segment = /^\(.*\)$/.test(entry) ? "" : `/${entry}`;
			return pagePaths(full, prefix + segment);
		}
		return entry === "page.tsx" ? [prefix || "/"] : [];
	});
}

test("every sidebar section and panel link opens a page that exists", () => {
	const pages = new Set(pagePaths());
	const hrefs = [
		...OPS_SECTIONS.map((s) => s.href),
		...QUEUE_TYPE_ORDER.map(
			(type) => handledHref({ type, id: "x", shopId: "s" }) ?? "",
		),
	].map((href) => (href.split("?")[0] ?? "").replace(/\/(x|s)$/, "/[id]"));
	for (const href of hrefs) expect(pages.has(href)).toBe(true);
});

describe("counts", () => {
	const summary: ModerationSummary = {
		pendingListings: 2,
		pendingReports: 3,
		pendingVerifications: 4,
		pendingPayoutAccounts: 5,
		disputesPending: 6,
		disputesOverdue: 1,
		openRiskFlags: 7,
		highRiskFlags: 2,
		total: 22,
	};

	test("chips read the summary", () => {
		expect(QUEUE_TYPE_ORDER.map((type) => typeCount(summary, type))).toEqual([
			3, 2, 4, 6, 7, 5,
		]);
		expect(typeCount(undefined, "risk")).toBeNull();
	});

	test("the sidebar uses the queue total and the summary", () => {
		expect(sectionCount("queue", summary, 30)).toBe(30);
		expect(sectionCount("queue", summary, undefined)).toBeNull();
		expect(sectionCount("reports", summary, 30)).toBe(5);
		expect(sectionCount("verification", summary, 30)).toBe(4);
		expect(sectionCount("disputes", summary, 30)).toBe(6);
		expect(sectionCount("risk", summary, 30)).toBe(7);
		expect(sectionCount("shops", summary, 30)).toBeNull();
		expect(sectionCount("log", summary, 30)).toBeNull();
	});

	test("the queue entry is active on the landing only", () => {
		expect(isSectionActive("/moderation", "/moderation")).toBe(true);
		expect(isSectionActive("/moderation/disputes/d1", "/moderation")).toBe(
			false,
		);
		expect(
			isSectionActive("/moderation/disputes/d1", "/moderation/disputes"),
		).toBe(true);
		expect(
			isSectionActive("/moderation/disputesx", "/moderation/disputes"),
		).toBe(false);
	});
});
