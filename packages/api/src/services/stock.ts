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
	const type = input.type as ClientMovementType;
	if (!CLIENT_MOVEMENT_TYPES.includes(type)) throw invalid();

	const quantity = Number(input.quantity);
	if (!Number.isInteger(quantity) || quantity === 0) throw invalid();
	if ((type === "receipt" || type === "return") && quantity < 0)
		throw invalid();
	if (type === "loss" && quantity > 0) throw invalid();

	let unitCost: number | null = null;
	if (
		type === "receipt" &&
		input.unitCost !== undefined &&
		input.unitCost !== null &&
		input.unitCost !== ""
	) {
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

/**
 * The adapter declares `updateOne` as returning the DOM's `Document`, so its
 * row arrives untyped. That row is the authoritative post-write state — reading
 * the variant again would race with the next movement — so it is narrowed here
 * rather than re-read.
 */
function isVariantRow(row: unknown): row is ProductVariant {
	return typeof row === "object" && row !== null && "stockOnHand" in row;
}

/**
 * The conditional update is the whole concurrency story: Mongo applies the
 * filter and the increment in one `findOneAndUpdate`, so two losses racing for
 * the last unit cannot both match and neither can overwrite the other's count.
 * A null result means the filter no longer held — the stock moved under us and
 * the movement is refused rather than applied to a stale number. Inside a
 * transaction a loser may instead get a write conflict, which `withTransaction`
 * retries against the new value.
 *
 * The ledger entry is written after the counter, in the same transaction: a
 * failure there rolls the counter back, so a movement and its row land together
 * or not at all.
 */
export async function applyMovement(
	req: PayloadRequest,
	args: {
		variant: ProductVariant;
		type: MovementType;
		quantity: number;
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
	const shopId = relationId(variant.shop);
	if (!shopId) throw invalid();

	const where: Where = {
		and: [
			{ id: { equals: String(variant.id) } },
			...(quantity < 0
				? [{ stockOnHand: { greater_than_equal: -quantity } }]
				: []),
		],
	};

	const updated: unknown = await req.payload.db.updateOne({
		collection: "product-variants",
		where,
		data: { stockOnHand: { $inc: quantity }, trackInventory: true },
		req,
		returning: true,
	});
	// Nothing came back: the filter no longer held, so the stock moved under us
	// and this movement would have been applied to a number that is already
	// stale. Refusing here is what keeps the count off the floor.
	if (!isVariantRow(updated)) {
		throw new ServiceError(ERROR_CODES.stockNegative, 409);
	}

	const stockAfter = Number(updated.stockOnHand);
	const reserved = Number(updated.stockReserved ?? 0);
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
	return {
		movement,
		variant: updated,
		crossedLowStock: crossedLowStock(
			stockAfter - quantity - reserved,
			stockAfter - reserved,
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

				const delta = counted - Number(variant.stockOnHand ?? 0);
				if (delta === 0) {
					results.push({ variantId, delta: 0, stockAfter: counted });
					continue;
				}
				const applied = await applyMovement(req, {
					variant,
					type: "adjustment",
					quantity: delta,
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
