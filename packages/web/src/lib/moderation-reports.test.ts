import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import {
	listingDecisionBody,
	listingPhotos,
	nextAfter,
	parseReportFilters,
	parseReportsTab,
	pendingListingsPath,
	populated,
	REPORT_STATUS_LABELS,
	reportDecisionBody,
	reportsHref,
	reportsPath,
	reportTargetHref,
	targetReportsPath,
} from "./moderation-reports";

type Json = { [key: string]: Json | string };
const leaf = (root: Json, path: string) =>
	path
		.split(".")
		.reduce<Json | string | undefined>(
			(node, key) => (node && typeof node === "object" ? node[key] : undefined),
			root,
		);

const params = (search: string) => new URLSearchParams(search);
const decoded = (path: string) => decodeURIComponent(path);

describe("report labels", () => {
	test("every status and listing status resolves in both locales", () => {
		const keys = [
			...Object.values(REPORT_STATUS_LABELS),
			...[
				"draft",
				"pending",
				"published",
				"rejected",
				"sold",
				"expired",
				"deleted",
			].map((status) => `reports.listingStatus.${status}`),
		];
		for (const key of keys)
			for (const messages of [en, fr])
				expect(typeof leaf(messages as Json, `ModerationConsole.${key}`)).toBe(
					"string",
				);
	});
});

describe("parseReportFilters", () => {
	test("defaults to pending and drops unknown codes", () => {
		expect(parseReportFilters(params(""))).toEqual({
			status: "pending",
			reason: undefined,
			target: undefined,
		});
		expect(
			parseReportFilters(params("status=bogus&reason=nope&target=planet")),
		).toEqual({ status: "pending", reason: undefined, target: undefined });
	});

	test("keeps known status, reason and target type", () => {
		expect(
			parseReportFilters(params("status=resolved&reason=fraud&target=shop")),
		).toEqual({ status: "resolved", reason: "fraud", target: "shop" });
	});
});

describe("parseReportsTab", () => {
	test("an explicit tab wins, else an open listing selects the listings tab", () => {
		expect(parseReportsTab(params("tab=listings"), null)).toBe("listings");
		expect(
			parseReportsTab(params("tab=reports"), { type: "listing", id: "l1" }),
		).toBe("reports");
		expect(parseReportsTab(params(""), { type: "listing", id: "l1" })).toBe(
			"listings",
		);
		expect(parseReportsTab(params(""), { type: "report", id: "r1" })).toBe(
			"reports",
		);
		expect(parseReportsTab(params(""), null)).toBe("reports");
	});
});

describe("reportsHref", () => {
	test("omits the default status and drops the open item", () => {
		expect(reportsHref("/moderation/reports", "reports")).toBe(
			"/moderation/reports?tab=reports",
		);
		expect(
			reportsHref("/moderation/reports", "reports", {
				status: "reviewed",
				reason: "spam",
				target: "listing",
			}),
		).toBe(
			"/moderation/reports?tab=reports&status=reviewed&reason=spam&target=listing",
		);
		expect(
			reportsHref("/moderation/reports", "listings", { status: "resolved" }),
		).toBe("/moderation/reports?tab=listings");
	});
});

describe("REST paths", () => {
	test("pending reports oldest first, with the filters as Payload where clauses", () => {
		expect(
			decoded(reportsPath({ status: "pending", reason: "fraud" }, 2)),
		).toBe(
			"/api/reports?where[status][equals]=pending&where[reason][equals]=fraud&sort=createdAt&depth=1&limit=20&page=2",
		);
	});

	test("decided reports most recent first, filtered by target type", () => {
		expect(
			decoded(reportsPath({ status: "resolved", target: "shop" }, 1)),
		).toBe(
			"/api/reports?where[status][equals]=resolved&where[targetType][equals]=shop&sort=-updatedAt&depth=1&limit=20&page=1",
		);
	});

	test("pending listings and reports on one target", () => {
		expect(decoded(pendingListingsPath(3))).toBe(
			"/api/listings?where[status][equals]=pending&sort=createdAt&depth=1&limit=20&page=3",
		);
		expect(decoded(targetReportsPath("listing", "l1"))).toBe(
			"/api/reports?where[targetType][equals]=listing&where[targetId][equals]=l1&sort=-createdAt&depth=0&limit=11",
		);
	});
});

describe("reportTargetHref", () => {
	test("listings open their public page, shops their sheet, the rest nothing", () => {
		expect(reportTargetHref("listing", "l1")).toBe("/listing/l1");
		expect(reportTargetHref("shop", "s1")).toBe("/moderation/shops/s1");
		expect(reportTargetHref("user", "u1")).toBeNull();
		expect(reportTargetHref("message", "m1")).toBeNull();
	});
});

describe("reportDecisionBody", () => {
	test("resolving needs a resolution, dismissing does not", () => {
		expect(reportDecisionBody("resolved", "  ")).toEqual({ ok: false });
		expect(reportDecisionBody("resolved", " Listing removed ")).toEqual({
			ok: true,
			body: { outcome: "resolved", resolution: "Listing removed" },
		});
		expect(reportDecisionBody("dismissed", "")).toEqual({
			ok: true,
			body: { outcome: "dismissed" },
		});
	});

	test("refuses an over-long resolution", () => {
		expect(reportDecisionBody("dismissed", "x".repeat(2001))).toEqual({
			ok: false,
		});
	});
});

describe("listingDecisionBody", () => {
	test("a rejection needs a reason; the note is optional", () => {
		expect(listingDecisionBody("reject", " ", "")).toEqual({ ok: false });
		expect(listingDecisionBody("reject", " Blurry photos ", " ")).toEqual({
			ok: true,
			body: { action: "reject", reason: "Blurry photos" },
		});
		expect(listingDecisionBody("approve", "ignored", "Checked")).toEqual({
			ok: true,
			body: { action: "approve", note: "Checked" },
		});
	});
});

describe("nextAfter", () => {
	test("moves to the next item, the previous at the end, nothing when alone", () => {
		expect(nextAfter(["a", "b", "c"], "a")).toBe("b");
		expect(nextAfter(["a", "b", "c"], "c")).toBe("b");
		expect(nextAfter(["a"], "a")).toBeNull();
		expect(nextAfter(["a", "b"], "z")).toBeNull();
	});
});

describe("populated and listingPhotos", () => {
	test("a bare id is not populated", () => {
		expect(populated("u1")).toBeNull();
		expect(populated(null)).toBeNull();
		expect(populated({ id: "u1" })).toEqual({ id: "u1" });
	});

	test("keeps only photos that resolved to a URL", () => {
		expect(
			listingPhotos({
				images: [
					{ id: "i1", image: { url: "/a.jpg", thumbnailURL: "/a-t.jpg" } },
					{ id: "i2", image: "m2" },
					{ id: "i3", image: { url: "/c.jpg" } },
				],
			}),
		).toEqual([
			{ key: "i1", url: "/a.jpg", thumb: "/a-t.jpg" },
			{ key: "i3", url: "/c.jpg", thumb: "/c.jpg" },
		]);
		expect(listingPhotos({ images: null })).toEqual([]);
	});
});
