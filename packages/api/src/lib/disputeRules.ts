import {
	DISPUTE_EVIDENCE_REQUIREMENTS,
	type DisputeReason,
} from "../contracts/disputes";
import type { Order, ReturnCase } from "../payload-types";

export type { DisputeReason } from "../contracts/disputes";

export type OpenerRole = "buyer" | "shop";

export interface DisputeWindowOrder
	extends Pick<Order, "paymentMethod" | "paymentStatus" | "status">,
		Pick<
			NonNullable<Order["timestamps"]>,
			"placedAt" | "shippedAt" | "deliveredAt"
		> {
	/** Supplied from the payment record, not the order's delivery timestamps. */
	paidAt: string | null;
	/** P7: delivery.promisedBy. Absent before P7 ships. */
	promisedBy?: string | null;
	/** P7: the missed redelivery slot or pickup-hold end. Absent before P7. */
	noShow?: { slotEndsAt: string } | null;
	/** The return case's inspectBy, for a seller-opened damaged/wrong_item. */
	returnCaseInspectBy?: string | null;
	/** The P4 COD-refusal event this dispute's window runs from. */
	codRefusalAt?: string | null;
}

export interface DisputeWindowSettings {
	notReceivedMaxDays: number;
	conformityWindowDays: number;
	counterfeitWindowDays: number;
	noShowWindowDays: number;
}

export type ReasonWindowClosedReason =
	| "windowClosed"
	| "notYetOpen"
	| "unavailableBeforeP7"
	| "notDelivered";

export interface ReasonWindow {
	open: boolean;
	closesAt: string | null;
	reason?: ReasonWindowClosedReason;
}

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number) =>
	new Date(new Date(iso).getTime() + days * DAY_MS);

// Not settings-backed: no spec field names these, so they stay local literals.
const NOT_RECEIVED_SHIPPED_FALLBACK_DAYS = 7;
const NOT_RECEIVED_PROMISED_GRACE_DAYS = 2;
const COD_REFUSED_ABUSE_WINDOW_DAYS = 7;
/** Inside P5's 85-day `REFUND_WINDOW_DAYS`, so a protected refund is never
 * requested outside the provider's own limit. */
const PROTECTED_WINDOW_CAP_DAYS = 80;

interface Bounds {
	opensAt: Date | null;
	closesAt: Date | null;
}

function notReceivedBounds(
	order: DisputeWindowOrder,
	settings: DisputeWindowSettings,
): Bounds | null {
	if (!order.placedAt) return null;
	const opensAt = order.promisedBy
		? addDays(order.promisedBy, NOT_RECEIVED_PROMISED_GRACE_DAYS)
		: order.shippedAt
			? addDays(order.shippedAt, NOT_RECEIVED_SHIPPED_FALLBACK_DAYS)
			: null;
	if (!opensAt) return null;
	return {
		opensAt,
		closesAt: addDays(order.placedAt, settings.notReceivedMaxDays),
	};
}

function buyerConformityBounds(
	order: DisputeWindowOrder,
	days: number,
): Bounds | null {
	if (!order.deliveredAt) return null;
	return {
		opensAt: new Date(order.deliveredAt),
		closesAt: addDays(order.deliveredAt, days),
	};
}

function sellerCaseBounds(order: DisputeWindowOrder): Bounds | null {
	if (!order.returnCaseInspectBy) return null;
	return { opensAt: null, closesAt: new Date(order.returnCaseInspectBy) };
}

function sellerNoShowBounds(
	order: DisputeWindowOrder,
	settings: DisputeWindowSettings,
): Bounds | "unavailableBeforeP7" {
	if (!order.noShow) return "unavailableBeforeP7";
	return {
		opensAt: new Date(order.noShow.slotEndsAt),
		closesAt: addDays(order.noShow.slotEndsAt, settings.noShowWindowDays),
	};
}

function codRefusedAbuseBounds(order: DisputeWindowOrder): Bounds | null {
	if (!order.codRefusalAt) return null;
	return {
		opensAt: new Date(order.codRefusalAt),
		closesAt: addDays(order.codRefusalAt, COD_REFUSED_ABUSE_WINDOW_DAYS),
	};
}

export function reasonWindow(
	reason: DisputeReason,
	openerRole: OpenerRole,
	order: DisputeWindowOrder,
	settings: DisputeWindowSettings,
	now: Date,
): ReasonWindow {
	if (reason === "cod_refused_abuse" && order.paymentMethod !== "cod") {
		return { open: false, closesAt: null, reason: "notDelivered" };
	}
	if (
		reason === "not_received" &&
		order.paymentMethod === "cod" &&
		order.paymentStatus !== "cod_collected" &&
		order.status !== "delivered"
	) {
		return { open: false, closesAt: null, reason: "notDelivered" };
	}

	let bounds: Bounds | null;
	switch (reason) {
		case "not_received":
			bounds = notReceivedBounds(order, settings);
			break;
		case "not_as_described":
			bounds = buyerConformityBounds(order, settings.conformityWindowDays);
			break;
		case "damaged":
		case "wrong_item":
			bounds =
				openerRole === "shop"
					? sellerCaseBounds(order)
					: buyerConformityBounds(order, settings.conformityWindowDays);
			break;
		case "counterfeit":
			bounds = buyerConformityBounds(order, settings.counterfeitWindowDays);
			break;
		case "seller_no_show": {
			const result = sellerNoShowBounds(order, settings);
			if (result === "unavailableBeforeP7") {
				return { open: false, closesAt: null, reason: "unavailableBeforeP7" };
			}
			bounds = result;
			break;
		}
		case "cod_refused_abuse":
			bounds = codRefusedAbuseBounds(order);
			break;
	}

	if (!bounds) return { open: false, closesAt: null, reason: "notYetOpen" };
	if (order.paymentMethod === "mobile_money" && !order.paidAt) {
		return { open: false, closesAt: null, reason: "notYetOpen" };
	}
	if (bounds.opensAt && now.getTime() < bounds.opensAt.getTime()) {
		return { open: false, closesAt: null, reason: "notYetOpen" };
	}

	let closesAt = bounds.closesAt;
	if (order.paymentMethod === "mobile_money" && order.paidAt) {
		const cap = addDays(order.paidAt, PROTECTED_WINDOW_CAP_DAYS);
		if (!closesAt || cap.getTime() < closesAt.getTime()) closesAt = cap;
	}
	if (!closesAt) return { open: false, closesAt: null, reason: "notYetOpen" };

	const open = now.getTime() <= closesAt.getTime();
	return open
		? { open: true, closesAt: closesAt.toISOString() }
		: { open: false, closesAt: closesAt.toISOString(), reason: "windowClosed" };
}

const OPENER_ALLOWED: Record<DisputeReason, readonly OpenerRole[]> = {
	not_received: ["buyer"],
	not_as_described: ["buyer"],
	damaged: ["buyer", "shop"],
	counterfeit: ["buyer"],
	wrong_item: ["buyer", "shop"],
	seller_no_show: ["buyer"],
	cod_refused_abuse: ["shop"],
};

export function openerAllowed(
	reason: DisputeReason,
	openerRole: OpenerRole,
): boolean {
	return OPENER_ALLOWED[reason].includes(openerRole);
}

export function evidenceRequired(reason: DisputeReason): number {
	return DISPUTE_EVIDENCE_REQUIREMENTS[reason];
}

export interface ProofRecords {
	otpVerified: boolean;
	/** GPS distance from the delivery pin, in meters; null when no POD was captured. */
	podDistanceMeters: number | null;
	podPhotoIntact: boolean;
	preShipmentPhotos: boolean;
	packingBeforeShipment: boolean;
	snapshotMatch: boolean;
	brandAuthorisation: boolean;
	attemptProof: boolean;
	rescheduleAccepted: boolean;
}

export interface ProofChecklistRow {
	requirement: string;
	established: boolean;
	source: string | null;
}

export type ProofChecklist = ProofChecklistRow[];

const POD_MAX_DISTANCE_METERS = 200;
const podWithin200m = (records: ProofRecords): boolean =>
	records.podDistanceMeters !== null &&
	Number.isFinite(records.podDistanceMeters) &&
	records.podDistanceMeters >= 0 &&
	records.podDistanceMeters <= POD_MAX_DISTANCE_METERS;

export function proofChecklist(
	reason: DisputeReason,
	records: ProofRecords,
): ProofChecklist {
	switch (reason) {
		case "not_received": {
			const pod = podWithin200m(records);
			return [
				{
					requirement: "handover_otp_verified",
					established: records.otpVerified,
					source: records.otpVerified ? "handover" : null,
				},
				{
					requirement: "pod_within_200m",
					established: pod,
					source: pod ? "pod_gps" : null,
				},
			];
		}
		case "seller_no_show": {
			const { attemptProof, rescheduleAccepted } = records;
			return [
				{
					requirement: "delivery_attempt_at_slot",
					established: attemptProof,
					source: attemptProof ? "delivery_attempt" : null,
				},
				{
					requirement: "reschedule_accepted_by_buyer",
					established: rescheduleAccepted,
					source: rescheduleAccepted ? "conversation" : null,
				},
			];
		}
		case "not_as_described":
		case "wrong_item": {
			const established =
				records.snapshotMatch &&
				(records.preShipmentPhotos || records.packingBeforeShipment);
			return [
				{
					requirement: "snapshot_and_pre_shipment_evidence",
					established,
					source: established
						? records.preShipmentPhotos
							? "pre_shipment_photos"
							: "packing_record"
						: null,
				},
			];
		}
		case "damaged": {
			const established = records.preShipmentPhotos && records.podPhotoIntact;
			return [
				{
					requirement: "pre_shipment_and_pod_intact",
					established,
					source: established ? "pre_shipment_and_pod" : null,
				},
			];
		}
		case "counterfeit": {
			const established = records.brandAuthorisation;
			return [
				{
					requirement: "brand_authorisation",
					established,
					source: established ? "brand_authorisation" : null,
				},
			];
		}
		case "cod_refused_abuse": {
			const established = records.attemptProof;
			return [
				{
					requirement: "delivery_attempt_proof",
					established,
					source: established ? "delivery_attempt" : null,
				},
			];
		}
	}
}

export interface SilenceDispute {
	reason: DisputeReason;
	openedByType: OpenerRole;
}

export interface SilenceVerdict {
	outcome: "resolved_buyer" | "resolved_seller" | "under_review";
	decidedByType: "system" | null;
	returnRequired: boolean;
}

export function silenceOutcome(
	dispute: SilenceDispute,
	proof: ProofChecklist,
): SilenceVerdict {
	switch (dispute.reason) {
		case "not_received": {
			const hasProof = proof.some((row) => row.established);
			return hasProof
				? {
						outcome: "under_review",
						decidedByType: null,
						returnRequired: false,
					}
				: {
						outcome: "resolved_buyer",
						decidedByType: "system",
						returnRequired: false,
					};
		}
		case "counterfeit":
			return {
				outcome: "under_review",
				decidedByType: null,
				returnRequired: false,
			};
		case "cod_refused_abuse":
			return {
				outcome: "resolved_seller",
				decidedByType: "system",
				returnRequired: false,
			};
		case "seller_no_show":
			return {
				outcome: "resolved_buyer",
				decidedByType: "system",
				returnRequired: false,
			};
		case "not_as_described":
			return {
				outcome: "resolved_buyer",
				decidedByType: "system",
				returnRequired: true,
			};
		case "damaged":
		case "wrong_item":
			return dispute.openedByType === "buyer"
				? {
						outcome: "resolved_buyer",
						decidedByType: "system",
						returnRequired: true,
					}
				: {
						outcome: "resolved_seller",
						decidedByType: "system",
						returnRequired: false,
					};
	}
}

const OVERRIDE_REASON_CODES = new Set([
	"buyer_abuse",
	"item_conforms",
	"delivery_proven",
]);
const OVERRIDE_NOTE_MIN_LENGTH = 50;

/** Whether a `resolved_seller` decision is permitted: free when the art. 26
 * checklist shows established seller proof, otherwise gated on one of the
 * three buyer-side reason codes plus a note long enough to not be a rubber
 * stamp. */
export function resolvedSellerNeedsOverride(
	checklist: ProofChecklist,
	reasonCode: string,
	note: string,
): boolean {
	if (checklist.some((row) => row.established)) return true;
	return (
		OVERRIDE_REASON_CODES.has(reasonCode) &&
		note.length >= OVERRIDE_NOTE_MIN_LENGTH
	);
}

export type ReturnBasis = ReturnCase["basis"];

export interface ReturnWaivedInput {
	basis: ReturnBasis;
	goodsValue: number;
	counterfeit: boolean;
	settings: { returnWaiverMaxGoodsValue: number };
}

/** The spec's waiver applies only to `non_conformity` (Legal bases table);
 * withdrawal, late_delivery and unavailable follow their own fixed rule. */
export function returnWaived({
	basis,
	goodsValue,
	counterfeit,
	settings,
}: ReturnWaivedInput): boolean {
	if (basis !== "non_conformity") return false;
	return counterfeit || goodsValue <= settings.returnWaiverMaxGoodsValue;
}
