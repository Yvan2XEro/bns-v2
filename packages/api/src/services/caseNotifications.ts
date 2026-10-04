import type { PayloadRequest } from "payload";
import type { Dispute, ReturnCase, ShopStrike } from "../payload-types";

type CaseDocument = ReturnCase | Dispute | ShopStrike;

function logPendingNotification(
	req: PayloadRequest,
	event: string,
	doc: CaseDocument,
): void {
	req.payload.logger.info({
		msg: `[notifications] ${event} notifier is not wired yet`,
		documentId: String(doc.id),
	});
}

export async function notifyReturnRequested(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	logPendingNotification(req, "return-requested", kase);
}
export async function notifyReturnInstructions(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	logPendingNotification(req, "return-instructions", kase);
}
export async function notifyReturnReceived(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	logPendingNotification(req, "return-received", kase);
}
export async function notifyReturnInspected(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	logPendingNotification(req, "return-inspected", kase);
}
export async function notifyRefundProofSubmitted(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	logPendingNotification(req, "refund-proof-submitted", kase);
}
export async function notifyRefundOverdue(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	logPendingNotification(req, "refund-overdue", kase);
}
export async function notifyDisputeOpened(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	logPendingNotification(req, "dispute-opened", dispute);
}
export async function notifyDisputeMessage(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	logPendingNotification(req, "dispute-message", dispute);
}
export async function notifyDisputeDeadlineReminder(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	logPendingNotification(req, "dispute-deadline-reminder", dispute);
}
export async function notifyDisputeInfoRequested(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	logPendingNotification(req, "dispute-info-requested", dispute);
}
export async function notifyDisputeEscalated(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	logPendingNotification(req, "dispute-escalated", dispute);
}
export async function notifyDisputeResolved(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	logPendingNotification(req, "dispute-resolved", dispute);
}
export async function notifyDisputeReviewOverdue(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	logPendingNotification(req, "dispute-review-overdue", dispute);
}
export async function notifyShopStrikeAdded(
	req: PayloadRequest,
	strike: ShopStrike,
): Promise<void> {
	logPendingNotification(req, "shop-strike-added", strike);
}
