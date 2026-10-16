import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import {
	buildSetupSteps,
	type LaunchActionKey,
	SELLER_GUIDE_SECTIONS,
	SELLER_TIP_KEYS,
	type ShopOnboardingFacts,
} from "../../../api/src/contracts/sellerOnboarding";
import {
	GUIDE_TARGETS,
	launchTarget,
	type SellerHomeTarget,
	stepTarget,
	tipTarget,
	whatsappShareUrl,
} from "./seller-home";

type Json = { [key: string]: Json | string };
const get = (root: Json, path: string) =>
	path
		.split(".")
		.reduce<Json | string | undefined>(
			(node, key) => (node && typeof node === "object" ? node[key] : undefined),
			root,
		);

const FACTS: ShopOnboardingFacts = {
	profile: {
		logo: false,
		banner: false,
		description: false,
		brandColor: false,
		whatsapp: false,
	},
	products: { active: 0, drafts: 1 },
	personalListings: 2,
	delivery: { applies: true, zones: 0, pickupPoints: 0 },
	verification: { applies: true, level: 1, openRequest: false },
	payout: { applies: true, active: false, pending: false },
	resale: { applies: true },
	traction: { orders: 0, conversations: 0 },
	boostListingId: "l-1",
	can: {
		editSettings: true,
		editCatalogue: true,
		submitVerification: true,
		managePayments: true,
		reply: true,
		resale: true,
	},
};
const STEPS = buildSetupSteps(FACTS);
const LAUNCH: LaunchActionKey[] = [
	"shareWhatsapp",
	"boost",
	"addProducts",
	"verify",
	"addWhatsapp",
	"replyFast",
];

describe("every computed seller-home message exists in both languages", () => {
	const keys = [
		...STEPS.flatMap((s) =>
			["title", "body", "done"].map((f) => `SellerHome.step.${s.key}.${f}`),
		),
		"SellerHome.step.profile.missing",
		"SellerHome.step.product.drafts",
		"SellerHome.step.payout.pending",
		"SellerHome.step.verify.pending",
		...["logo", "banner", "description"].map((p) => `SellerHome.part.${p}`),
		...LAUNCH.flatMap((a) =>
			["title", "body"].map((f) => `SellerHome.launch.${a}.${f}`),
		),
		...SELLER_TIP_KEYS.flatMap((tip) =>
			["title", "body", "action"].map((f) => `SellerHome.tip.${tip}.${f}`),
		),
		...SELLER_GUIDE_SECTIONS.flatMap((s) =>
			["title", "body", "action"].map((f) => `SellerGuide.sections.${s}.${f}`),
		),
	];
	for (const key of keys) {
		test(key, () => {
			expect(typeof get(fr as Json, key)).toBe("string");
			expect(typeof get(en as Json, key)).toBe("string");
		});
	}
});

const APP = join(import.meta.dir, "../app");

/** Every page path the App Router serves, route groups removed. */
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

describe("every seller-home link opens a page that exists", () => {
	const pages = new Set(pagePaths());
	const targets: SellerHomeTarget[] = [
		...STEPS.map(stepTarget),
		...buildSetupSteps({ ...FACTS, products: { active: 0, drafts: 0 } }).map(
			stepTarget,
		),
		...LAUNCH.map((a) => launchTarget(a, FACTS)),
		...SELLER_TIP_KEYS.map((tip) => tipTarget(tip, FACTS)),
		...Object.values(GUIDE_TARGETS),
	];
	const hrefs = targets.flatMap((t) => (t.kind === "route" ? [t.href] : []));
	for (const href of new Set([...hrefs, "/seller/guide"])) {
		test(href, () => {
			expect(pages.has(href.split("?")[0] as string)).toBe(true);
		});
	}
});

test("boost targets carry the listing the server found", () => {
	expect(launchTarget("boost", FACTS)).toEqual({
		kind: "boost",
		listingId: "l-1",
	});
	expect(tipTarget("boost", { ...FACTS, boostListingId: null })).toEqual({
		kind: "none",
	});
});

test("the WhatsApp link carries the whole message", () => {
	expect(whatsappShareUrl("a b?c")).toBe("https://wa.me/?text=a%20b%3Fc");
});
