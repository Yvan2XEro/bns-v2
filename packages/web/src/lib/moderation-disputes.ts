import type { ModerationDisputeRow } from "../../../api/src/contracts/disputes";
import { query } from "./shop-api";

export const QUEUE_COLUMNS = [
	"number",
	"reason",
	"paymentMethod",
	"amount",
	"status",
	"deadline",
	"assignee",
	"age",
] as const;

export const QUEUE_STATUS_FILTERS = [
	"open",
	"awaiting_seller",
	"awaiting_buyer",
	"under_review",
] as const;
export const QUEUE_PAYMENT_FILTERS = ["cod", "mobile_money"] as const;

export interface DisputeQueueFilters {
	status?: (typeof QUEUE_STATUS_FILTERS)[number];
	reason?: ModerationDisputeRow["reason"];
	paymentMethod?: (typeof QUEUE_PAYMENT_FILTERS)[number];
	overdue?: boolean;
	assigned?: "me";
}

export function queueQuery(filters: DisputeQueueFilters): string {
	return query({
		status: filters.status,
		reason: filters.reason,
		paymentMethod: filters.paymentMethod,
		overdue:
			filters.overdue === undefined ? undefined : String(filters.overdue),
		assigned: filters.assigned,
	});
}

export type DeadlineTone = "overdue" | "normal" | "none";

/** The server decides `overdue`; the client never compares dates itself. */
export function deadlineTone(
	row: Pick<ModerationDisputeRow, "deadline" | "overdue">,
): DeadlineTone {
	if (row.overdue) return "overdue";
	return row.deadline ? "normal" : "none";
}

export type AssigneeView = "unassigned" | "me" | "other";

export function assigneeView(
	assignedTo: string | null,
	viewerId: string | null,
): AssigneeView {
	if (!assignedTo) return "unassigned";
	return assignedTo === viewerId ? "me" : "other";
}
