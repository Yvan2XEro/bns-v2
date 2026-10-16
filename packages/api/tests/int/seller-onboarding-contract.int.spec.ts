// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildSetupSteps,
	checklistMode,
	checklistProgress,
	launchActions,
	pickSellerTip,
	SELLER_TIP_KEYS,
	type ShopOnboardingFacts,
	sellerHomeStage,
} from "../../src/contracts/sellerOnboarding";

const OWNER_CAN = {
	editSettings: true,
	editCatalogue: true,
	submitVerification: true,
	managePayments: true,
	reply: true,
	resale: true,
};

function facts(over: Partial<ShopOnboardingFacts> = {}): ShopOnboardingFacts {
	return {
		profile: {
			logo: false,
			banner: false,
			description: false,
			brandColor: false,
			whatsapp: false,
		},
		products: { active: 0, drafts: 0 },
		personalListings: 0,
		delivery: { applies: false, zones: 0, pickupPoints: 0 },
		verification: { applies: true, level: 1, openRequest: false },
		payout: { applies: false, active: false, pending: false },
		resale: { applies: false },
		traction: { orders: 0, conversations: 0 },
		boostListingId: null,
		can: OWNER_CAN,
		...over,
	};
}

const READY_PROFILE = {
	logo: true,
	banner: true,
	description: true,
	brandColor: false,
	whatsapp: true,
};

describe("buildSetupSteps", () => {
	it("starts with the pre-checked shop creation and lists required steps first", () => {
		const steps = buildSetupSteps(facts());
		expect(steps.map((s) => s.key)).toEqual([
			"created",
			"profile",
			"product",
			"verify",
			"brand",
		]);
		expect(steps[0]).toMatchObject({ done: true, required: true });
		expect(checklistProgress(steps)).toEqual({ done: 1, total: 3 });
	});

	it("names what the profile still lacks", () => {
		const [, profile] = buildSetupSteps(
			facts({ profile: { ...READY_PROFILE, banner: false } }),
		);
		expect(profile).toMatchObject({ done: false, missing: ["banner"] });
	});

	it("counts only active products; drafts are reported, not counted", () => {
		const product = buildSetupSteps(
			facts({ products: { active: 0, drafts: 2 } }),
		).find((s) => s.key === "product");
		expect(product).toMatchObject({ done: false, drafts: 2 });
	});

	it("adds delivery and payout only where they apply", () => {
		const steps = buildSetupSteps(
			facts({
				delivery: { applies: true, zones: 0, pickupPoints: 1 },
				payout: { applies: true, active: false, pending: true },
			}),
		);
		expect(steps.find((s) => s.key === "delivery")).toMatchObject({
			done: true,
			required: true,
		});
		expect(steps.find((s) => s.key === "payout")).toMatchObject({
			done: false,
			pending: true,
			required: true,
		});
	});

	it("keeps verification and brand colour optional", () => {
		const steps = buildSetupSteps(
			facts({ verification: { applies: true, level: 1, openRequest: true } }),
		);
		expect(steps.find((s) => s.key === "verify")).toMatchObject({
			required: false,
			pending: true,
		});
		expect(steps.find((s) => s.key === "brand")?.required).toBe(false);
	});

	it("shows the move row only while personal listings exist", () => {
		expect(buildSetupSteps(facts()).some((s) => s.key === "move")).toBe(false);
		expect(
			buildSetupSteps(facts({ personalListings: 3 })).find(
				(s) => s.key === "move",
			),
		).toMatchObject({ count: 3, done: false, required: false });
	});

	it("locks steps the role cannot do, never done ones", () => {
		const staff = {
			...OWNER_CAN,
			editSettings: false,
			submitVerification: false,
			managePayments: false,
			resale: false,
		};
		const steps = buildSetupSteps(
			facts({ can: staff, profile: { ...READY_PROFILE, logo: false } }),
		);
		expect(steps.find((s) => s.key === "profile")?.locked).toBe(true);
		expect(steps.find((s) => s.key === "product")?.locked).toBe(false);
		expect(steps.find((s) => s.key === "created")?.locked).toBe(false);
	});
});

describe("sellerHomeStage", () => {
	it("is setup while a required step is open", () => {
		expect(sellerHomeStage(facts())).toBe("setup");
	});

	it("is launch once required steps are done and nothing has sold", () => {
		expect(
			sellerHomeStage(
				facts({ profile: READY_PROFILE, products: { active: 1, drafts: 0 } }),
			),
		).toBe("launch");
	});

	it("is active as soon as there is an order or a buyer conversation, whatever is left", () => {
		expect(
			sellerHomeStage(facts({ traction: { orders: 1, conversations: 0 } })),
		).toBe("active");
		expect(
			sellerHomeStage(facts({ traction: { orders: 0, conversations: 2 } })),
		).toBe("active");
	});
});

describe("checklistMode", () => {
	const open = buildSetupSteps(facts());
	const ready = buildSetupSteps(
		facts({ profile: READY_PROFILE, products: { active: 1, drafts: 0 } }),
	);

	it("is full and cannot be dismissed during setup", () => {
		expect(checklistMode("setup", open, true)).toBe("full");
	});

	it("collapses for an active shop with required steps left, even if dismissed", () => {
		expect(checklistMode("active", open, true)).toBe("collapsed");
	});

	it("offers the complete card while optional steps remain, until dismissed", () => {
		expect(checklistMode("launch", ready, false)).toBe("complete");
		expect(checklistMode("launch", ready, true)).toBe("hidden");
		expect(checklistMode("active", ready, false)).toBe("hidden");
	});
});

describe("launchActions", () => {
	it("leads with WhatsApp and falls back to more products without a boostable listing", () => {
		expect(launchActions(facts())).toEqual([
			"shareWhatsapp",
			"addProducts",
			"verify",
			"replyFast",
		]);
	});

	it("offers a boost when one is possible, and the WhatsApp contact once verified", () => {
		expect(
			launchActions(
				facts({
					boostListingId: "l-1",
					verification: { applies: true, level: 2, openRequest: false },
				}),
			),
		).toEqual(["shareWhatsapp", "boost", "addWhatsapp", "replyFast"]);
	});
});

describe("pickSellerTip", () => {
	it("gives one applicable tip and skips dismissed ones", () => {
		const f = facts({ boostListingId: "l-1" });
		expect(pickSellerTip("launch", f, [])).toBe("firstPhoto");
		expect(pickSellerTip("launch", f, ["firstPhoto"])).toBe("whatsappStatus");
		expect(
			pickSellerTip("launch", f, [
				"firstPhoto",
				"whatsappStatus",
				"responseTime",
			]),
		).toBe("boost");
	});

	it("returns null once every tip is dismissed", () => {
		expect(pickSellerTip("active", facts(), [...SELLER_TIP_KEYS])).toBeNull();
	});
});
