/**
 * What the seller home shows for a shop's stage of life: the "first steps"
 * checklist, the launch actions while nothing has sold yet, and one
 * contextual tip. `GET /api/shops/{id}/onboarding` reports the facts; this
 * module alone decides what they mean, so web and mobile cannot drift.
 */

export interface ShopOnboardingFacts {
	/**
	 * A store (`shops.profile`). An agency, a recruiter or a provider has no
	 * catalogue, delivery or payouts: its first step is a first ad.
	 */
	retail: boolean;
	/** The shop's ads that are not products, on the site or under review. */
	ads: { live: number };
	profile: {
		logo: boolean;
		banner: boolean;
		description: boolean;
		brandColor: boolean;
		whatsapp: boolean;
	};
	products: { active: number; drafts: number };
	/** The viewer's own listings outside any shop. */
	personalListings: number;
	/** `applies`: orders and delivery zones are both open for this shop. */
	delivery: { applies: boolean; zones: number; pickupPoints: number };
	verification: {
		applies: boolean;
		/** The effective level: 1 phone, 2 identity, 3 business. */
		level: number;
		openRequest: boolean;
	};
	/** `applies`: protected payment is open in the shop's market and the shop is level 2+. */
	payout: { applies: boolean; active: boolean; pending: boolean };
	resale: { applies: boolean };
	traction: { orders: number; conversations: number };
	/** A published listing of this shop the viewer may boost now, or null. */
	boostListingId: string | null;
	/** What the viewer's role lets them do; computed from the server's role matrix. */
	can: {
		editSettings: boolean;
		editCatalogue: boolean;
		submitVerification: boolean;
		managePayments: boolean;
		reply: boolean;
		resale: boolean;
	};
}

export type SetupStepKey =
	| "created"
	| "profile"
	| "product"
	| "listing"
	| "delivery"
	| "payout"
	| "verify"
	| "brand"
	| "move";

export type ProfilePart = "logo" | "banner" | "description";

export interface SetupStep {
	key: SetupStepKey;
	done: boolean;
	/** Counts toward the shop's stage; optional steps never block it. */
	required: boolean;
	/** Submitted and waiting on someone else (payout review, verification review). */
	pending: boolean;
	/** The viewer's role cannot do this step; shown, but not as a link. */
	locked: boolean;
	/** `profile` only: what is still missing, in display order. */
	missing?: ProfilePart[];
	/** `product` only: drafts that could be published instead of starting over. */
	drafts?: number;
	/** `move` only. */
	count?: number;
}

export type SellerHomeStage = "setup" | "launch" | "active";

export function buildSetupSteps(facts: ShopOnboardingFacts): SetupStep[] {
	const can = facts.can;
	const step = (
		key: SetupStepKey,
		done: boolean,
		required: boolean,
		allowed: boolean,
		extra: Partial<SetupStep> = {},
	): SetupStep => ({
		key,
		done,
		required,
		pending: false,
		locked: !done && !allowed,
		...extra,
	});

	const missing: ProfilePart[] = [];
	if (!facts.profile.logo) missing.push("logo");
	if (!facts.profile.banner) missing.push("banner");
	if (!facts.profile.description) missing.push("description");

	// The head start: the shop already exists, and saying so is what makes a
	// checklist of four feel like one already begun (endowed progress).
	const steps: SetupStep[] = [
		step("created", true, true, true),
		step("profile", missing.length === 0, true, can.editSettings, {
			missing,
		}),
		facts.retail
			? step("product", facts.products.active > 0, true, can.editCatalogue, {
					drafts: facts.products.drafts,
				})
			: step("listing", facts.ads.live > 0, true, can.editCatalogue),
	];
	if (facts.delivery.applies) {
		steps.push(
			step(
				"delivery",
				facts.delivery.zones > 0 || facts.delivery.pickupPoints > 0,
				true,
				can.editSettings,
			),
		);
	}
	if (facts.payout.applies) {
		steps.push(
			step("payout", facts.payout.active, true, can.managePayments, {
				pending: !facts.payout.active && facts.payout.pending,
			}),
		);
	}
	if (facts.verification.applies) {
		const done = facts.verification.level >= 2;
		steps.push(
			step("verify", done, false, can.submitVerification, {
				pending: !done && facts.verification.openRequest,
			}),
		);
	}
	steps.push(step("brand", facts.profile.brandColor, false, can.editSettings));
	// Moving listings is an action, never a state the shop is in: the row
	// exists while there is something to move and leaves once there is not.
	if (facts.personalListings > 0) {
		steps.push(
			step("move", false, false, can.editSettings, {
				count: facts.personalListings,
			}),
		);
	}
	return steps;
}

export function hasTraction(facts: ShopOnboardingFacts): boolean {
	return facts.traction.orders > 0 || facts.traction.conversations > 0;
}

/**
 * Traction wins: an established shop missing a banner is an active shop with
 * a loose end, not a shop sent back to its first day.
 */
export function sellerHomeStage(
	facts: ShopOnboardingFacts,
	steps: SetupStep[] = buildSetupSteps(facts),
): SellerHomeStage {
	if (hasTraction(facts)) return "active";
	return steps.some((s) => s.required && !s.done) ? "setup" : "launch";
}

export interface ChecklistProgress {
	done: number;
	total: number;
}

/** Required steps only: optional ones never hold the bar below 100 %. */
export function checklistProgress(steps: SetupStep[]): ChecklistProgress {
	const required = steps.filter((s) => s.required);
	return {
		done: required.filter((s) => s.done).length,
		total: required.length,
	};
}

/**
 * - `full`: setup stage, every step listed, not dismissible.
 * - `complete`: required steps done, optional ones left; dismissible.
 * - `collapsed`: an active shop with required steps left: one line.
 * - `hidden`: nothing to say, or dismissed once it was allowed to be.
 */
export type ChecklistMode = "full" | "complete" | "collapsed" | "hidden";

export function checklistMode(
	stage: SellerHomeStage,
	steps: SetupStep[],
	dismissed: boolean,
): ChecklistMode {
	const requiredLeft = steps.some((s) => s.required && !s.done);
	if (stage === "setup") return "full";
	if (requiredLeft) return "collapsed";
	// Only a finished checklist may be dismissed, so a stored dismissal never
	// hides a step the shop still needs.
	if (dismissed) return "hidden";
	if (stage === "active") return "hidden";
	return steps.some((s) => !s.required && !s.done && !s.locked)
		? "complete"
		: "hidden";
}

/** True when a step should be shown as a row the viewer can act on. */
export function actionableStep(step: SetupStep): boolean {
	return !step.done && !step.locked && step.key !== "created";
}

export type LaunchActionKey =
	| "shareWhatsapp"
	| "boost"
	| "addProducts"
	| "addListing"
	| "verify"
	| "addWhatsapp"
	| "replyFast";

/** "No sales yet": what brings a first buyer, most effective first. */
export function launchActions(facts: ShopOnboardingFacts): LaunchActionKey[] {
	const actions: LaunchActionKey[] = ["shareWhatsapp"];
	if (facts.boostListingId) actions.push("boost");
	else if (facts.can.editCatalogue)
		actions.push(facts.retail ? "addProducts" : "addListing");
	if (
		facts.verification.applies &&
		facts.verification.level < 2 &&
		!facts.verification.openRequest &&
		facts.can.submitVerification
	) {
		actions.push("verify");
	} else if (!facts.profile.whatsapp && facts.can.editSettings) {
		actions.push("addWhatsapp");
	}
	if (facts.can.reply) actions.push("replyFast");
	return actions;
}

export type SellerTipKey =
	| "whatsappStatus"
	| "firstPhoto"
	| "responseTime"
	| "boost"
	| "verifiedBadge"
	| "brandColor"
	| "resale"
	| "stockAlerts";

/** Every tip, in priority order, with the state that makes it worth saying. */
const TIP_RULES: Array<{
	key: SellerTipKey;
	stages: readonly SellerHomeStage[];
	applies: (facts: ShopOnboardingFacts) => boolean;
}> = [
	{
		key: "firstPhoto",
		stages: ["setup", "launch"],
		applies: (f) => f.retail && f.can.editCatalogue,
	},
	{
		key: "whatsappStatus",
		stages: ["launch", "active"],
		applies: () => true,
	},
	{
		key: "responseTime",
		stages: ["launch", "active"],
		applies: (f) => f.can.reply,
	},
	{
		key: "boost",
		stages: ["launch", "active"],
		applies: (f) => f.boostListingId !== null,
	},
	{
		key: "verifiedBadge",
		stages: ["setup", "launch", "active"],
		applies: (f) =>
			f.verification.applies &&
			f.verification.level < 2 &&
			!f.verification.openRequest &&
			f.can.submitVerification,
	},
	{
		key: "resale",
		stages: ["launch", "active"],
		applies: (f) => f.resale.applies && f.can.resale,
	},
	{
		key: "brandColor",
		stages: ["launch", "active"],
		applies: (f) => !f.profile.brandColor && f.can.editSettings,
	},
	{
		key: "stockAlerts",
		stages: ["active"],
		applies: (f) => f.products.active > 0 && f.can.editCatalogue,
	},
];

export const SELLER_TIP_KEYS: readonly SellerTipKey[] = TIP_RULES.map(
	(r) => r.key,
);

/** One tip at a time (no tour): the first that applies and was not dismissed. */
export function pickSellerTip(
	stage: SellerHomeStage,
	facts: ShopOnboardingFacts,
	dismissed: readonly string[],
): SellerTipKey | null {
	const seen = new Set(dismissed);
	return (
		TIP_RULES.find(
			(rule) =>
				rule.stages.includes(stage) &&
				!seen.has(rule.key) &&
				rule.applies(facts),
		)?.key ?? null
	);
}

/** The seller guide's sections, shared so both platforms tell the same story. */
export const SELLER_GUIDE_SECTIONS = [
	"setup",
	"visibility",
	"orders",
	"payments",
	"trust",
] as const;
export type SellerGuideSection = (typeof SELLER_GUIDE_SECTIONS)[number];

/** Per-device storage keys for the two dismissals; namespaced by shop. */
export function onboardingStorageKeys(shopId: string) {
	return {
		checklist: `bns.seller.checklistDismissed.${shopId}`,
		tips: `bns.seller.tipsDismissed.${shopId}`,
	};
}
