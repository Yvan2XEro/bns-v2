import type { ReturnCase } from "../payload-types";

export type ReturnCaseStatus = ReturnCase["status"];

export type ReturnAction =
	| "ship"
	| "pickup"
	| "receive"
	| "inspect"
	| "accept_deduction"
	| "contest_deduction"
	| "refund_proof"
	| "confirm_refund"
	| "contest_refund"
	| "cancel"
	| "upload_evidence";

export interface ReturnCaseView {
	id: string;
	number: string;
	orderId: string;
	orderNumber: string;
	basis: ReturnCase["basis"];
	status: ReturnCaseStatus;
	returnRequired: boolean;
	returnMethod: ReturnCase["returnMethod"] | null;
	returnTracking: string | null;
	items: Array<{
		orderItemId: string;
		title: string;
		quantity: number;
		unitPrice: number;
		buyerCondition: NonNullable<
			NonNullable<ReturnCase["items"]>[number]["buyerCondition"]
		> | null;
		inspection: NonNullable<
			NonNullable<ReturnCase["items"]>[number]["inspection"]
		> | null;
	}>;
	reasonText: string | null;
	deadlines: {
		requestDeadline: string | null;
		shipBy: string | null;
		pickupBy: string | null;
		inspectBy: string | null;
		deductionRespondBy: string | null;
		refundBy: string | null;
	};
	returnShippingPaidBy: "buyer" | "seller";
	refund: {
		amount: number;
		breakdown: {
			goods: number;
			outboundDelivery: number;
			returnShipping: number;
			buyerProtectionFee: number;
			deduction: number;
		};
		channel: NonNullable<ReturnCase["refund"]>["channel"] | null;
		providerRefundStatus: string | null;
		sellerProof: null | {
			method: NonNullable<
				NonNullable<ReturnCase["refund"]>["sellerProof"]
			>["method"];
			transactionId: string | null;
			amount: number;
			submittedAt: string;
		};
		buyerConfirmedAt: string | null;
		contestedAt: string | null;
	};
	disputeId: string | null;
	rejectionReason: string | null;
	timeline: Array<{
		status: ReturnCaseStatus;
		actorType: "buyer" | "seller" | "system" | "moderator";
		at: string;
		note: string | null;
	}>;
	allowedActions: ReturnAction[];
}

export interface ReturnListRow {
	id: string;
	number: string;
	orderNumber: string;
	basis: ReturnCase["basis"];
	status: ReturnCaseStatus;
	refundAmount: number;
	nextDeadline: string | null;
	overdue: boolean;
	createdAt: string;
}

export interface ReturnCaseListPage {
	rows: ReturnListRow[];
	awaitingCount: number;
}

export interface ReturnItemInput {
	orderItemId: string;
	quantity: number;
}

export interface OpenWithdrawalInput {
	items: ReturnItemInput[];
	reasonText?: string | null;
	returnMethod?: NonNullable<ReturnCase["returnMethod"]>;
}

export interface ShipReturnInput {
	returnMethod: NonNullable<ReturnCase["returnMethod"]>;
	returnTracking?: string;
	evidenceIds?: string[];
}

export interface InspectReturnItemInput {
	orderItemId: string;
	outcome: NonNullable<
		NonNullable<ReturnCase["items"]>[number]["inspection"]
	>["outcome"];
	deductionAmount?: number;
	note?: string;
	evidenceIds?: string[];
}
