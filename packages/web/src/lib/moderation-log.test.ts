import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import {
	hasLogFilters,
	isAccountId,
	LOG_ROLE_LABELS,
	LOG_TARGET_LABELS,
	logCsvFilename,
	logHref,
	logPath,
	logRoleLabel,
	logTargetHref,
	parseLogFilters,
} from "./moderation-log";

type Json = { [key: string]: Json | string };
const leaf = (root: Json, path: string) =>
	path
		.split(".")
		.reduce<Json | string | undefined>(
			(node, key) => (node && typeof node === "object" ? node[key] : undefined),
			root,
		);

const ACTOR = "64b7f0c2a1b2c3d4e5f60718";

describe("log labels", () => {
	test("every target type and role resolves in both locales", () => {
		for (const key of [
			...Object.values(LOG_TARGET_LABELS),
			...Object.values(LOG_ROLE_LABELS),
		]) {
			expect(typeof leaf(en as Json, `ModerationConsole.${key}`)).toBe(
				"string",
			);
			expect(typeof leaf(fr as Json, `ModerationConsole.${key}`)).toBe(
				"string",
			);
		}
		expect(logRoleLabel("moderator")).toBe("log.role.moderator");
		expect(logRoleLabel("owner")).toBeNull();
	});
});

describe("log filters", () => {
	test("keeps what the API accepts, drops the rest", () => {
		const filters = parseLogFilters(
			new URLSearchParams(
				`action=shop.suspend&targetType=shop&targetId=%20s1%20&actor=${ACTOR}&from=2026-10-01&to=2026-10-17`,
			),
		);
		expect(filters).toEqual({
			action: "shop.suspend",
			targetType: "shop",
			targetId: "s1",
			actor: ACTOR,
			from: "2026-10-01",
			to: "2026-10-17",
		});
		expect(
			parseLogFilters(
				new URLSearchParams(
					"action=shop.delete&targetType=planet&actor=bob&from=yesterday",
				),
			),
		).toEqual({
			action: undefined,
			targetType: undefined,
			targetId: undefined,
			actor: undefined,
			from: undefined,
			to: undefined,
		});
		expect(hasLogFilters({})).toBe(false);
		expect(hasLogFilters({ targetId: "s1" })).toBe(true);
	});

	test("a moderator is filtered by account id only", () => {
		expect(isAccountId(ACTOR)).toBe(true);
		expect(isAccountId("Awa")).toBe(false);
	});

	test("the page URL and the API path carry the same filters; days become bounds", () => {
		expect(
			logHref("/moderation/log", { targetType: "shop", targetId: "s1" }),
		).toBe("/moderation/log?targetType=shop&targetId=s1");
		const path = new URL(
			logPath(
				{ action: "payout.hold", from: "2026-10-01", to: "2026-10-01" },
				{ cursor: "2" },
			),
			"http://x",
		);
		expect(path.pathname).toBe("/api/moderation/log");
		expect(path.searchParams.get("action")).toBe("payout.hold");
		expect(path.searchParams.get("cursor")).toBe("2");
		const from = Date.parse(path.searchParams.get("from") ?? "");
		const to = Date.parse(path.searchParams.get("to") ?? "");
		expect(to - from).toBe(86_400_000 - 1);
		expect(new URL(logPath({}, { format: "csv" }), "http://x").search).toBe(
			"?format=csv",
		);
	});
});

describe("log targets", () => {
	test("each target opens where the console decides it", () => {
		expect(logTargetHref("shop", "s1")).toBe("/moderation/shops/s1");
		expect(logTargetHref("report", "r1")).toBe(
			"/moderation/reports?item=report%3Ar1",
		);
		expect(logTargetHref("listing", "l1")).toBe(
			"/moderation/reports?tab=listings&item=listing%3Al1",
		);
		expect(logTargetHref("risk-flag", "k1")).toBe(
			"/moderation/risk?item=risk%3Ak1",
		);
		expect(logTargetHref("verification-request", "v1")).toBe(
			"/moderation/verification/v1",
		);
		expect(logTargetHref("dispute", "d1")).toBe("/moderation/disputes/d1");
		expect(logTargetHref("user", "u1")).toBeNull();
		expect(logTargetHref("order", "o1")).toBeNull();
	});

	test("the export is named after the day", () => {
		expect(logCsvFilename(new Date(2026, 9, 7, 12))).toBe(
			"moderation-log-2026-10-07.csv",
		);
	});
});
