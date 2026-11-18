import type { PayloadRequest } from "payload";
import { isSuspended } from "../access/roles";
import {
	type Localized,
	localizedFields,
} from "../contracts/notificationLocale";
import { triggerNotificationEvent } from "../hooks/notificationEvents";
import { moneyOfOrder } from "../lib/markets";
import { amountText } from "../lib/orderFormat";
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
	/** In every language; the template picks the recipient's. */
	title: Localized,
	body: Localized,
	audience: Audience,
	identifier: "returnId" | "disputeId" | "strikeId",
): Promise<void> {
	if (!isNotificationProviderConfigured() || recipients.length === 0) return;
	const payload: CasePayload = {
		caseId,
		caseNumber,
		...localizedFields("caseTitle", title),
		...localizedFields("message", body),
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

export async function notifyReturnRequested(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	await notify(
		"return-requested",
		await shopRecipients(req, kase.shop),
		String(kase.id),
		kase.number,
		{ fr: "Nouvelle demande de retour", en: "New return request" },
		{
			fr: `La demande ${kase.number} attend votre réponse.`,
			en: `Return ${kase.number} is awaiting your response.`,
		},
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
		{ fr: "Instructions de retour", en: "Return instructions" },
		{
			fr: `Mode : ${method}. Échéance : ${deadline}.`,
			en: `Method: ${method}. Deadline: ${deadline}.`,
		},
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
		{ fr: "Retour reçu", en: "Return received" },
		{
			fr: `La boutique a reçu votre retour ${kase.number}.`,
			en: `The shop received your return ${kase.number}.`,
		},
		"buyer",
		"returnId",
	);
}

export async function notifyReturnInspected(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<void> {
	const buyerId = relationId(kase.buyer);
	if (!buyerId) return;
	const money = await moneyOfOrder(req.payload, relationId(kase.order));
	const deduction = (kase.items ?? []).reduce(
		(total, item) => total + Number(item.inspection?.deductionAmount ?? 0),
		0,
	);
	await notify(
		"return-inspected",
		[buyerId],
		String(kase.id),
		kase.number,
		{ fr: "Retour inspecté", en: "Return inspected" },
		{
			fr: `Déduction proposée : ${amountText(deduction, money, "fr")}.`,
			en: `Proposed deduction: ${amountText(deduction, money, "en")}.`,
		},
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
		{ fr: "Preuve de remboursement reçue", en: "Refund proof received" },
		{
			fr: `Confirmez ou contestez le remboursement du dossier ${kase.number}.`,
			en: `Confirm or contest the refund for case ${kase.number}.`,
		},
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
	const body = {
		fr: `Le remboursement du dossier ${kase.number} est en retard.`,
		en: `The refund for case ${kase.number} is overdue.`,
	};
	await Promise.all([
		buyerId
			? notify(
					"refund-overdue",
					[buyerId],
					String(kase.id),
					kase.number,
					{ fr: "Remboursement en retard", en: "Refund overdue" },
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
			{ fr: "Remboursement en retard", en: "Refund overdue" },
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
		{ fr: "Nouveau litige", en: "New dispute" },
		{
			fr: `Le dossier ${dispute.number} nécessite votre réponse.`,
			en: `Case ${dispute.number} requires your response.`,
		},
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
		{ fr: "Mise à jour du litige", en: "Dispute update" },
		{
			fr: `Un nouveau message est disponible dans le dossier ${dispute.number}.`,
			en: `A new message is available in case ${dispute.number}.`,
		},
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
		{ fr: "Échéance de litige proche", en: "Dispute deadline approaching" },
		{
			fr: `Une réponse est attendue avant ${dispute.deadlines?.respondBy ?? ""}.`,
			en: `A response is due by ${dispute.deadlines?.respondBy ?? ""}.`,
		},
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
		{ fr: "Informations requises", en: "Information requested" },
		{
			fr: `Un complément est requis pour le dossier ${dispute.number}.`,
			en: `More information is required for case ${dispute.number}.`,
		},
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
					{ fr: "Litige en examen", en: "Dispute under review" },
					{
						fr: `Le dossier ${dispute.number} est transmis à la modération.`,
						en: `Case ${dispute.number} has been escalated to moderation.`,
					},
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
					{ fr: "Décision rendue", en: "Decision issued" },
					{
						fr: `La décision du dossier ${dispute.number} est disponible.`,
						en: `The decision for case ${dispute.number} is available.`,
					},
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
		{ fr: "Litige en retard", en: "Overdue dispute review" },
		{
			fr: `Le dossier ${dispute.number} dépasse son délai de traitement.`,
			en: `Case ${dispute.number} is past its review deadline.`,
		},
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
		{ fr: "Statut de la boutique mis à jour", en: "Shop standing updated" },
		{
			fr: `Une mesure de poids ${strike.weight} est active jusqu'au ${strike.expiresAt}.`,
			en: `A weight-${strike.weight} strike is active until ${strike.expiresAt}.`,
		},
		"shop",
		"strikeId",
	);
}
