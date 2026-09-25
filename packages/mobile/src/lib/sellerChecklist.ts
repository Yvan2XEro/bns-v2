/**
 * Pure "getting started" checklist logic for the seller hub, kept out of the
 * screen so its ordering and completion rules can be tested without
 * rendering React Native.
 */

export type ChecklistStepKey = "logo" | "product" | "move" | "share";

export interface ChecklistStep {
	key: ChecklistStepKey;
	done: boolean;
}

export interface ChecklistInput {
	hasLogo: boolean;
	productCount: number;
	/** Personal listings the owner could move into the shop. */
	personalListings: number;
}

/**
 * "Move my listings" only makes sense when the owner has something to move —
 * unlike logo/product/share, it never auto-completes: moving listings is an
 * explicit, one-time action, not a state the shop can already be in.
 */
export function buildChecklistSteps(input: ChecklistInput): ChecklistStep[] {
	const steps: ChecklistStep[] = [
		{ key: "logo", done: input.hasLogo },
		{ key: "product", done: input.productCount > 0 },
	];
	if (input.personalListings > 0) {
		steps.push({ key: "move", done: false });
	}
	steps.push({ key: "share", done: false });
	return steps;
}

export function countDoneSteps(steps: ChecklistStep[]): number {
	return steps.filter((step) => step.done).length;
}
