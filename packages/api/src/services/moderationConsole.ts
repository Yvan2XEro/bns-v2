import type { Payload, Where } from "payload";
import type { ModerationAction } from "../collections/ModerationLog";
import type {
	ModerationLogResponse,
	ModerationLogRow,
	ModerationShopSearchResponse,
	ModerationShopStatus,
} from "../contracts/moderationConsole";
import { toMediaRef } from "../lib/publicShop";
import { relationId } from "../lib/relationId";
import type { ModerationLog } from "../payload-types";

export const SHOP_SEARCH_PAGE_SIZE = 30;
export const LOG_PAGE_SIZE = 50;
export const LOG_CSV_LIMIT = 5000;

/** Page-number cursors: both lists are plain `find`s sorted newest first. */
export function isPageCursorValid(value: string | undefined): boolean {
	return value === undefined || /^[1-9]\d{0,5}$/.test(value);
}

function nextCursor(found: { hasNextPage?: boolean; page?: number }) {
	return found.hasNextPage && found.page ? String(found.page + 1) : null;
}

async function userNames(
	payload: Payload,
	ids: Iterable<string>,
): Promise<Map<string, string | null>> {
	const unique = [...new Set(ids)];
	if (unique.length === 0) return new Map();
	const found = await payload.find({
		collection: "users",
		where: { id: { in: unique } },
		select: { name: true },
		depth: 0,
		limit: unique.length,
		pagination: false,
		overrideAccess: true,
	});
	return new Map(found.docs.map((doc) => [String(doc.id), doc.name ?? null]));
}

export interface ShopSearchFilters {
	q?: string;
	status?: ModerationShopStatus;
	cursor?: string;
}

/**
 * Pending reports against each shop or any of its listings, and active
 * unexpired strikes. Pending reports are a short list, so listing reports are
 * read whole and mapped back to their shop rather than reading every listing
 * of every shop on the page.
 */
async function shopCounts(payload: Payload, shopIds: string[], now: Date) {
	const reports = new Map<string, number>();
	const strikes = new Map<string, number>();
	if (shopIds.length === 0) return { reports, strikes };
	const bump = (map: Map<string, number>, id: string | null) => {
		if (id) map.set(id, (map.get(id) ?? 0) + 1);
	};
	const [shopReports, listingReports, activeStrikes] = await Promise.all([
		payload.find({
			collection: "reports",
			where: {
				and: [
					{ status: { equals: "pending" } },
					{ targetType: { equals: "shop" } },
					{ targetId: { in: shopIds } },
				],
			},
			select: { targetId: true },
			depth: 0,
			pagination: false,
			overrideAccess: true,
		}),
		payload.find({
			collection: "reports",
			where: {
				and: [
					{ status: { equals: "pending" } },
					{ targetType: { equals: "listing" } },
				],
			},
			select: { targetId: true },
			depth: 0,
			pagination: false,
			overrideAccess: true,
		}),
		payload.find({
			collection: "shop-strikes",
			where: {
				and: [
					{ shop: { in: shopIds } },
					{ status: { equals: "active" } },
					{ expiresAt: { greater_than: now.toISOString() } },
				],
			},
			select: { shop: true },
			depth: 0,
			pagination: false,
			overrideAccess: true,
		}),
	]);
	for (const report of shopReports.docs) bump(reports, report.targetId);
	const listingIds = [
		...new Set(
			listingReports.docs
				.map((report) => report.targetId)
				.filter((id) => /^[0-9a-f]{24}$/i.test(id)),
		),
	];
	if (listingIds.length > 0) {
		const listings = await payload.find({
			collection: "listings",
			where: {
				and: [{ id: { in: listingIds } }, { shop: { in: shopIds } }],
			},
			select: { shop: true },
			depth: 0,
			pagination: false,
			overrideAccess: true,
		});
		const shopOf = new Map(
			listings.docs.map((doc) => [String(doc.id), relationId(doc.shop)]),
		);
		for (const report of listingReports.docs) {
			bump(reports, shopOf.get(report.targetId) ?? null);
		}
	}
	for (const strike of activeStrikes.docs)
		bump(strikes, relationId(strike.shop));
	return { reports, strikes };
}

export async function searchModerationShops(
	payload: Payload,
	filters: ShopSearchFilters = {},
	now = new Date(),
): Promise<ModerationShopSearchResponse> {
	const conditions: Where[] = [];
	const q = filters.q?.trim();
	if (q) {
		conditions.push({
			or: [{ name: { contains: q } }, { handle: { contains: q } }],
		});
	}
	if (filters.status) conditions.push({ status: { equals: filters.status } });
	const found = await payload.find({
		collection: "shops",
		where: conditions.length ? { and: conditions } : {},
		sort: "-createdAt",
		depth: 1,
		limit: SHOP_SEARCH_PAGE_SIZE,
		page: Number(filters.cursor ?? 1),
		overrideAccess: true,
	});
	const shopIds = found.docs.map((shop) => String(shop.id));
	const [owners, counts] = await Promise.all([
		userNames(
			payload,
			found.docs.flatMap((shop) => {
				const id = relationId(shop.owner);
				return id ? [id] : [];
			}),
		),
		shopCounts(payload, shopIds, now),
	]);
	return {
		items: found.docs.map((shop) => {
			const id = String(shop.id);
			const ownerId = relationId(shop.owner);
			return {
				id,
				name: shop.name,
				handle: shop.handle,
				logoUrl: toMediaRef(shop.logo)?.url ?? null,
				status: shop.status,
				level: shop.level ?? 1,
				owner: ownerId
					? { id: ownerId, name: owners.get(ownerId) ?? null }
					: null,
				openReports: counts.reports.get(id) ?? 0,
				strikes: counts.strikes.get(id) ?? 0,
				createdAt: shop.createdAt,
			};
		}),
		nextCursor: nextCursor(found),
	};
}

export interface ModerationLogFilters {
	actor?: string;
	targetType?: ModerationLog["targetType"];
	targetId?: string;
	action?: ModerationAction;
	from?: string;
	to?: string;
	cursor?: string;
}

function logWhere(filters: ModerationLogFilters): Where {
	const conditions: Where[] = [];
	if (filters.actor) conditions.push({ actor: { equals: filters.actor } });
	if (filters.targetType)
		conditions.push({ targetType: { equals: filters.targetType } });
	if (filters.targetId)
		conditions.push({ targetId: { equals: filters.targetId } });
	if (filters.action) conditions.push({ action: { equals: filters.action } });
	if (filters.from)
		conditions.push({ createdAt: { greater_than_equal: filters.from } });
	if (filters.to)
		conditions.push({ createdAt: { less_than_equal: filters.to } });
	return conditions.length ? { and: conditions } : {};
}

async function logRows(
	payload: Payload,
	docs: ModerationLog[],
): Promise<ModerationLogRow[]> {
	const names = await userNames(
		payload,
		docs.flatMap((doc) => {
			const id = relationId(doc.actor);
			return id ? [id] : [];
		}),
	);
	return docs.map((doc) => {
		const actorId = relationId(doc.actor);
		return {
			id: String(doc.id),
			createdAt: doc.createdAt,
			action: doc.action,
			actor: actorId ? { id: actorId, name: names.get(actorId) ?? null } : null,
			actorRole: doc.actorRole,
			targetType: doc.targetType,
			targetId: doc.targetId,
			reason: doc.reason ?? null,
			note: doc.note ?? null,
			metadata: doc.metadata ?? null,
		};
	});
}

export async function readModerationLog(
	payload: Payload,
	filters: ModerationLogFilters = {},
): Promise<ModerationLogResponse> {
	const found = await payload.find({
		collection: "moderation-log",
		where: logWhere(filters),
		sort: "-createdAt",
		depth: 0,
		limit: LOG_PAGE_SIZE,
		page: Number(filters.cursor ?? 1),
		overrideAccess: true,
	});
	return {
		items: await logRows(payload, found.docs),
		nextCursor: nextCursor(found),
	};
}

/** Quotes what needs quoting and defuses spreadsheet formulas. */
function csvCell(value: string | null): string {
	const raw = value ?? "";
	const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS = [
	"createdAt",
	"action",
	"actorId",
	"actorName",
	"actorRole",
	"targetType",
	"targetId",
	"reason",
	"note",
] as const;

/** The same filtered rows, newest first, capped at `LOG_CSV_LIMIT`; metadata stays out of the export. */
export async function moderationLogCsv(
	payload: Payload,
	filters: ModerationLogFilters = {},
): Promise<string> {
	const found = await payload.find({
		collection: "moderation-log",
		where: logWhere(filters),
		sort: "-createdAt",
		depth: 0,
		limit: LOG_CSV_LIMIT,
		overrideAccess: true,
	});
	const rows = await logRows(payload, found.docs);
	const lines = rows.map((row) =>
		[
			row.createdAt,
			row.action,
			row.actor?.id ?? null,
			row.actor?.name ?? null,
			row.actorRole,
			row.targetType,
			row.targetId,
			row.reason,
			row.note,
		]
			.map(csvCell)
			.join(","),
	);
	return `${[CSV_COLUMNS.join(","), ...lines].join("\n")}\n`;
}
