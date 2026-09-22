import type {
	CollectionSlug,
	DataFromCollectionSlug,
	Payload,
	PayloadRequest,
	Where,
} from "payload";
import { NOT_ARCHIVED } from "../collections/ProductVariants";
import {
	MOVEMENT_TYPES,
	trustLoadedVariant,
} from "../collections/StockMovements";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import {
	availableOf,
	crossedLowStock,
	isLowStock,
	isOutOfStock,
	variantLabel,
} from "../lib/variants";
import type {
	Product,
	ProductVariant,
	StockMovement,
	User,
} from "../payload-types";
import { requireShopMember } from "./shopGuards";
import type { ServiceUser } from "./shops";

/** What a shopkeeper may write by hand; sales and reservations come from orders. */
export const CLIENT_MOVEMENT_TYPES = [
	"receipt",
	"adjustment",
	"loss",
	"return",
] as const;
export type ClientMovementType = (typeof CLIENT_MOVEMENT_TYPES)[number];
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * The types this service knows how to apply: every one of them moves
 * `stockOnHand`. `reservation` and `release` move `stockReserved` instead, and
 * that arithmetic belongs to the orders phase — applying them here would
 * silently decrement on-hand stock for a sale that has not happened yet.
 */
export const ON_HAND_MOVEMENT_TYPES = [
	"receipt",
	"adjustment",
	"loss",
	"return",
	"sale",
] as const satisfies readonly MovementType[];
export type OnHandMovementType = (typeof ON_HAND_MOVEMENT_TYPES)[number];

export interface MovementRow {
	id: string;
	type: MovementType;
	quantity: number;
	stockAfter: number;
	unitCost: number | null;
	note: string | null;
	createdAt: string;
	actor: { id: string; name: string } | null;
	variant: { id: string; label: string; sku: string | null };
	product: { id: string; title: string };
}

export interface MovementInput {
	type: ClientMovementType;
	quantity: number;
	unitCost: number | null;
	note: string | null;
}

export interface StockCountResult {
	variantId: string;
	delta: number;
	stockAfter: number;
}

const invalid = () => new ServiceError(ERROR_CODES.validation, 400);

const trimmedNote = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;

export function parseMovementInput(
	input: Record<string, unknown>,
): MovementInput {
	const type = CLIENT_MOVEMENT_TYPES.find(
		(candidate) => candidate === input.type,
	);
	if (!type) throw invalid();

	const quantity = Number(input.quantity);
	if (!Number.isInteger(quantity) || quantity === 0) throw invalid();
	if ((type === "receipt" || type === "return") && quantity < 0)
		throw invalid();
	if (type === "loss" && quantity > 0) throw invalid();

	let unitCost: number | null = null;
	const hasUnitCost =
		input.unitCost !== undefined &&
		input.unitCost !== null &&
		input.unitCost !== "";
	// Only a receipt buys stock. Refusing the field elsewhere tells the caller
	// its number was wrong, where dropping it would look accepted and be lost.
	if (hasUnitCost && type !== "receipt") throw invalid();
	if (hasUnitCost) {
		unitCost = Number(input.unitCost);
		if (!Number.isInteger(unitCost) || unitCost < 0) throw invalid();
	}

	return { type, quantity, unitCost, note: trimmedNote(input.note) };
}

export async function findVariant(
	req: PayloadRequest,
	variantId: string,
): Promise<ProductVariant> {
	try {
		return await req.payload.findByID({
			collection: "product-variants",
			id: variantId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
}

const optionalNumber = (value: unknown): boolean =>
	value === null || value === undefined || typeof value === "number";

/**
 * The adapter declares `updateOne` as returning the DOM's `Document`, so its
 * row arrives untyped. That row is the authoritative post-write state — reading
 * the variant again would race with the next movement — so it is narrowed here
 * rather than re-read, and every counter this function goes on to read is part
 * of the check.
 */
function isVariantRow(row: unknown): row is ProductVariant {
	if (typeof row !== "object" || row === null) return false;
	if (!("id" in row) || !("stockOnHand" in row)) return false;
	if (typeof row.stockOnHand !== "number") return false;
	if ("stockReserved" in row && !optionalNumber(row.stockReserved))
		return false;
	return !("lowStockThreshold" in row) || optionalNumber(row.lowStockThreshold);
}

/**
 * A stored `null` and a missing field both mean "no units", and neither matches
 * `equals: 0` in Mongo — the same shape `NOT_ARCHIVED` needs for dates.
 */
function counterEquals(
	field: "stockOnHand" | "stockReserved",
	value: number,
): Where {
	if (value !== 0) return { [field]: { equals: value } };
	return { or: [{ [field]: { equals: 0 } }, { [field]: { equals: null } }] };
}

/**
 * Says which rule refused, at the cost of one read on the refusal path only.
 * The conditional write reports nothing but "no match", and a caller who is
 * told the wrong reason acts on it: a stale count has to be recounted, whereas
 * reserved units are someone else's and will not come back by retrying.
 */
async function refusal(
	req: PayloadRequest,
	variantId: string,
	quantity: number,
	expectedStockOnHand: number | null,
): Promise<ServiceError> {
	const current = await req.payload
		.findByID({
			collection: "product-variants",
			id: variantId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!current) return new ServiceError(ERROR_CODES.notFound, 404);

	const onHand = Number(current.stockOnHand ?? 0);
	if (expectedStockOnHand !== null && onHand !== expectedStockOnHand) {
		return new ServiceError(ERROR_CODES.stockCountStale, 409);
	}
	if (quantity < 0) {
		if (onHand + quantity < 0) {
			return new ServiceError(ERROR_CODES.stockNegative, 409);
		}
		return new ServiceError(ERROR_CODES.stockInsufficient, 409);
	}
	// The filter held nothing this movement could have broken.
	return new ServiceError(ERROR_CODES.server, 500);
}

/**
 * The conditional update is the whole concurrency story: Mongo applies the
 * filter and the increment in one `findOneAndUpdate`, so two movements racing
 * for the last unit cannot both match and neither can overwrite the other's
 * count. Every value this movement was decided against travels in the filter:
 *
 * - a consuming movement may only take from what is not reserved, so it carries
 *   both the reserved figure it was checked against and the on-hand floor that
 *   figure implies;
 * - `expectedStockOnHand` turns an absolute instruction — a physical count —
 *   into a compare-and-swap, so the second of two people counting the same
 *   variant is refused instead of having their difference applied twice.
 *
 * A null result means one of those no longer held; `refusal` then says which.
 * Inside a transaction a loser may instead get a write conflict, which
 * `withTransaction` retries against the new value.
 *
 * The ledger entry is written after the counter, in the same transaction: a
 * failure there rolls the counter back, so a movement and its row land together
 * or not at all.
 */
export async function applyMovement(
	req: PayloadRequest,
	args: {
		variant: ProductVariant;
		type: OnHandMovementType;
		quantity: number;
		/** The on-hand value the caller's instruction was computed from. */
		expectedStockOnHand?: number | null;
		unitCost?: number | null;
		note?: string | null;
		actorId: string | null;
		orderRef?: string | null;
	},
): Promise<{
	movement: StockMovement;
	variant: ProductVariant;
	crossedLowStock: boolean;
}> {
	const { variant, type, quantity } = args;
	if (!ON_HAND_MOVEMENT_TYPES.includes(type)) {
		throw new ServiceError(
			ERROR_CODES.validation,
			400,
			`A ${type} movement does not move on-hand stock`,
		);
	}
	const shopId = relationId(variant.shop);
	if (!shopId) throw invalid();

	const expectedStockOnHand = args.expectedStockOnHand ?? null;
	const reserved = Number(variant.stockReserved ?? 0);
	const conditions: Where[] = [{ id: { equals: String(variant.id) } }];
	if (expectedStockOnHand !== null) {
		conditions.push(counterEquals("stockOnHand", expectedStockOnHand));
	}
	if (quantity < 0) {
		conditions.push(counterEquals("stockReserved", reserved));
		conditions.push({
			stockOnHand: { greater_than_equal: reserved - quantity },
		});
	}

	const updated: unknown = await req.payload.db.updateOne({
		collection: "product-variants",
		where: { and: conditions },
		data: { stockOnHand: { $inc: quantity }, trackInventory: true },
		req,
		returning: true,
	});
	if (updated === null || updated === undefined) {
		throw await refusal(req, String(variant.id), quantity, expectedStockOnHand);
	}
	if (!isVariantRow(updated)) throw new ServiceError(ERROR_CODES.server, 500);

	const stockAfter = Number(updated.stockOnHand);
	const reservedAfter = Number(updated.stockReserved ?? 0);
	// The ledger hook re-reads the variant to check its shop; hand it the row we
	// already hold so a count of N lines stays N reads, not 2N.
	trustLoadedVariant(req.context, { id: variant.id, shop: variant.shop });
	const movement = await req.payload.create({
		collection: "stock-movements",
		req,
		overrideAccess: true,
		data: {
			variant: String(variant.id),
			product: relationId(variant.product),
			shop: shopId,
			type,
			quantity,
			unitCost: args.unitCost ?? null,
			stockAfter,
			note: args.note ?? null,
			actor: args.actorId,
			orderRef: args.orderRef ?? null,
		},
	});

	const threshold =
		typeof updated.lowStockThreshold === "number"
			? updated.lowStockThreshold
			: null;
	// Both ends of the crossing are measured the way `isLowStock` and
	// `stockSummary` measure availability, so an alert and the figure a
	// shopkeeper is shown never disagree.
	return {
		movement,
		variant: updated,
		crossedLowStock: crossedLowStock(
			availableOf({
				stockOnHand: stockAfter - quantity,
				stockReserved: reservedAfter,
			}),
			availableOf({ stockOnHand: stockAfter, stockReserved: reservedAfter }),
			threshold,
		),
	};
}

async function findByIds<TSlug extends CollectionSlug>(
	payload: Payload,
	collection: TSlug,
	ids: string[],
	req?: PayloadRequest,
): Promise<Map<string, DataFromCollectionSlug<TSlug>>> {
	if (ids.length === 0) return new Map();
	const result = await payload.find({
		collection,
		where: { id: { in: ids } },
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});
	return new Map(result.docs.map((doc) => [String(doc.id), doc]));
}

/** One lookup per related collection, not per row: a page of movements is three reads. */
export async function toMovementRows(
	payload: Payload,
	docs: StockMovement[],
	req?: PayloadRequest,
): Promise<MovementRow[]> {
	const unique = (pick: (doc: StockMovement) => unknown) => [
		...new Set(
			docs
				.map((doc) => relationId(pick(doc)))
				.filter((id): id is string => Boolean(id)),
		),
	];
	const [variants, products, actors] = await Promise.all([
		findByIds(
			payload,
			"product-variants",
			unique((d) => d.variant),
			req,
		),
		findByIds(
			payload,
			"products",
			unique((d) => d.product),
			req,
		),
		findByIds(
			payload,
			"users",
			unique((d) => d.actor),
			req,
		),
	]);

	return docs.map((doc) => {
		const variantId = relationId(doc.variant) ?? "";
		const productId = relationId(doc.product) ?? "";
		const variant: ProductVariant | undefined = variants.get(variantId);
		const product: Product | undefined = products.get(productId);
		const actor: User | undefined = actors.get(relationId(doc.actor) ?? "");
		return {
			id: String(doc.id),
			type: doc.type,
			quantity: Number(doc.quantity),
			stockAfter: Number(doc.stockAfter),
			unitCost: typeof doc.unitCost === "number" ? doc.unitCost : null,
			note: doc.note ?? null,
			createdAt: String(doc.createdAt),
			actor: actor
				? { id: String(actor.id), name: String(actor.name ?? "") }
				: null,
			variant: {
				id: variantId,
				label: variantLabel(variant?.optionValues),
				sku: variant?.sku ?? null,
			},
			product: { id: productId, title: String(product?.title ?? "") },
		};
	});
}

export async function recordMovement(
	payload: Payload,
	user: ServiceUser,
	variantId: string,
	input: Record<string, unknown>,
): Promise<{
	movement: MovementRow;
	variant: ProductVariant;
	crossedLowStock: boolean;
}> {
	const parsed = parseMovementInput(input);

	return withTransaction(
		payload,
		async (req) => {
			const variant = await findVariant(req, variantId);
			await requireShopMember(payload, user, relationId(variant.shop) ?? "", {
				writable: true,
				req,
			});
			if (variant.archivedAt) throw invalid();

			const applied = await applyMovement(req, {
				variant,
				...parsed,
				actorId: user.id,
			});
			const [movement] = await toMovementRows(payload, [applied.movement], req);
			return {
				movement,
				variant: applied.variant,
				crossedLowStock: applied.crossedLowStock,
			};
		},
		{ user },
	);
}

function parseCounts(
	counts: unknown,
): { variantId: string; counted: number }[] {
	if (!Array.isArray(counts) || counts.length === 0 || counts.length > 500) {
		throw invalid();
	}
	const parsed = counts.map((entry: unknown) => {
		const row = (entry ?? {}) as { variantId?: unknown; counted?: unknown };
		const variantId = typeof row.variantId === "string" ? row.variantId : "";
		const counted = Number(row.counted);
		if (!variantId || !Number.isInteger(counted) || counted < 0)
			throw invalid();
		return { variantId, counted };
	});
	if (new Set(parsed.map((row) => row.variantId)).size !== parsed.length) {
		throw invalid();
	}
	return parsed;
}

/**
 * A physical count is a batch of adjustments in one transaction: either the
 * whole count lands or none of it does, so the ledger never shows half an
 * inventory. A line that already matches writes nothing.
 *
 * A counted number is absolute, but it reaches the database as a difference, so
 * each line carries the on-hand value that difference was computed from. Two
 * people counting the same variant would otherwise both succeed and both apply
 * their difference, leaving a number neither of them counted and a ledger that
 * agrees with it.
 */
export async function recordStockCount(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: { counts: unknown; note?: unknown },
): Promise<{ results: StockCountResult[] }> {
	const counts = parseCounts(input.counts);
	const note = trimmedNote(input.note);

	return withTransaction(
		payload,
		async (req) => {
			await requireShopMember(payload, user, shopId, { writable: true, req });
			const results: StockCountResult[] = [];

			for (const { variantId, counted } of counts) {
				const variant = await findVariant(req, variantId);
				if (relationId(variant.shop) !== shopId || variant.archivedAt) {
					throw invalid();
				}

				const countedFrom = Number(variant.stockOnHand ?? 0);
				const delta = counted - countedFrom;
				if (delta === 0) {
					results.push({ variantId, delta: 0, stockAfter: counted });
					continue;
				}
				const applied = await applyMovement(req, {
					variant,
					type: "adjustment",
					quantity: delta,
					expectedStockOnHand: countedFrom,
					note,
					actorId: user.id,
				});
				results.push({
					variantId,
					delta,
					stockAfter: Number(applied.variant.stockOnHand),
				});
			}

			return { results };
		},
		{ user },
	);
}

export async function listMovements(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	query: {
		variant?: string | null;
		type?: string | null;
		from?: string | null;
		page?: number;
		limit?: number;
	},
) {
	await requireShopMember(payload, user, shopId);

	const and: Where[] = [{ shop: { equals: shopId } }];
	if (query.variant) and.push({ variant: { equals: query.variant } });
	if (query.type) {
		const types = query.type
			.split(",")
			.filter((type) => (MOVEMENT_TYPES as readonly string[]).includes(type));
		if (types.length) and.push({ type: { in: types } });
	}
	if (query.from && !Number.isNaN(Date.parse(query.from))) {
		and.push({
			createdAt: { greater_than_equal: new Date(query.from).toISOString() },
		});
	}

	const page = Math.max(1, Math.floor(query.page ?? 1));
	const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
	const result = await payload.find({
		collection: "stock-movements",
		where: { and },
		sort: "-createdAt",
		page,
		limit,
		depth: 0,
		overrideAccess: true,
	});

	return {
		docs: await toMovementRows(payload, result.docs),
		totalDocs: result.totalDocs,
		page: result.page ?? page,
		totalPages: result.totalPages,
		hasNextPage: result.hasNextPage,
	};
}

export async function stockSummary(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
) {
	await requireShopMember(payload, user, shopId, { manage: true });

	const variants = (
		await payload.find({
			collection: "product-variants",
			where: { and: [{ shop: { equals: shopId } }, NOT_ARCHIVED] },
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		})
	).docs;
	const products = await findByIds(payload, "products", [
		...new Set(
			variants
				.map((variant) => relationId(variant.product))
				.filter((id): id is string => Boolean(id)),
		),
	]);
	const tracked = variants.filter((variant) => variant.trackInventory === true);

	const alert = (variant: ProductVariant) => {
		const productId = relationId(variant.product) ?? "";
		return {
			variantId: String(variant.id),
			productId,
			productTitle: String(products.get(productId)?.title ?? ""),
			label: variantLabel(variant.optionValues),
			available: availableOf(variant),
			threshold:
				typeof variant.lowStockThreshold === "number"
					? variant.lowStockThreshold
					: null,
		};
	};

	return {
		costValue: tracked.reduce(
			(sum, variant) =>
				sum + Number(variant.stockOnHand ?? 0) * Number(variant.cost ?? 0),
			0,
		),
		unitsOnHand: tracked.reduce(
			(sum, variant) => sum + Number(variant.stockOnHand ?? 0),
			0,
		),
		unitsReserved: tracked.reduce(
			(sum, variant) => sum + Number(variant.stockReserved ?? 0),
			0,
		),
		trackedVariants: tracked.length,
		lowStock: tracked.filter(isLowStock).map(alert),
		outOfStock: tracked.filter(isOutOfStock).map(alert),
	};
}
