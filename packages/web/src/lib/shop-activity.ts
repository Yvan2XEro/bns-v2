import type {
	ShopActivityAction,
	ShopActivityTargetType,
	ShopActivityView,
} from "~/types";

/** The API's own list and order, so the filter select matches the enum. */
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

/**
 * The same prefix every action already carries (`"member.invited"` ->
 * `"member"`), used to group the 24 actions in the filter select rather than
 * listing them flat.
 */
export function activityActionGroup(action: ShopActivityAction): string {
	return action.split(".")[0] ?? action;
}

export function activityLabelKey(action: ShopActivityAction): string {
	return `shopActivity.actions.${action}`;
}

export function activityTargetHref(entry: ShopActivityView): string | null {
	switch (entry.targetType) {
		case "product":
		case "variant":
			// A variant entry carries its product's id: a variant has no page.
			return `/seller/catalogue/${entry.targetId}`;
		case "listing":
			return `/listing/${entry.targetId}`;
		case "conversation":
			return `/seller/messages?conversation=${entry.targetId}`;
		case "verification-request":
			return "/seller/verification";
		default:
			// A member, an invitation and the shop have no page of their own that
			// a link here would usefully open.
			return null;
	}
}

const DASH = "—";

const showPrimitive = (value: unknown): string => {
	if (value === null || value === undefined || value === "") return DASH;
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number" || typeof value === "string")
		return String(value);
	return DASH;
};

export interface ActivityChangeRow {
	field: string;
	before: string;
	after: string;
}

/**
 * `metadata` is free-form json by design — each action records what it
 * changed. Only the `{ before, after }` shape is rendered as a diff; anything
 * else (a `cause`, a `sendCount`) is left to `activityOtherMetadata`.
 */
export function activityChanges(entry: ShopActivityView): ActivityChangeRow[] {
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
		before: showPrimitive((before as Record<string, unknown>)[field]),
		after: showPrimitive((after as Record<string, unknown>)[field]),
	}));
}

export interface ActivityMetadataRow {
	key: string;
	value: string;
}

const stringifyMetadataValue = (value: unknown): string => {
	if (value === null || value === undefined || value === "") return DASH;
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number" || typeof value === "string")
		return String(value);
	try {
		return JSON.stringify(value);
	} catch {
		return DASH;
	}
};

/**
 * Whatever `activityChanges` did not already turn into a before/after row —
 * a `cause`, a `sendCount`, a `maskedTarget`. When `before`/`after` produced
 * no rows (not every action's metadata uses that shape — `variant.cost_changed`
 * in practice records flat `costBefore`/`costAfter` keys), those two keys are
 * shown here too rather than silently dropped.
 */
export function activityOtherMetadata(
	entry: ShopActivityView,
): ActivityMetadataRow[] {
	const metadata = entry.metadata;
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
		return [];
	const consumedBeforeAfter = activityChanges(entry).length > 0;
	const skip = consumedBeforeAfter
		? new Set(["before", "after"])
		: new Set<string>();
	return Object.entries(metadata as Record<string, unknown>)
		.filter(([key]) => !skip.has(key))
		.map(([key, value]) => ({ key, value: stringifyMetadataValue(value) }));
}

export interface ActivityDetailsView {
	changes: ActivityChangeRow[];
	other: ActivityMetadataRow[];
	/** Something was redacted: the drawer should say so rather than stay silent. */
	costHidden: boolean;
}

/**
 * Gates cost figures a second time, client-side. `recordShopActivity`
 * (`packages/api/src/services/shopActivity.ts`) already refuses to write a
 * cost-looking field on any action but `variant.cost_changed`, matched by
 * the same `/cost/i` substring used here — this is the read-side backstop
 * for the same rule, not a re-derivation of it: `costs.view` is denied to
 * staff, and a cost value sitting in a drawer staff can open would hand back
 * the margin the permission matrix just took away.
 */
export function visibleActivityDetails(
	entry: ShopActivityView,
	canSeeCost: boolean,
): ActivityDetailsView {
	const changes = activityChanges(entry);
	const other = activityOtherMetadata(entry);
	if (canSeeCost) return { changes, other, costHidden: false };

	const visibleChanges = changes.filter((row) => !/cost/i.test(row.field));
	const visibleOther = other.filter((row) => !/cost/i.test(row.key));
	const costHidden =
		visibleChanges.length !== changes.length ||
		visibleOther.length !== other.length;
	return { changes: visibleChanges, other: visibleOther, costHidden };
}

/** Every target type a filter select can offer, in the API's own order. */
export const ACTIVITY_TARGET_TYPES: readonly ShopActivityTargetType[] = [
	"shop",
	"member",
	"invitation",
	"product",
	"variant",
	"listing",
	"conversation",
	"verification-request",
];
