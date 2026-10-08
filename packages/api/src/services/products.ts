import type { Payload, PayloadRequest } from "payload";
import { can } from "../access/shopRoles";
import { PRODUCT_SERVICE_CONTEXT } from "../collections/Products";
import { NOT_ARCHIVED } from "../collections/ProductVariants";
import { validateListingAttributes } from "../hooks/validation";
import { ERROR_CODES } from "../lib/errors";
import { isRecord } from "../lib/payments/types";
import {
	deriveListingData,
	type ListingCondition,
	listingStatusFor,
} from "../lib/productListing";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { RetryTransaction, withTransaction } from "../lib/transactions";
import {
	combinationKey,
	type OptionDef,
	redactManagerOnlyFields,
} from "../lib/variants";
import type { Listing, Product, ProductVariant, Shop } from "../payload-types";
import { syncSupplierProductAvailability } from "./resale";
import { requireShopMember } from "./shopGuards";
import { isUniqueViolation, type ServiceUser } from "./shops";
import { applyMovement, findVariant } from "./stock";

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const CONDITIONS = [
	"new",
	"like_new",
	"good",
	"fair",
	"poor",
] as const satisfies readonly ListingCondition[];

export interface ParsedVariant {
	id: string | null;
	optionValues: Record<string, string>;
	sku: string | null;
	price: number;
	cost: number | null;
	trackInventory: boolean;
	lowStockThreshold: number | null;
	initialStock: number;
}

export interface ParsedProduct {
	title: string;
	description: string | null;
	category: string;
	condition: ListingCondition | null;
	attributes: Record<string, unknown>;
	images: string[];
	status: ProductStatus;
	options: OptionDef[];
	variants: ParsedVariant[];
	delivery: {
		handlingHours: number | null;
		weightGrams: number | null;
		codAllowed: boolean;
		pickupAllowed: boolean;
	};
	returnPolicy: string | null;
}

function fail(message: string, status = 400): never {
	throw new ServiceError(ERROR_CODES.validation, status, message);
}

function text(value: unknown, max: number): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== "string") fail("Expected text.");
	const trimmed = value.trim();
	if (trimmed.length > max) fail(`Text longer than ${max} characters.`);
	return trimmed || null;
}

function wholeNumber(
	value: unknown,
	options: { nullable: false; max?: number },
): number;
function wholeNumber(
	value: unknown,
	options: { nullable: true; max?: number },
): number | null;
function wholeNumber(
	value: unknown,
	options: { nullable: boolean; max?: number },
): number | null {
	if (value === undefined || value === null || value === "") {
		if (options.nullable) return null;
		fail("A number is required.");
	}
	const n = Number(value);
	if (
		!Number.isInteger(n) ||
		n < 0 ||
		(options.max !== undefined && n > options.max)
	) {
		fail("Expected a whole number.");
	}
	return n;
}

function pick<T extends string>(
	allowed: readonly T[],
	value: unknown,
	message: string,
): T {
	const found = allowed.find((candidate) => candidate === value);
	if (found === undefined) fail(message);
	return found;
}

function parseOptions(raw: unknown): OptionDef[] {
	const rows = Array.isArray(raw) ? raw : [];
	if (rows.length > 3) fail("At most 3 options.");
	const options = rows.map((row) => {
		const option = isRecord(row) ? row : {};
		const name = text(option.name, 30);
		if (!name) fail("Every option needs a name.");
		const values = Array.isArray(option.values)
			? [
					...new Set(
						option.values
							.map((value) => text(value, 30))
							.filter((value): value is string => Boolean(value)),
					),
				]
			: [];
		if (values.length === 0 || values.length > 20) {
			fail("Every option needs 1 to 20 values.");
		}
		return { name, values };
	});
	if (
		new Set(options.map((o) => o.name.toLowerCase())).size !== options.length
	) {
		fail("Option names must differ.");
	}
	return options;
}

function parseVariants(raw: unknown, options: OptionDef[]): ParsedVariant[] {
	const rows = Array.isArray(raw) ? raw : [];
	if (rows.length === 0 || rows.length > 100) {
		fail("A product needs 1 to 100 variants.");
	}
	if (options.length === 0 && rows.length !== 1) {
		fail("A product without options has exactly one variant.");
	}

	const seen = new Set<string>();
	return rows.map((row) => {
		const entry = isRecord(row) ? row : {};
		const values = isRecord(entry.optionValues) ? entry.optionValues : {};
		if (Object.keys(values).length !== options.length) {
			fail("Each variant needs one value per option.");
		}
		const optionValues: Record<string, string> = {};
		for (const option of options) {
			const value = values[option.name];
			if (typeof value !== "string" || !option.values.includes(value)) {
				fail("A variant uses a value its option does not have.");
			}
			optionValues[option.name] = value;
		}
		const key = combinationKey(optionValues, options);
		if (seen.has(key)) fail("Two variants have the same options.");
		seen.add(key);

		return {
			id: typeof entry.id === "string" && entry.id ? entry.id : null,
			optionValues,
			sku: text(entry.sku, 60),
			price: wholeNumber(entry.price, { nullable: false }),
			cost: wholeNumber(entry.cost, { nullable: true }),
			trackInventory: entry.trackInventory !== false,
			lowStockThreshold: wholeNumber(entry.lowStockThreshold, {
				nullable: true,
			}),
			initialStock: wholeNumber(entry.initialStock, { nullable: true }) ?? 0,
		};
	});
}

export function parseProductInput(raw: Record<string, unknown>): ParsedProduct {
	const title = text(raw.title, 120);
	if (!title || title.length < 3) fail("The title needs 3 to 120 characters.");

	const category =
		typeof raw.category === "string" && raw.category
			? raw.category
			: fail("A category is required.");

	const condition =
		raw.condition === undefined ||
		raw.condition === null ||
		raw.condition === ""
			? null
			: pick(CONDITIONS, raw.condition, "Unknown condition.");

	const images = Array.isArray(raw.images)
		? [
				...new Set(
					raw.images.filter(
						(id): id is string => typeof id === "string" && id.length > 0,
					),
				),
			]
		: [];
	if (images.length > 10) fail("At most 10 photos.");

	const options = parseOptions(raw.options);
	const delivery = isRecord(raw.delivery) ? raw.delivery : {};

	return {
		title,
		description: text(raw.description, 5000),
		category,
		condition,
		attributes:
			isRecord(raw.attributes) && !Array.isArray(raw.attributes)
				? raw.attributes
				: {},
		images,
		status: pick(PRODUCT_STATUSES, raw.status, "Unknown status."),
		options,
		variants: parseVariants(raw.variants, options),
		delivery: {
			handlingHours: wholeNumber(delivery.handlingHours, {
				nullable: true,
				max: 720,
			}),
			weightGrams: wholeNumber(delivery.weightGrams, { nullable: true }),
			codAllowed: delivery.codAllowed !== false,
			pickupAllowed: delivery.pickupAllowed === true,
		},
		returnPolicy: text(raw.returnPolicy, 2000),
	};
}

async function validateCategory(
	req: PayloadRequest,
	input: ParsedProduct,
): Promise<void> {
	try {
		await req.payload.findByID({
			collection: "categories",
			id: input.category,
			depth: 0,
			req,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.categoryNotFound, 400);
	}
	const errors = await validateListingAttributes({
		attributes: input.attributes,
		categoryId: input.category,
		payload: req.payload,
	});
	if (errors.length > 0) fail(errors.map((error) => error.message).join("; "));
}

async function assertUniqueSkus(
	req: PayloadRequest,
	shopId: string,
	variants: ParsedVariant[],
): Promise<void> {
	const skus = variants
		.map((variant) => variant.sku)
		.filter((sku): sku is string => Boolean(sku));
	if (new Set(skus).size !== skus.length)
		fail("Two variants share a SKU.", 409);
	if (skus.length === 0) return;

	const ownIds = variants
		.map((variant) => variant.id)
		.filter((id): id is string => Boolean(id));
	const clashes = await req.payload.find({
		collection: "product-variants",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ sku: { in: skus } },
				NOT_ARCHIVED,
				...(ownIds.length ? [{ id: { not_in: ownIds } }] : []),
			],
		},
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
	});
	if (clashes.totalDocs > 0) fail("This SKU is already used in the shop.", 409);
}

function productData(input: ParsedProduct) {
	return {
		title: input.title,
		description: input.description,
		category: input.category,
		condition: input.condition,
		attributes: input.attributes,
		images: input.images.map((image) => ({ image })),
		status: input.status,
		options: input.options,
		delivery: input.delivery,
		returnPolicy: input.returnPolicy,
	};
}

async function liveVariants(
	req: PayloadRequest,
	productId: string,
): Promise<ProductVariant[]> {
	const result = await req.payload.find({
		collection: "product-variants",
		where: { and: [{ product: { equals: productId } }, NOT_ARCHIVED] },
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});
	return result.docs;
}

async function createVariant(
	req: PayloadRequest,
	user: ServiceUser,
	productId: string,
	shopId: string,
	variant: ParsedVariant,
	costAllowed: boolean,
): Promise<ProductVariant> {
	const created = await req.payload.create({
		collection: "product-variants",
		req,
		overrideAccess: true,
		context: PRODUCT_SERVICE_CONTEXT,
		data: {
			product: productId,
			shop: shopId,
			optionValues: variant.optionValues,
			sku: variant.sku,
			price: variant.price,
			cost: costAllowed ? variant.cost : null,
			trackInventory: variant.trackInventory,
			stockOnHand: 0,
			stockReserved: 0,
			lowStockThreshold: costAllowed ? variant.lowStockThreshold : null,
		},
	});
	// Opening stock is a receipt like any other: the ledger explains every unit
	// that exists, including the ones the variant was created with.
	if (variant.initialStock > 0) {
		await applyMovement(req, {
			variant: created,
			type: "receipt",
			quantity: variant.initialStock,
			unitCost: costAllowed ? variant.cost : null,
			actorId: user.id,
		});
	}
	return created;
}

/**
 * The listing this product publishes, whether or not the product still points
 * at it. A product that lost its pointer — a half-applied write, a restore —
 * would otherwise publish a second listing, and the claim guard on `products`
 * only refuses listings owned by *another* product.
 */
async function findProductListing(
	req: PayloadRequest,
	product: Product,
): Promise<{ id: string; status: string; moderationHold: boolean } | null> {
	const listingId = relationId(product.listing);
	if (listingId) {
		const listing = await req.payload
			.findByID({
				collection: "listings",
				id: listingId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (
			listing &&
			relationId(listing.shop) === relationId(product.shop) &&
			relationId(listing.product) === String(product.id)
		) {
			return {
				id: listing.id,
				status: listing.status,
				moderationHold: listing.moderationHold === true,
			};
		}
	}

	const orphan = await req.payload.find({
		collection: "listings",
		where: {
			and: [
				{ product: { equals: product.id } },
				{ shop: { equals: relationId(product.shop) } },
			],
		},
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
	});
	const found = orphan.docs[0];
	return found
		? {
				id: found.id,
				status: found.status,
				moderationHold: found.moderationHold === true,
			}
		: null;
}

export interface SyncListingOptions {
	/**
	 * False refreshes an existing listing but never publishes a missing one.
	 * Bookkeeping passes it: a stock movement must not be what decides a
	 * product is on sale.
	 */
	create?: boolean;
}

/**
 * Creates or refreshes the supplier's listing that publishes a product.
 * Resale listings share the product reference but belong to other shops.
 */
export async function syncProductListing(
	req: PayloadRequest,
	productId: string | null,
	options: SyncListingOptions = {},
): Promise<string | null> {
	if (!productId) return null;
	const mayCreate = options.create !== false;
	const product = await req.payload.findByID({
		collection: "products",
		id: productId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const current = await findProductListing(req, product);
	// Nothing published, and nothing this caller may publish: no shop or variant
	// read, and no listing left behind either — the lookup above ran first.
	if (!current && (!mayCreate || product.status !== "active")) return null;

	const shopId = relationId(product.shop);
	if (!shopId) throw new ServiceError(ERROR_CODES.shopNotFound, 404);
	const shop: Shop = await req.payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
		req,
	});

	const derived = deriveListingData(
		product,
		await liveVariants(req, productId),
		shop,
	);
	const category = derived.category;
	if (!category) throw new ServiceError(ERROR_CODES.categoryNotFound, 400);

	if (!current) {
		if (shop.status !== "active") {
			throw new ServiceError(ERROR_CODES.shopInactive, 409);
		}
		let listing: Listing;
		try {
			listing = await req.payload.create({
				collection: "listings",
				draft: false,
				req,
				overrideAccess: true,
				context: PRODUCT_SERVICE_CONTEXT,
				data: {
					...derived,
					category,
					resale: { desiredStatus: "draft", holds: [] },
					status: listingStatusFor(product.status, null),
				},
			});
		} catch (error) {
			// Two first publishes raced and the partial unique index on
			// `(listings.shop, listings.product)` refused the second row. The winner's listing is
			// the one this product has, so the body re-runs and adopts it: the
			// claim guard on `products` cannot catch this, since each writer
			// claims a listing no *other* product owns.
			if (!isUniqueViolation(error)) throw error;
			throw new RetryTransaction("another writer published this product first");
		}
		await req.payload.update({
			collection: "products",
			id: productId,
			req,
			overrideAccess: true,
			context: PRODUCT_SERVICE_CONTEXT,
			data: { listing: listing.id },
		});
		await syncSupplierProductAvailability(
			req,
			shopId,
			productId,
			listing.status === "published" &&
				derived.productSummary.available === true,
		);
		return listing.id;
	}

	const status = listingStatusFor(
		product.status,
		current.status,
		current.moderationHold === true,
	);
	await req.payload.update({
		collection: "listings",
		id: current.id,
		req,
		overrideAccess: true,
		context: PRODUCT_SERVICE_CONTEXT,
		data: {
			...derived,
			category,
			status,
		},
	});
	await syncSupplierProductAvailability(
		req,
		shopId,
		productId,
		status === "published" && derived.productSummary.available === true,
	);
	if (relationId(product.listing) !== current.id) {
		await req.payload.update({
			collection: "products",
			id: productId,
			req,
			overrideAccess: true,
			context: PRODUCT_SERVICE_CONTEXT,
			data: { listing: current.id },
		});
	}
	return current.id;
}

export async function createProduct(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	raw: Record<string, unknown>,
): Promise<{ product: Product; variants: ProductVariant[] }> {
	const input = parseProductInput(raw);

	return withTransaction(
		payload,
		async (req) => {
			const { role } = await requireShopMember(payload, user, shopId, {
				writable: true,
				req,
			});
			await validateCategory(req, input);
			await assertUniqueSkus(req, shopId, input.variants);

			const product = await req.payload.create({
				collection: "products",
				req,
				overrideAccess: true,
				context: PRODUCT_SERVICE_CONTEXT,
				data: { shop: shopId, ...productData(input) },
			});

			const costAllowed = can(role, "costs.view");
			const productId = product.id;
			for (const variant of input.variants) {
				await createVariant(
					req,
					user,
					productId,
					shopId,
					{ ...variant, id: null },
					costAllowed,
				);
			}

			await syncProductListing(req, productId);
			return {
				product: await req.payload.findByID({
					collection: "products",
					id: productId,
					depth: 0,
					overrideAccess: true,
					req,
				}),
				variants: redactManagerOnlyFields(
					await liveVariants(req, productId),
					costAllowed,
				),
			};
		},
		{ user },
	);
}

export async function updateProduct(
	payload: Payload,
	user: ServiceUser,
	productId: string,
	raw: Record<string, unknown>,
): Promise<{ product: Product; variants: ProductVariant[] }> {
	const input = parseProductInput(raw);

	return withTransaction(
		payload,
		async (req) => {
			let product: Product;
			try {
				product = await req.payload.findByID({
					collection: "products",
					id: productId,
					depth: 0,
					overrideAccess: true,
					req,
				});
			} catch {
				throw new ServiceError(ERROR_CODES.notFound, 404);
			}
			const shopId = relationId(product.shop) ?? "";
			const { role } = await requireShopMember(payload, user, shopId, {
				writable: true,
				req,
			});
			// `catalogue.edit` covers changing a product; taking it out of the
			// catalogue is the separate, staff-excluded lever.
			const archiving =
				input.status === "archived" && product.status !== "archived";
			if (archiving && !can(role, "catalogue.archive")) {
				throw new ServiceError(ERROR_CODES.shopForbidden, 403);
			}
			const costAllowed = can(role, "costs.view");
			await validateCategory(req, input);
			await assertUniqueSkus(req, shopId, input.variants);

			await req.payload.update({
				collection: "products",
				id: productId,
				req,
				overrideAccess: true,
				context: PRODUCT_SERVICE_CONTEXT,
				data: productData(input),
			});

			const kept = new Set<string>();
			for (const variant of input.variants) {
				if (!variant.id) {
					const created = await createVariant(
						req,
						user,
						productId,
						shopId,
						variant,
						costAllowed,
					);
					kept.add(created.id);
					continue;
				}
				const existing = await findVariant(req, variant.id);
				if (relationId(existing.product) !== productId) {
					fail("This variant belongs to another product.");
				}
				kept.add(variant.id);
				await req.payload.update({
					collection: "product-variants",
					id: variant.id,
					req,
					overrideAccess: true,
					context: PRODUCT_SERVICE_CONTEXT,
					data: {
						optionValues: variant.optionValues,
						sku: variant.sku,
						price: variant.price,
						cost: costAllowed ? variant.cost : existing.cost,
						// Sticky on purpose, and only ever upward: `applyMovement`
						// turns tracking on for every variant it writes a movement
						// for, so a variant with a ledger that could be switched back
						// to untracked would show a stock figure nothing maintains
						// while its movements kept accumulating. Untracking one means
						// archiving it and adding a fresh variant.
						trackInventory:
							variant.trackInventory || existing.trackInventory === true,
						lowStockThreshold: costAllowed
							? variant.lowStockThreshold
							: existing.lowStockThreshold,
						archivedAt: null,
					},
				});
			}

			// A variant left out of the input is archived, never deleted: its movements stay.
			const now = new Date().toISOString();
			for (const existing of await liveVariants(req, productId)) {
				if (kept.has(existing.id)) continue;
				await req.payload.update({
					collection: "product-variants",
					id: existing.id,
					req,
					overrideAccess: true,
					context: PRODUCT_SERVICE_CONTEXT,
					data: { archivedAt: now },
				});
			}

			await syncProductListing(req, productId);
			return {
				product: await req.payload.findByID({
					collection: "products",
					id: productId,
					depth: 0,
					overrideAccess: true,
					req,
				}),
				variants: redactManagerOnlyFields(
					await liveVariants(req, productId),
					costAllowed,
				),
			};
		},
		{ user },
	);
}
