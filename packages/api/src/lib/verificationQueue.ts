import type { Where } from "payload";

const STALE_CLAIM_MS = 48 * 3_600_000;
const DECIDED_WINDOW_MS = 30 * 86_400_000;

export type QueueKey = "to_review" | "mine" | "needs_info" | "decided";

export function queueWhere(queue: QueueKey, actorId: string, now: Date): Where {
	switch (queue) {
		case "mine":
			return {
				and: [
					{ status: { equals: "in_review" } },
					{ assignee: { equals: actorId } },
				],
			};
		case "needs_info":
			return { status: { equals: "needs_info" } };
		case "decided":
			return {
				and: [
					{ status: { in: ["approved", "rejected", "revoked", "expired"] } },
					{
						updatedAt: {
							greater_than: new Date(
								now.getTime() - DECIDED_WINDOW_MS,
							).toISOString(),
						},
					},
				],
			};
		default:
			return { status: { equals: "submitted" } };
	}
}

/**
 * Resubmissions first, then oldest first. A seller who answered a reviewer's
 * question has already waited once; leaving them behind every new arrival is
 * how a queue teaches people not to answer. `submittedAt` is restamped on
 * every resubmission, so ordinary FIFO on that field already keeps a
 * resubmission ahead of anything that arrives after it.
 */
export function queueSort(queue: QueueKey): string {
	return queue === "decided" ? "-updatedAt" : "submittedAt";
}

/** `submitted`, plus claims nobody has touched for 48 hours. */
export function pendingVerificationsWhere(now: Date): Where {
	return {
		or: [
			{ status: { equals: "submitted" } },
			{
				and: [
					{ status: { equals: "in_review" } },
					{
						claimedAt: {
							less_than: new Date(now.getTime() - STALE_CLAIM_MS).toISOString(),
						},
					},
				],
			},
		],
	};
}
