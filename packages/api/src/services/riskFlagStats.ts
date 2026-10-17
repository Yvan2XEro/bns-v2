import type { Payload, Where } from "payload";
import type { RiskFlagStats } from "../contracts/moderationConsole";
import { RISK_SUBJECT_TYPES } from "../types/riskModeration";
import { type Actor, assertModerator } from "./moderation";

export const RISK_HIGH_SCORE = 80;
const WINDOW_DAYS = 30;

/** Counts behind the risk console's tabs and KPI tiles, every one a plain `count`. */
export async function getRiskFlagStats(
	payload: Payload,
	actor: Actor,
	now = new Date(),
): Promise<RiskFlagStats> {
	assertModerator(actor);
	const since = new Date(
		now.getTime() - WINDOW_DAYS * 86_400_000,
	).toISOString();
	const count = (where: Where) =>
		payload
			.count({ collection: "risk-flags", where, overrideAccess: true })
			.then((result) => result.totalDocs);
	const open: Where = { status: { equals: "open" } };
	const decidedSince: Where = { reviewedAt: { greater_than_equal: since } };

	const [
		openTotal,
		bySubject,
		highScore,
		payoutHeld,
		reviewed,
		decided,
		dismissed,
	] = await Promise.all([
		count(open),
		Promise.all(
			RISK_SUBJECT_TYPES.map((type) =>
				count({ and: [open, { subjectType: { equals: type } }] }),
			),
		),
		count({ and: [open, { score: { greater_than_equal: RISK_HIGH_SCORE } }] }),
		count({ and: [open, { autoEffects: { in: ["payout_hold"] } }] }),
		count({ status: { equals: "reviewed" } }),
		count({
			and: [
				decidedSince,
				{ status: { in: ["reviewed", "dismissed", "actioned"] } },
			],
		}),
		count({ and: [decidedSince, { status: { equals: "dismissed" } }] }),
	]);

	return {
		open: openTotal,
		openBySubject: {
			user: bySubject[0] ?? 0,
			shop: bySubject[1] ?? 0,
			phone: bySubject[2] ?? 0,
			device: bySubject[3] ?? 0,
		},
		highScore,
		highScoreThreshold: RISK_HIGH_SCORE,
		payoutHeld,
		reviewed,
		decidedLast30Days: decided,
		dismissedLast30Days: dismissed,
	};
}
