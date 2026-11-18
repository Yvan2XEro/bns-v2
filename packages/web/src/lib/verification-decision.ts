import { z } from "zod";
import type { ReviewerRequestDetail, VerificationStatus } from "./verification";
import {
	LEVEL3_CHECKLIST_ITEMS,
	REJECT_REASONS,
	REQUEST_INFO_REASONS,
	REVOKE_REASONS,
} from "./verification";

export type DecisionAction =
	| "claim"
	| "release"
	| "request_info"
	| "approve"
	| "reject"
	| "revoke";

/**
 * The three fields the decision dialog always renders. Every action validates
 * the SAME shape, so `useForm` has one type and `zodResolver` one resolver —
 * six schemas of differing shapes gave `Resolver<{}>` and a type error the
 * only other cure for would have been a cast.
 *
 * Which of the three actually matter is the action's business, expressed as
 * refinements below rather than as different object shapes. The server
 * validates authoritatively either way; this decides what the reviewer is
 * allowed to submit.
 */
export interface DecisionFormValues {
	reasonCode: string;
	sellerMessage: string;
	note: string;
}

const BASE = z.object({
	reasonCode: z.string(),
	sellerMessage: z.string(),
	note: z.string(),
});

/** A reason drawn from `allowed`, and a seller message when one is required. */
function decisionRules(
	allowed: readonly string[] | null,
	sellerMessageRequired: boolean,
): z.ZodType<DecisionFormValues> {
	return BASE.superRefine((values, ctx) => {
		if (allowed && !allowed.includes(values.reasonCode)) {
			ctx.addIssue({
				code: "custom",
				path: ["reasonCode"],
				message: "reasonRequired",
			});
		}
		if (sellerMessageRequired && values.sellerMessage.trim().length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["sellerMessage"],
				message: "sellerMessageRequired",
			});
		}
	});
}

const SCHEMAS: Record<DecisionAction, z.ZodType<DecisionFormValues>> = {
	claim: decisionRules(null, false),
	release: decisionRules(null, false),
	request_info: decisionRules(REQUEST_INFO_REASONS, true),
	approve: decisionRules(null, false),
	reject: decisionRules(REJECT_REASONS, true),
	revoke: decisionRules(REVOKE_REASONS, false),
};

/** The zod schema a decision dialog validates against, one per action. */
export function decisionSchema(
	action: DecisionAction,
): z.ZodType<DecisionFormValues> {
	return SCHEMAS[action];
}

/** The field values any one decision dialog can submit, across every action. */
export type DecisionValues = DecisionFormValues;

/** The level-3 checklist, in the fixed order the reviewer works through. */
export const CHECKLIST_ITEMS = LEVEL3_CHECKLIST_ITEMS;

export type ChecklistState = Partial<
	Record<(typeof CHECKLIST_ITEMS)[number], boolean>
>;

/** True only once every item has been explicitly confirmed. */
export function checklistComplete(checklist: ChecklistState): boolean {
	return CHECKLIST_ITEMS.every((item) => checklist[item] === true);
}

type ViewerPermissions = ReviewerRequestDetail["viewer"];

const TERMINAL_STATUSES = new Set<VerificationStatus>([
	"rejected",
	"revoked",
	"expired",
]);

/**
 * The decisions this viewer may take on this request right now. Reads the
 * permissions the server already computed (`canClaim`, `canDecide`,
 * `canRevoke`) rather than re-deriving them from whether a field such as
 * `assignee` happens to be set — that was a P1 bug (a reviewer saw actions
 * the server would have refused).
 *
 * `canDecide` never applies to an approved request: `applyApproval` clears
 * `assignee` on every approval, so `canDecide` (assignee-gated) is always
 * false once a request reaches `approved`. Revoking it reads `canRevoke`
 * instead, which the server computes the same way `revokeRequest` itself
 * authorises — conflict-of-interest and rank, no assignee requirement.
 */
export function availableActions(
	viewer: ViewerPermissions,
	status: VerificationStatus,
): DecisionAction[] {
	if (viewer.conflictOfInterest) return [];
	if (TERMINAL_STATUSES.has(status)) return [];

	if (status === "approved") {
		return viewer.canRevoke ? ["revoke"] : [];
	}

	const actions: DecisionAction[] = [];
	if (viewer.canClaim) actions.push("claim");
	if (viewer.canDecide) {
		actions.push("release", "request_info", "approve", "reject");
	}
	return actions;
}

/**
 * A signed document URL's 60-second TTL leaves little margin: a few seconds
 * before expiry it is treated as already stale so the viewer re-requests
 * ahead of a broken image or iframe rather than after one.
 */
const STALE_BUFFER_MS = 5000;

export function documentUrlIsStale(expiresAt: string, now: Date): boolean {
	const expiresAtMs = Date.parse(expiresAt);
	return expiresAtMs - now.getTime() <= STALE_BUFFER_MS;
}
