import type {
	ShopActivityAction,
	ShopActivityView,
	ShopRole,
} from "../types/api";
import { can } from "./shopRoles";

/** The API's own list and order (`SHOP_ACTIVITY_ACTIONS` in `packages/api/src/collections/ShopActivityLog.ts`). */
export const ACTIVITY_ACTIONS: readonly ShopActivityAction[] = [
	"member.invited",
	"member.invitation_resent",
	"member.invitation_revoked",
	"member.joined",
	"member.role_changed",
	"member.removed",
	"member.left",
	"member.paused",
	"member.resumed",
	"product.created",
	"product.updated",
	"product.published",
	"product.archived",
	"variant.price_changed",
	"variant.cost_changed",
	"stock.moved",
	"listing.attached",
	"listing.detached",
	"shop.updated",
	"shop.handle_changed",
	"shop.closed",
	"conversation.assigned",
	"conversation.status_changed",
	"verification.submitted",
];

export function activityLabelKey(action: ShopActivityAction): string {
	return `shopActivity.actions.${action}`;
}

/**
 * Mobile's own destinations — a product and a variant both open the product
 * screen (a variant has no page of its own), a listing opens its public
 * page, a conversation opens the shop inbox thread (Task 29's route), and a
 * verification request opens the seller verification hub. A member, an
 * invitation and the shop itself have no page here either, so they fall
 * through to `null` exactly as they do on web.
 */
/**
 * The literal routes an activity target can open, rather than `string`.
 * Widening to `string` is what forced a cast at the call site: expo-router's
 * `router.push` takes a union of known route shapes, which an inline template
 * literal satisfies on its own — every other screen in this app pushes
 * `/listing/${id}` with no cast at all. Returning the union keeps that, so the
 * seam is typed instead of silenced.
 */
export type ActivityTargetHref =
	| `/seller/product/${string}`
	| `/listing/${string}`
	| `/seller/inbox/${string}`
	| "/seller/verification";

export function activityTargetHref(
	entry: ShopActivityView,
): ActivityTargetHref | null {
	switch (entry.targetType) {
		case "product":
		case "variant":
			return `/seller/product/${entry.targetId}`;
		case "listing":
			return `/listing/${entry.targetId}`;
		case "conversation":
			return `/seller/inbox/${entry.targetId}`;
		case "verification-request":
			return "/seller/verification";
		default:
			return null;
	}
}

const DASH = "—";

function show(value: unknown): string {
	if (value === null || value === undefined || value === "") return DASH;
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number" || typeof value === "string") {
		return String(value);
	}
	return DASH;
}

/**
 * `variant.cost_changed` is the one action whose `metadata` carries a cost
 * figure — `assertNoCostLeak` on the API refuses to write one anywhere else.
 * `costs.view` is denied to staff, so rendering that one action's diff to a
 * role without it would hand back the margin the permission matrix just
 * took away. The server guards this at write time, but a client is not
 * entitled to assume that stays true forever, so the same rule is enforced
 * again here: an unrecognised or missing role fails closed, same as staff.
 */
export function activityChanges(
	entry: ShopActivityView,
	role: ShopRole | null | undefined,
): Array<{ field: string; before: string; after: string }> {
	if (entry.action === "variant.cost_changed" && !can(role, "costs.view")) {
		return [];
	}

	const metadata = entry.metadata;
	if (!metadata || typeof metadata !== "object") return [];
	const before = (metadata as { before?: unknown }).before;
	const after = (metadata as { after?: unknown }).after;
	if (!before || typeof before !== "object" || Array.isArray(before)) return [];
	if (!after || typeof after !== "object" || Array.isArray(after)) return [];

	const fields = [
		...new Set([
			...Object.keys(before as Record<string, unknown>),
			...Object.keys(after as Record<string, unknown>),
		]),
	];
	return fields.map((field) => ({
		field,
		before: show((before as Record<string, unknown>)[field]),
		after: show((after as Record<string, unknown>)[field]),
	}));
}
