import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	buildSetupSteps,
	type LaunchActionKey,
	SELLER_GUIDE_SECTIONS,
	SELLER_TIP_KEYS,
	type SetupStep,
	type ShopOnboardingFacts,
} from "../../../api/src/contracts/sellerOnboarding";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import {
	GUIDE_TARGETS,
	launchTarget,
	type SellerHomeTarget,
	stepTarget,
	tipTarget,
	whatsappShareUrl,
} from "./sellerHome";

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
const STEPS: SetupStep[] = buildSetupSteps(FACTS);
const LAUNCH: LaunchActionKey[] = [
	"shareWhatsapp",
	"boost",
	"addProducts",
	"verify",
	"addWhatsapp",
	"replyFast",
];

describe("every computed seller-home key exists in both locales", () => {
	const keys = [
		...STEPS.flatMap((s) =>
			["title", "body", "done"].map((f) => `sellerHome.step.${s.key}.${f}`),
		),
		"sellerHome.step.profile.missing",
		"sellerHome.step.product.drafts",
		"sellerHome.step.payout.pending",
		"sellerHome.step.verify.pending",
		...["logo", "banner", "description"].map((p) => `sellerHome.part.${p}`),
		...LAUNCH.flatMap((a) =>
			["title", "body"].map((f) => `sellerHome.launch.${a}.${f}`),
		),
		...SELLER_TIP_KEYS.flatMap((tip) =>
			["title", "body", "action"].map((f) => `sellerHome.tip.${tip}.${f}`),
		),
		...SELLER_GUIDE_SECTIONS.flatMap((s) =>
			["title", "body", "action"].map((f) => `sellerGuide.sections.${s}.${f}`),
		),
	];
	for (const key of keys) {
		test(key, () => {
			expect(typeof get(fr as Json, key)).toBe("string");
			expect(typeof get(en as Json, key)).toBe("string");
		});
	}
});

const APP = join(import.meta.dir, "../../app");

/** Resolves a pushed pathname to a screen file, the way expo-router would. */
function screenExists(pathname: string): boolean {
	let dir = APP;
	const segments = pathname.split("/").filter(Boolean);
	for (const [index, segment] of segments.entries()) {
		const last = index === segments.length - 1;
		const entries = existsSync(dir) ? readdirSync(dir) : [];
		const dynamic = (suffix: string) =>
			entries.find((e) => /^\[[^\]]+\]/.test(e) && e.endsWith(suffix));
		if (last) {
			if (entries.includes(`${segment}.tsx`)) return true;
			if (existsSync(join(dir, segment, "index.tsx"))) return true;
			return Boolean(dynamic(".tsx"));
		}
		const next = entries.includes(segment) ? segment : dynamic("]");
		if (!next) return false;
		dir = join(dir, next);
	}
	return false;
}

function pathOf(target: SellerHomeTarget): string | null {
	if (target.kind !== "route") return null;
	return typeof target.href === "string"
		? target.href
		: String((target.href as { pathname: string }).pathname);
}

describe("every seller-home link opens a screen that exists", () => {
	const targets: SellerHomeTarget[] = [
		...STEPS.map(stepTarget),
		...buildSetupSteps({ ...FACTS, products: { active: 0, drafts: 0 } }).map(
			stepTarget,
		),
		...LAUNCH.map((a) => launchTarget(a, FACTS)),
		...SELLER_TIP_KEYS.map((tip) => tipTarget(tip, FACTS)),
		...Object.values(GUIDE_TARGETS),
	];
	for (const path of new Set(targets.map(pathOf).filter(Boolean))) {
		test(String(path), () => {
			expect(screenExists(String(path))).toBe(true);
		});
	}
});

test("the WhatsApp link carries the whole message", () => {
	expect(whatsappShareUrl("Ma boutique : https://x.test/s/a?b=1")).toBe(
		"https://wa.me/?text=Ma%20boutique%20%3A%20https%3A%2F%2Fx.test%2Fs%2Fa%3Fb%3D1",
	);
});
