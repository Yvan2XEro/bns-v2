import type { PayloadRequest } from "payload";
import { isSuspended } from "../access/roles";
import { triggerNotificationEvent } from "../hooks/notificationEvents";
import { relationId } from "../lib/relationId";
import type { Dispute, ReturnCase, ShopStrike } from "../payload-types";
import { isNotificationProviderConfigured } from "./notificationProvider";

type Audience = "buyer" | "shop";
type CasePayload = Record<string, string | number | boolean | null>;

async function notify(
	event: string,
	recipients: readonly string[],
	caseId: string,
	caseNumber: string,
	title: string,
	body: string,
	audience: Audience,
	identifier: "returnId" | "disputeId" | "strikeId",
): Promise<void> {
	if (!isNotificationProviderConfigured() || recipients.length === 0) return;
	const payload: CasePayload = {
		caseId,
		caseNumber,
		caseTitle: title,
		message: body,
		audience,
		[identifier]: caseId,
	};
	await Promise.all(
		recipients.map((subscriberId) =>
			triggerNotificationEvent({ event, subscriberId, payload }),
		),
	);
}

async function shopRecipients(
	req: PayloadRequest,
	shop: ReturnCase["shop"] | Dispute["shop"] | ShopStrike["shop"],
): Promise<string[]> {
	const shopId = relationId(shop);
	if (!shopId) return [];
	const members = await req.payload.find({
		collection: "shop-members",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ status: { equals: "active" } },
				{ role: { in: ["owner", "manager"] } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const recipients: string[] = [];
	for (const member of members.docs) {
		const userId = relationId(member.user);
		if (!userId) continue;
		const user = await req.payload
			.findByID({
				collection: "users",
				id: userId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (user && !isSuspended(user)) recipients.push(userId);
	}
	return [...new Set(recipients)];
}

function caseTitle(message: string): string {
	return message;
}

export async function notifyReturnRequested(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	await notify(
		"return-requested",
		await shopRecipients(req, kase.shop),
		String(kase.id),
		kase.number,
		caseTitle("Nouvelle demande de retour / New return request"),
		`La demande ${kase.number} attend votre réponse. / Return ${kase.number} is awaiting your response.`,
		"shop",
		"returnId",
	);
}

export async function notifyReturnInstructions(
	_req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	const buyerId = relationId(kase.buyer);
	if (!buyerId) return;
	const shipBy = kase.deadlines?.shipBy ?? "";
	const pickupBy = kase.deadlines?.pickupBy ?? "";
	const deadline = kase.returnMethod === "seller_pickup" ? pickupBy : shipBy;
	const method = kase.returnMethod ?? "";
	await notify(
		"return-instructions",
		[buyerId],
		String(kase.id),
		kase.number,
		caseTitle("Instructions de retour / Return instructions"),
		`Mode : ${method}. Échéance : ${deadline}. / Method: ${method}. Deadline: ${deadline}.`,
		"buyer",
		"returnId",
	);
}

export async function notifyReturnReceived(
	_req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	const buyerId = relationId(kase.buyer);
	if (!buyerId) return;
	await notify(
		"return-received",
		[buyerId],
		String(kase.id),
		kase.number,
		caseTitle("Retour reçu / Return received"),
		`La boutique a reçu votre retour ${kase.number}. / The shop received your return ${kase.number}.`,
		"buyer",
		"returnId",
	);
}

export async function notifyReturnInspected(
	_req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	const buyerId = relationId(kase.buyer);
	if (!buyerId) return;
	const deduction = (kase.items ?? []).reduce(
		(total, item) => total + Number(item.inspection?.deductionAmount ?? 0),
		0,
	);
	await notify(
		"return-inspected",
		[buyerId],
		String(kase.id),
		kase.number,
		caseTitle("Retour inspecté / Return inspected"),
		`Déduction proposée : ${deduction} XAF. / Proposed deduction: ${deduction} XAF.`,
		"buyer",
		"returnId",
	);
}

export async function notifyRefundProofSubmitted(
	_req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	const buyerId = relationId(kase.buyer);
	if (!buyerId) return;
	await notify(
		"refund-proof-submitted",
		[buyerId],
		String(kase.id),
		kase.number,
		caseTitle("Preuve de remboursement reçue / Refund proof received"),
		`Confirmez ou contestez le remboursement du dossier ${kase.number}. / Confirm or contest the refund for case ${kase.number}.`,
		"buyer",
		"returnId",
	);
}

export async function notifyRefundOverdue(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	const [buyerId, shopIds] = await Promise.all([
		Promise.resolve(relationId(kase.buyer)),
		shopRecipients(req, kase.shop),
	]);
	const body = `Le remboursement du dossier ${kase.number} est en retard. / The refund for case ${kase.number} is overdue.`;
	await Promise.all([
		buyerId
			? notify(
					"refund-overdue",
					[buyerId],
					String(kase.id),
					kase.number,
					caseTitle("Remboursement en retard / Refund overdue"),
					body,
					"buyer",
					"returnId",
				)
			: Promise.resolve(),
		notify(
			"refund-overdue",
			shopIds,
			String(kase.id),
			kase.number,
			caseTitle("Remboursement en retard / Refund overdue"),
			body,
			"shop",
			"returnId",
		),
	]);
}

async function disputeRecipients(
	req: PayloadRequest,
	dispute: Dispute,
	audience: Audience,
): Promise<string[]> {
	if (audience === "buyer") {
		const buyerId = relationId(dispute.buyer);
		return buyerId ? [buyerId] : [];
	}
	return shopRecipients(req, dispute.shop);
}

export async function notifyDisputeOpened(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	const audience: Audience =
		dispute.openedByType === "seller" ? "buyer" : "shop";
	await notify(
		"dispute-opened",
		await disputeRecipients(req, dispute, audience),
		String(dispute.id),
		dispute.number,
		caseTitle("Nouveau litige / New dispute"),
		`Le dossier ${dispute.number} nécessite votre réponse. / Case ${dispute.number} requires your response.`,
		audience,
		"disputeId",
	);
}

export async function notifyDisputeMessage(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	const { docs } = await req.payload.find({
		collection: "dispute-messages",
		where: { dispute: { equals: String(dispute.id) } },
		sort: "-createdAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const authorType = docs[0]?.authorType;
	if (!authorType || authorType === "moderator" || authorType === "system")
		return;
	const audience: Audience = authorType === "buyer" ? "shop" : "buyer";
	await notify(
		"dispute-message",
		await disputeRecipients(req, dispute, audience),
		String(dispute.id),
		dispute.number,
		caseTitle("Mise à jour du litige / Dispute update"),
		`Un nouveau message est disponible dans le dossier ${dispute.number}. / A new message is available in case ${dispute.number}.`,
		audience,
		"disputeId",
	);
}

export async function notifyDisputeDeadlineReminder(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	const audience: Audience =
		dispute.status === "awaiting_seller" ? "shop" : "buyer";
	await notify(
		"dispute-deadline-reminder",
		await disputeRecipients(req, dispute, audience),
		String(dispute.id),
		dispute.number,
		caseTitle("Échéance de litige proche / Dispute deadline approaching"),
		`Une réponse est attendue avant ${dispute.deadlines?.respondBy ?? ""}. / A response is due by ${dispute.deadlines?.respondBy ?? ""}.`,
		audience,
		"disputeId",
	);
}

export async function notifyDisputeInfoRequested(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	const audience: Audience =
		dispute.status === "awaiting_seller" ? "shop" : "buyer";
	await notify(
		"dispute-info-requested",
		await disputeRecipients(req, dispute, audience),
		String(dispute.id),
		dispute.number,
		caseTitle("Informations requises / Information requested"),
		`Un complément est requis pour le dossier ${dispute.number}. / More information is required for case ${dispute.number}.`,
		audience,
		"disputeId",
	);
}

export async function notifyDisputeEscalated(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	await Promise.all(
		(["buyer", "shop"] as const).map((audience) =>
			disputeRecipients(req, dispute, audience).then((recipients) =>
				notify(
					"dispute-escalated",
					recipients,
					String(dispute.id),
					dispute.number,
					caseTitle("Litige en examen / Dispute under review"),
					`Le dossier ${dispute.number} est transmis à la modération. / Case ${dispute.number} has been escalated to moderation.`,
					audience,
					"disputeId",
				),
			),
		),
	);
}

export async function notifyDisputeResolved(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	await Promise.all(
		(["buyer", "shop"] as const).map((audience) =>
			disputeRecipients(req, dispute, audience).then((recipients) =>
				notify(
					"dispute-resolved",
					recipients,
					String(dispute.id),
					dispute.number,
					caseTitle("Décision rendue / Decision issued"),
					`La décision du dossier ${dispute.number} est disponible. / The decision for case ${dispute.number} is available.`,
					audience,
					"disputeId",
				),
			),
		),
	);
}

export async function notifyDisputeReviewOverdue(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	const admins = await req.payload.find({
		collection: "users",
		where: { role: { equals: "admin" } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	await notify(
		"dispute-review-overdue",
		admins.docs.map((user) => String(user.id)),
		String(dispute.id),
		dispute.number,
		caseTitle("Litige en retard / Overdue dispute review"),
		`Le dossier ${dispute.number} dépasse son délai de traitement. / Case ${dispute.number} is past its review deadline.`,
		"shop",
		"disputeId",
	);
}

export async function notifyShopStrikeAdded(
	req: PayloadRequest,
	strike: ShopStrike,
): Promise<void> {
	await notify(
		"shop-strike-added",
		await shopRecipients(req, strike.shop),
		String(strike.id),
		strike.sourceId,
		caseTitle("Statut de la boutique mis à jour / Shop standing updated"),
		`Une mesure de poids ${strike.weight} est active jusqu'au ${strike.expiresAt}. / A weight-${strike.weight} strike is active until ${strike.expiresAt}.`,
		"shop",
		"strikeId",
	);
}
