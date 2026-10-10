/** Moved from lib/disputeRules: the web image's tsc must resolve every
 * import of the contracts slice, type-only included. */
export interface ProofChecklistRow {
	requirement: string;
	established: boolean;
	source: string | null;
}
export type ProofChecklist = ProofChecklistRow[];
import type { Dispute, ShopStrike } from "../payload-types";

export interface DisputeOutcomeInput {
	outcome: "resolved_buyer" | "resolved_seller" | "resolved_split";
	refundAmount: number;
	returnRequired: boolean;
	returnShippingPaidBy: "seller" | "buyer" | null;
	liableParty: NonNullable<NonNullable<Dispute["resolution"]>["liableParty"]>;
	reasonCode: NonNullable<NonNullable<Dispute["resolution"]>["reasonCode"]>;
	publicStatement: { fr: string; en: string };
	reviewAction?: "published" | "removed";
}

export const DISPUTE_REASONS = [
	"not_received",
	"not_as_described",
	"damaged",
	"counterfeit",
	"wrong_item",
	"seller_no_show",
	"cod_refused_abuse",
] as const;

export type DisputeReason = (typeof DISPUTE_REASONS)[number];
export const BUYER_DISPUTE_REASONS = [
	"not_received",
	"not_as_described",
	"damaged",
	"counterfeit",
	"wrong_item",
	"seller_no_show",
] as const satisfies readonly DisputeReason[];

export const DISPUTE_OUTCOMES = [
	"full_refund",
	"partial_refund",
	"return_and_refund",
	"no_refund",
] as const;

export type DisputeRequestedOutcome = (typeof DISPUTE_OUTCOMES)[number];
export const BUYER_DISPUTE_OUTCOMES = [
	"full_refund",
	"partial_refund",
	"return_and_refund",
] as const satisfies readonly DisputeRequestedOutcome[];

export const DISPUTE_EVIDENCE_REQUIREMENTS = {
	not_received: 0,
	not_as_described: 1,
	damaged: 1,
	counterfeit: 2,
	wrong_item: 1,
	seller_no_show: 0,
	cod_refused_abuse: 1,
} as const satisfies Record<(typeof DISPUTE_REASONS)[number], number>;

export interface OpenDisputeInput {
	reason: (typeof DISPUTE_REASONS)[number];
	subject?: "goods" | "refund";
	description: string;
	requestedOutcome: (typeof DISPUTE_OUTCOMES)[number];
	requestedAmount?: number;
	items: Array<{ orderItemId: string; quantity: number }>;
	returnCaseId?: string;
}

export interface ModerationDisputeRow {
	id: string;
	number: string;
	orderId: string | null;
	orderNumber: string;
	shopId: string | null;
	buyerId: string | null;
	reason: Dispute["reason"];
	subject: Dispute["subject"];
	paymentMethod: Dispute["paymentMethod"];
	status: Dispute["status"];
	amountAtStake: number;
	deadline: string | null;
	overdue: boolean;
	assignedTo: string | null;
	ageDays: number;
}

export interface ShopStandingView {
	activeWeight: number;
	effectsEnabled: boolean;
	restrictions: {
		codCapHalved: boolean;
		protectedCapHalved: boolean;
		protectedUnavailable: boolean;
	};
	strikes: Array<
		Pick<
			ShopStrike,
			| "id"
			| "kind"
			| "weight"
			| "status"
			| "expiresAt"
			| "sourceType"
			| "createdAt"
		>
	>;
}

export interface ModerationDisputeSheet {
	dispute: DisputeView;
	proofChecklist: ProofChecklist;
	refundable: number;
	components: {
		goods: number;
		outboundDelivery: number;
		buyerProtectionFee: number;
	};
	partyHistory: {
		buyerRefusalScore: number;
		buyerDisputes12m: number;
		shopStanding: ShopStandingView;
		shopDisputeLossRate: number | null;
	};
	resale: null | {
		supplierShopId: string;
		resellerShopId: string;
		purchaseOrder: string | null;
	};
	moderatorRefundLimit: number;
}

export interface DisputeOutcomePreview {
	refundAmount: number;
	breakdown: {
		goods: number;
		outboundDelivery: number;
		buyerProtectionFee: number;
	};
}

export interface DisputeView {
	id: string;
	number: string;
	orderId: string;
	orderNumber: string;
	shopId: string;
	shopName: string;
	subject: NonNullable<Dispute["subject"]>;
	reason: NonNullable<Dispute["reason"]>;
	status: NonNullable<Dispute["status"]>;
	paymentMethod: NonNullable<Dispute["paymentMethod"]>;
	amountAtStake: number;
	items: Array<{ orderItemId: string; title: string; quantity: number }>;
	requestedOutcome: NonNullable<Dispute["requestedOutcome"]>;
	requestedAmount: number | null;
	openedByType: NonNullable<Dispute["openedByType"]>;
	deadlines: {
		submitBy: string | null;
		respondBy: string | null;
		reviewDueAt: string | null;
	};
	proposal: null | {
		amount: number;
		returnRequired: boolean;
		byType: string;
		round: number;
		status: "open" | "accepted" | "rejected" | "lapsed";
		expiresAt: string;
	};
	resolution: null | {
		outcome: NonNullable<Dispute["resolution"]>["outcome"];
		refundAmount: number;
		breakdown: {
			goods: number;
			outboundDelivery: number;
			returnShipping: number;
			buyerProtectionFee: number;
			deduction: number;
		};
		returnRequired: boolean;
		returnShippingPaidBy: "seller" | "buyer" | null;
		liableParty: string;
		reasonCode: string;
		publicStatement: { fr: string; en: string };
		decidedByType: "system" | "agreement" | "moderator";
		decidedAt: string;
		certificateAvailable: boolean;
	};
	returnCaseId: string | null;
	viewerRole: "buyer" | "seller" | "moderator";
	messages: Array<{
		id: string;
		authorType: string;
		kind: string;
		body: string | null;
		redacted: boolean;
		evidenceIds: string[];
		at: string;
	}>;
	evidence: Array<{
		id: string;
		kind: string;
		mimeType: string;
		size: number;
		uploadedByType: string;
		capturedAt: string | null;
		sha256Reused: boolean;
		visibility: "parties" | "staff";
	}>;
	systemEvidence: {
		timeline: Array<{ type: string; at: string }>;
		handover: null | { method: string; verifiedAt: string | null };
		payment: null | { paymentStatus: string; refundedAmount: number };
		snapshot: unknown | null;
	};
	allowedActions: string[];
}

export interface DisputeListRow {
	id: string;
	number: string;
	orderNumber: string;
	subject: Dispute["subject"];
	reason: Dispute["reason"];
	status: Dispute["status"];
	amountAtStake: number;
	nextDeadline: string | null;
	overdue: boolean;
	createdAt: string;
}

export interface DisputeListPage {
	rows: DisputeListRow[];
	awaitingCount: number;
}
