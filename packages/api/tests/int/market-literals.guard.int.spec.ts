// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PKGS = join(import.meta.dirname, "..", "..", "..");
const ROOTS = [
	"api/src",
	"web/src",
	"web/messages",
	"mobile/src",
	"mobile/app",
];
// No 4-digit calling code starts with 237, so a bare `+237` is always Cameroon.
const RETIRED = /\+237|\bXAF\b|FCFA|\b(?:douala|yaound[eé])/i;
const COMMENT = /^\s*(\/\/|\/?\*|\{\/\*)/;

const SHIM =
	"legacy launch-city data; removed with the launchCities shim, one release after the multi-market rollout";
const DEFER =
	"accepted deferral (Tasks 19/21): the client literal stays until the served config carries it";
const TZ =
	"served MarketConfig carries no timezone yet; candidate config field";
const LEGACY_CM = "pre-multi-currency CM-only rows and documents";
// [path part, reason, line needle(s) (omit = whole file)]. A hit anywhere else fails.
// biome-ignore format: one entry per line
const ALLOW: Array<[string, string, (string | string[])?]> = [
	["api/src/lib/marketTime.ts", "LEGACY_TIMEZONE: the single blessed home of the zone"],
	["api/src/migrations/", "migration seeds (p10Markets)"],
	["api/src/payload-types.ts", "generated; the douala|yaounde enums belong to the per-market user gate"],
	["api/src/lib/launchCities.ts", SHIM],
	["api/src/globals/AppSettings.ts", SHIM, 'key: "'],
	["api/src/lib/orderSettings.ts", SHIM, 'key: "'],
	["api/src/lib/paymentSettings.ts", "DEFAULT_MARKETS: the P5 seed constant the migration references", '"XAF"'],
	["api/src/lib/boostPricing.ts", "boost amounts: parked per-market-amounts user gate"],
	["api/src/services/checkout.ts", "DELIVERY_PHONE_PATTERN: seed source, row == constant pinned by checkout-form-parity", "+2376"],
	["api/src/lib/orderFormat.ts", "formatXaf: CM formatter for SMS/chat/receipts, pinned by order-format-parity; remove with the compat release", "FCFA"],
	["api/src/lib/commissionInvoiceDocument.ts", `pre-snapshot documents are XAF (${LEGACY_CM})`, '!== "XAF"'],
	["api/src/services/paymentBackfill.ts", `one-shot backfill of ${LEGACY_CM}`, '"XAF"'],
	["api/src/lib/payments/fakeMarketplace.ts", "test double default currency", '"XAF"'],
	["api/src/seed/", "seed data: category price labels"],
	["api/src/lib/payments/notchpayMarketplace.ts", "provider wire key: the per-currency balance object is read at XAF until a second payout market", "value.XAF"],
	["api/src/scripts/", "ops/seed scripts, never on a request path"],
	["web/src/lib/shipment-tracking.ts", `DELIVERY_TIMEZONE: ${TZ}`],
	["web/src/app/(public)/contact/page.tsx", "the business's own support line, not a market rule", ["tel:+2376", '"+237 652']],
	["web/messages/", "the company's seat (governing-law courts, contact address) and placeholder examples naming a city; copy-veto, not a rule", ['"lawDesc"', '"locationValue"', '"searchNamePlaceholder"', '"etaTextPlaceholder"']],
	["mobile/src/locales/", "placeholder example copy naming a city; copy-veto item, not a rule", ['"saveSearchNamePlaceholder"', '"saveSearchPlaceholderFallback"', '"cityPlaceholder"', '"etaTextPlaceholder"']],
	["src/lib/cameroon-cities.ts", "Cameroon geodata for the city picker (web + mobile), not a market rule", 'region: "'],
	["mobile/src/lib/places.ts", "world geodata for the place picker", 'name: "Yaound'],
	["web/src/lib/checkout-form.ts", SHIM, "districts("],
	["mobile/src/lib/checkoutForm.ts", SHIM, "districts("],
	["mobile/src/lib/deliveryZoneForm.ts", SHIM, 'LaunchCityKey = "douala"'],
	["mobile/src/lib/deliveryLocationForm.ts", SHIM, 'LaunchCityKey = "douala"'],
	["mobile/src/components/delivery/ZoneForm.tsx", SHIM, "labelOf"],
	["mobile/src/components/delivery/LocationForm.tsx", SHIM, "labelOf"],
	["mobile/app/seller/delivery/index.tsx", SHIM, 'item.city === "douala"'],
	["mobile/src/components/delivery/SellerShipmentActions.tsx", `delivery date zone: ${TZ}`],
	["mobile/src/components/delivery/TrackingBlock.tsx", `delivery date zone: ${TZ}`],
	["mobile/app/purchases/[id]/reschedule.tsx", `delivery date zone: ${TZ}`],
	["mobile/src/lib/shipmentTracking.ts", `delivery date zone: ${TZ}`, "DOUALA_OFFSET_MS"],
	["mobile/src/lib/market.ts", "explicit M9 fallback for pre-market APIs; ages out with released clients", "FALLBACK_CURRENCY"],
	["mobile/src/locales/", `common.currency, ${DEFER}`, '"currency": "XAF"'],
	["mobile/app/(tabs)/create/index.tsx", `common.currency defaultValue, ${DEFER}`, "defaultValue"],
	["mobile/app/listing/[id]/edit.tsx", `common.currency defaultValue, ${DEFER}`, "defaultValue"],
	["mobile/src/types/order.ts", `XAF literal types, ${DEFER}`, 'currency: "XAF"'],
	["mobile/app/seller/stock-adjust.tsx", `placeholder, ${DEFER}`, 'placeholder="XAF"'],
];

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === "test" ? [] : walk(path);
		return /\.(test|fixture)\.tsx?$/.test(name) ? [] : [path];
	});
}

const files = ROOTS.flatMap((root) => walk(join(PKGS, root))).map((file) => ({
	rel: relative(PKGS, file),
	lines: readFileSync(file, "utf8").split("\n"),
}));

function allowed(rel: string, line: string): boolean {
	return ALLOW.some(
		([part, , needle]) =>
			rel.includes(part) &&
			(!needle || [needle].flat().some((n) => line.includes(n))),
	);
}

const filesWith = (needle: string, under = "api/src/") =>
	files
		.filter(
			(f) => f.rel.startsWith(under) && f.lines.some((l) => l.includes(needle)),
		)
		.map((f) => f.rel);

describe("the international rule: a retired market literal fails the build", () => {
	it("no market literal outside the allowlist", () => {
		const hits = files.flatMap(({ rel, lines }) =>
			lines.flatMap((line, i) =>
				!COMMENT.test(line) && RETIRED.test(line) && !allowed(rel, line)
					? [`${rel}:${i + 1}: ${line.trim()}`]
					: [],
			),
		);
		expect(hits).toEqual([]);
	});

	it("keeps the allowlist on one screen and reasoned", () => {
		// 40: the widened needle (spaced/bare +237, any-case Douala/Yaoundé) surfaced honest copy and geodata rows.
		expect(ALLOW.length).toBeLessThanOrEqual(40);
		expect(ALLOW.filter(([, reason]) => reason.length < 8)).toEqual([]);
	});

	it("spells the legacy zone in one api module only", () => {
		const homes = filesWith("Africa/Douala").filter(
			(f) =>
				!f.startsWith("api/src/migrations/") && !f.endsWith("payload-types.ts"),
		);
		expect(homes).toEqual(["api/src/lib/marketTime.ts"]);
	});

	it("keeps the CM sequence fallback inside sequences.ts", () => {
		expect(filesWith("LEGACY_MARKET")).toEqual([
			"api/src/services/sequences.ts",
		]);
	});

	it("retires the helper names that lied about their zone", () => {
		const lies =
			/weekBoundsDouala|monthBoundsDouala|doualaDayWindow|previousDoualaDate|previousDoualaBucket|lastThreeDoualaDates/;
		expect(
			files.filter((f) => f.lines.some((l) => lies.test(l))).map((f) => f.rel),
		).toEqual([]);
	});
});
