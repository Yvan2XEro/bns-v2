import type { Payload, Where } from "payload";
import type { RiskFlag } from "../payload-types";

const PAGE_SIZE = 200;

function addMonths(date: Date, months: number): Date {
	const result = new Date(date);
	const day = result.getUTCDate();
	result.setUTCDate(1);
	result.setUTCMonth(result.getUTCMonth() + months);
	const lastDay = new Date(
		Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
	).getUTCDate();
	result.setUTCDate(Math.min(day, lastDay));
	return result;
}

function dateOnly(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export async function purgeRiskData(payload: Payload, now = new Date()) {
	let deletedFlags = 0;
	let redactedFlags = 0;
	let closedFlags = 0;
	let deletedDailyStats = 0;

	const actioned = await payload.find({
		collection: "risk-flags",
		where: {
			and: [
				{ status: { equals: "actioned" } },
				{ purgeAt: { less_than_equal: now.toISOString() } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	for (const flag of actioned.docs) {
		const updated = await payload.update({
			collection: "risk-flags",
			id: flag.id,
			data: {
				evidence: { signal: flag.signal, score: flag.score },
				subjectLabel: null,
				purgeAt: null,
			},
			depth: 0,
			overrideAccess: true,
		});
		if (updated.evidence && updated.subjectLabel == null) redactedFlags += 1;
	}

	for (const status of ["dismissed", "reviewed"] as const) {
		const due = await payload.find({
			collection: "risk-flags",
			where: {
				and: [
					{ status: { equals: status } },
					{ purgeAt: { less_than_equal: now.toISOString() } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		for (const flag of due.docs) {
			await payload.delete({
				collection: "risk-flags",
				id: flag.id,
				overrideAccess: true,
			});
			deletedFlags += 1;
		}
	}

	const staleBefore = new Date(now.getTime() - 180 * 86_400_000).toISOString();
	const stale = await payload.find({
		collection: "risk-flags",
		where: {
			and: [
				{ status: { equals: "open" } },
				{ lastSeenAt: { less_than_equal: staleBefore } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const stalePurgeAt = addMonths(now, 3).toISOString();
	for (const flag of stale.docs) {
		await payload.update({
			collection: "risk-flags",
			id: flag.id,
			data: {
				status: "dismissed",
				resolution: "none",
				reviewedAt: now.toISOString(),
				purgeAt: stalePurgeAt,
			},
			depth: 0,
			overrideAccess: true,
		});
		closedFlags += 1;
	}

	const statsBefore = dateOnly(addMonths(now, -25));
	const skippedStats = new Set<string>();
	for (;;) {
		const statsWhere: Where = {
			and: [
				{ date: { less_than: statsBefore } },
				...(skippedStats.size > 0
					? [{ id: { not_in: [...skippedStats] } }]
					: []),
			],
		};
		const expiredStats = await payload.find({
			collection: "shop-daily-stats",
			where: statsWhere,
			limit: PAGE_SIZE,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		if (expiredStats.docs.length === 0) break;
		for (const row of expiredStats.docs) {
			try {
				await payload.delete({
					collection: "shop-daily-stats",
					id: row.id,
					overrideAccess: true,
				});
				deletedDailyStats += 1;
			} catch (error) {
				payload.logger.error(
					{ err: error, id: String(row.id) },
					"[risk] failed to purge an expired shop stat; continuing",
				);
				skippedStats.add(String(row.id));
			}
		}
	}

	return { deletedFlags, redactedFlags, closedFlags, deletedDailyStats };
}

export async function clearDeletedUserRiskReferences(
	payload: Payload,
	userId: string,
	ownedShopIds: string[],
	req?: import("payload").PayloadRequest,
): Promise<number> {
	const subjects: Where[] = [
		{
			and: [
				{ subjectType: { equals: "user" } },
				{ subjectKey: { equals: userId } },
			],
		},
	];
	if (ownedShopIds.length > 0) {
		subjects.push({
			and: [
				{ subjectType: { equals: "shop" } },
				{ subjectKey: { in: ownedShopIds } },
			],
		});
	}
	const flags = await payload.find({
		collection: "risk-flags",
		where: { or: subjects },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	for (const flag of flags.docs) {
		await payload.update({
			collection: "risk-flags",
			id: flag.id,
			data: { subjectLabel: null, subjectRef: null },
			depth: 0,
			overrideAccess: true,
			req,
		});
	}
	return flags.docs.length;
}

export function riskFlagRetentionDate(
	status: RiskFlag["status"],
	date: Date,
): string | null {
	if (status === "dismissed")
		return new Date(date.getTime() + 90 * 86_400_000).toISOString();
	if (status === "reviewed") return addMonths(date, 12).toISOString();
	if (status === "actioned") return addMonths(date, 36).toISOString();
	return null;
}
