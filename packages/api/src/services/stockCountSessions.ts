import type { Payload, PayloadRequest } from "payload";
import { ERROR_CODES } from "../lib/errors";
import { isRecord } from "../lib/payments/types";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import type { StockCountSession } from "../payload-types";
import { requireShopMember, requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

const MAX_LINES = 5000;
const MAX_VALUE_LENGTH = 12;

export interface StockCountSessionView {
	id: string;
	status: StockCountSession["status"];
	startedAt: string;
	startedBy: { id: string; name: string } | null;
	location: { id: string; name: string } | null;
	counts: Record<string, string>;
	updatedAt: string;
}

export interface StockCountOverview {
	session: StockCountSessionView | null;
	lastCompletedAt: string | null;
	locations: { id: string; name: string }[];
}

const invalid = () => new ServiceError(ERROR_CODES.validation, 400);

/** What was typed, as typed: a half-entered count is the seller's draft, not a number yet. */
function parseCounts(raw: unknown): Record<string, string> {
	if (!isRecord(raw)) throw invalid();
	const entries = Object.entries(raw);
	if (entries.length > MAX_LINES) throw invalid();
	const counts: Record<string, string> = {};
	for (const [variantId, value] of entries) {
		if (!variantId || typeof value !== "string") throw invalid();
		const trimmed = value.trim();
		if (trimmed.length > MAX_VALUE_LENGTH) throw invalid();
		if (trimmed) counts[variantId] = trimmed;
	}
	return counts;
}

function storedCounts(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	const counts: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === "string") counts[key] = entry;
	}
	return counts;
}

async function shopLocations(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<{ id: string; name: string }[]> {
	const result = await payload.find({
		collection: "shop-locations",
		where: {
			and: [{ shop: { equals: shopId } }, { active: { equals: true } }],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});
	return result.docs.map((doc) => ({
		id: String(doc.id),
		name: String(doc.name ?? ""),
	}));
}

async function toView(
	payload: Payload,
	session: StockCountSession,
	req?: PayloadRequest,
): Promise<StockCountSessionView> {
	const starterId = relationId(session.startedBy);
	const starter = starterId
		? await payload
				.findByID({
					collection: "users",
					id: starterId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null)
		: null;
	const locationId = relationId(session.location);
	const location = locationId
		? await payload
				.findByID({
					collection: "shop-locations",
					id: locationId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null)
		: null;
	return {
		id: String(session.id),
		status: session.status,
		startedAt: String(session.startedAt),
		startedBy: starter
			? { id: String(starter.id), name: String(starter.name ?? "") }
			: null,
		location: location
			? { id: String(location.id), name: String(location.name ?? "") }
			: null,
		counts: storedCounts(session.counts),
		updatedAt: String(session.updatedAt ?? session.startedAt),
	};
}

async function findOpen(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<StockCountSession | null> {
	const result = await payload.find({
		collection: "stock-count-sessions",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "open" } }],
		},
		sort: "-startedAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return result.docs[0] ?? null;
}

export async function lastCompletedCountAt(
	payload: Payload,
	shopId: string,
): Promise<string | null> {
	const result = await payload.find({
		collection: "stock-count-sessions",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "completed" } }],
		},
		sort: "-completedAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const completedAt = result.docs[0]?.completedAt;
	return completedAt ? String(completedAt) : null;
}

export async function getStockCountOverview(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
): Promise<StockCountOverview> {
	await requireShopMember(payload, user, shopId);
	const [open, lastCompletedAt, locations] = await Promise.all([
		findOpen(payload, shopId),
		lastCompletedCountAt(payload, shopId),
		shopLocations(payload, shopId),
	]);
	return {
		session: open ? await toView(payload, open) : null,
		lastCompletedAt,
		locations,
	};
}

async function assertLocation(
	payload: Payload,
	shopId: string,
	locationId: string | null,
	req: PayloadRequest,
): Promise<void> {
	if (!locationId) return;
	const locations = await shopLocations(payload, shopId, req);
	if (!locations.some((location) => location.id === locationId)) {
		throw invalid();
	}
}

/** One open count per shop: starting again resumes the one in progress. */
export async function startStockCount(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: { locationId?: string | null },
): Promise<StockCountSessionView> {
	return withTransaction(
		payload,
		async (req) => {
			await requireShopPermission(payload, user, shopId, "stock.move", {
				writable: true,
				req,
			});
			const open = await findOpen(payload, shopId, req);
			if (open) return toView(payload, open, req);
			const locationId = input.locationId ?? null;
			await assertLocation(payload, shopId, locationId, req);
			const created = await req.payload.create({
				collection: "stock-count-sessions",
				data: {
					shop: shopId,
					status: "open",
					location: locationId,
					startedBy: user.id,
					startedAt: new Date().toISOString(),
					counts: {},
				},
				depth: 0,
				overrideAccess: true,
				req,
			});
			return toView(payload, created, req);
		},
		{ user },
	);
}

async function requireOpenSession(
	req: PayloadRequest,
	shopId: string,
	sessionId: string,
): Promise<StockCountSession> {
	const session = await req.payload
		.findByID({
			collection: "stock-count-sessions",
			id: sessionId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!session || relationId(session.shop) !== shopId) {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	if (session.status !== "open") {
		throw new ServiceError(ERROR_CODES.validation, 409);
	}
	return session;
}

export async function saveStockCountProgress(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	sessionId: string,
	input: { counts: unknown; locationId?: string | null },
): Promise<StockCountSessionView> {
	const counts = parseCounts(input.counts);
	return withTransaction(
		payload,
		async (req) => {
			await requireShopPermission(payload, user, shopId, "stock.move", {
				writable: true,
				req,
			});
			await requireOpenSession(req, shopId, sessionId);
			if (input.locationId !== undefined) {
				await assertLocation(payload, shopId, input.locationId, req);
			}
			const updated = await req.payload.update({
				collection: "stock-count-sessions",
				id: sessionId,
				data: {
					counts,
					...(input.locationId !== undefined
						? { location: input.locationId }
						: {}),
				},
				depth: 0,
				overrideAccess: true,
				req,
			});
			return toView(payload, updated, req);
		},
		{ user },
	);
}

export async function cancelStockCount(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	sessionId: string,
): Promise<{ cancelled: true }> {
	return withTransaction(
		payload,
		async (req) => {
			await requireShopPermission(payload, user, shopId, "stock.move", {
				writable: true,
				req,
			});
			await requireOpenSession(req, shopId, sessionId);
			await req.payload.update({
				collection: "stock-count-sessions",
				id: sessionId,
				data: { status: "cancelled" },
				depth: 0,
				overrideAccess: true,
				req,
			});
			return { cancelled: true as const };
		},
		{ user },
	);
}

/**
 * Called by `recordStockCount` inside its own transaction, so the session is
 * closed exactly when the corrections it led to are written.
 */
export async function completeStockCountSession(
	req: PayloadRequest,
	shopId: string,
	sessionId: string,
	userId: string,
	counts: { variantId: string; counted: number }[],
): Promise<void> {
	await requireOpenSession(req, shopId, sessionId);
	await req.payload.update({
		collection: "stock-count-sessions",
		id: sessionId,
		data: {
			status: "completed",
			completedAt: new Date().toISOString(),
			completedBy: userId,
			counts: Object.fromEntries(
				counts.map((line) => [line.variantId, String(line.counted)]),
			),
		},
		depth: 0,
		overrideAccess: true,
		req,
	});
}
