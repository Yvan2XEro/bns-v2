// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	type DisputeReason,
	type DisputeWindowOrder,
	evidenceRequired,
	type OpenerRole,
	openerAllowed,
	type ProofRecords,
	proofChecklist,
	reasonWindow,
	resolvedSellerNeedsOverride,
	returnWaived,
	silenceOutcome,
} from "../../src/lib/disputeRules";

const SETTINGS = {
	notReceivedMaxDays: 60,
	conformityWindowDays: 15,
	counterfeitWindowDays: 60,
	noShowWindowDays: 7,
};

const baseOrder = (
	overrides: Partial<DisputeWindowOrder> = {},
): DisputeWindowOrder => ({
	paymentMethod: "cod",
	paymentStatus: "cod_collected",
	status: "delivered",
	placedAt: "2026-01-01T00:00:00.000Z",
	shippedAt: null,
	deliveredAt: null,
	paidAt: null,
	promisedBy: null,
	noShow: null,
	returnCaseInspectBy: null,
	codRefusalAt: null,
	...overrides,
});

const NO_PROOF: ProofRecords = {
	otpVerified: false,
	podDistanceMeters: null,
	podPhotoIntact: false,
	preShipmentPhotos: false,
	packingBeforeShipment: false,
	snapshotMatch: false,
	brandAuthorisation: false,
	attemptProof: false,
	rescheduleAccepted: false,
};

describe("reasonWindow", () => {
	it.each<{ reason: DisputeReason; startsAt: string; role: OpenerRole }>([
		{
			reason: "not_received",
			startsAt: "2026-02-08T00:00:00.000Z",
			role: "buyer",
		},
		{
			reason: "not_as_described",
			startsAt: "2026-02-01T00:00:00.000Z",
			role: "buyer",
		},
		{ reason: "damaged", startsAt: "2026-02-01T00:00:00.000Z", role: "buyer" },
		{
			reason: "wrong_item",
			startsAt: "2026-02-01T00:00:00.000Z",
			role: "buyer",
		},
		{
			reason: "counterfeit",
			startsAt: "2026-02-01T00:00:00.000Z",
			role: "buyer",
		},
		{
			reason: "seller_no_show",
			startsAt: "2026-02-01T00:00:00.000Z",
			role: "buyer",
		},
		{
			reason: "cod_refused_abuse",
			startsAt: "2026-02-01T00:00:00.000Z",
			role: "shop",
		},
	])("opens $reason at its exact lower boundary", ({
		reason,
		startsAt,
		role,
	}) => {
		const order = baseOrder({
			shippedAt: "2026-02-01T00:00:00.000Z",
			deliveredAt: "2026-02-01T00:00:00.000Z",
			codRefusalAt: "2026-02-01T00:00:00.000Z",
			noShow: { slotEndsAt: "2026-02-01T00:00:00.000Z" },
		});
		expect(
			reasonWindow(
				reason,
				role,
				order,
				SETTINGS,
				new Date(new Date(startsAt).getTime() - 1),
			),
		).toEqual({
			open: false,
			closesAt: null,
			reason: "notYetOpen",
		});
		expect(
			reasonWindow(reason, role, order, SETTINGS, new Date(startsAt)).open,
		).toBe(true);
	});

	it("protected windows fail closed without the payment timestamp", () => {
		const order = baseOrder({
			paymentMethod: "mobile_money",
			deliveredAt: "2026-02-01T00:00:00.000Z",
		});
		expect(
			reasonWindow("damaged", "buyer", order, SETTINGS, new Date("2026-02-02")),
		).toEqual({
			open: false,
			closesAt: null,
			reason: "notYetOpen",
		});
	});

	it.each<{ reason: DisputeReason; role: OpenerRole }>([
		{ reason: "not_received", role: "buyer" },
		{ reason: "not_as_described", role: "buyer" },
		{ reason: "damaged", role: "buyer" },
		{ reason: "damaged", role: "shop" },
		{ reason: "wrong_item", role: "buyer" },
		{ reason: "wrong_item", role: "shop" },
		{ reason: "counterfeit", role: "buyer" },
		{ reason: "seller_no_show", role: "buyer" },
	])("caps $reason ($role) at 80 days from payment", ({ reason, role }) => {
		const order = baseOrder({
			paymentMethod: "mobile_money",
			paidAt: "2026-07-20T00:00:00.000Z",
			placedAt: "2026-09-01T00:00:00.000Z",
			shippedAt: "2026-09-02T00:00:00.000Z",
			deliveredAt: "2026-10-01T00:00:00.000Z",
			returnCaseInspectBy: "2026-10-20T00:00:00.000Z",
			noShow: { slotEndsAt: "2026-10-05T00:00:00.000Z" },
		});
		expect(
			reasonWindow(
				reason,
				role,
				order,
				SETTINGS,
				new Date("2026-10-08T00:00:00.000Z"),
			),
		).toEqual({
			open: true,
			closesAt: "2026-10-08T00:00:00.000Z",
		});
		expect(
			reasonWindow(
				reason,
				role,
				order,
				SETTINGS,
				new Date("2026-10-08T00:00:00.001Z"),
			),
		).toEqual({
			open: false,
			closesAt: "2026-10-08T00:00:00.000Z",
			reason: "windowClosed",
		});
	});
	it("refusal disputes cannot open on a protected order", () => {
		const order = baseOrder({
			paymentMethod: "mobile_money",
			codRefusalAt: "2026-02-01T00:00:00.000Z",
		});
		expect(
			reasonWindow(
				"cod_refused_abuse",
				"shop",
				order,
				SETTINGS,
				new Date("2026-02-02"),
			),
		).toEqual({
			open: false,
			closesAt: null,
			reason: "notDelivered",
		});
	});

	it("COD windows do not inherit a protected-payment cap", () => {
		const order = baseOrder({
			paymentMethod: "cod",
			deliveredAt: "2026-09-01T00:00:00.000Z",
			paidAt: "2026-07-20T00:00:00.000Z",
		});
		expect(
			reasonWindow(
				"counterfeit",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-10-09"),
			),
		).toEqual({
			open: true,
			closesAt: "2026-10-31T00:00:00.000Z",
		});
	});

	it("not_received: opens at shippedAt+7d (pre-P7 fallback), closes at placedAt+notReceivedMaxDays", () => {
		const order = baseOrder({ shippedAt: "2026-01-02T00:00:00.000Z" });
		const atClose = new Date("2026-03-02T00:00:00.000Z");
		const pastClose = new Date("2026-03-02T00:00:00.001Z");
		const notYetOpen = new Date("2026-01-08T23:59:59.999Z");

		expect(
			reasonWindow("not_received", "buyer", order, SETTINGS, atClose),
		).toEqual({
			open: true,
			closesAt: "2026-03-02T00:00:00.000Z",
		});
		expect(
			reasonWindow("not_received", "buyer", order, SETTINGS, pastClose),
		).toEqual({
			open: false,
			closesAt: "2026-03-02T00:00:00.000Z",
			reason: "windowClosed",
		});
		expect(
			reasonWindow("not_received", "buyer", order, SETTINGS, notYetOpen),
		).toEqual({
			open: false,
			closesAt: null,
			reason: "notYetOpen",
		});
	});

	it("not_received: promisedBy+2d (P7) takes priority over the shippedAt+7d fallback", () => {
		const order = baseOrder({
			shippedAt: "2026-01-02T00:00:00.000Z", // fallback would open Jan 9
			promisedBy: "2026-01-05T00:00:00.000Z", // P7 path opens Jan 7
		});
		expect(
			reasonWindow(
				"not_received",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-01-07T00:00:00.000Z"),
			),
		).toEqual({ open: true, closesAt: "2026-03-02T00:00:00.000Z" });
	});

	it("not_received: neither shippedAt nor promisedBy present -> notYetOpen", () => {
		const order = baseOrder();
		expect(
			reasonWindow(
				"not_received",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-06-01T00:00:00.000Z"),
			),
		).toEqual({ open: false, closesAt: null, reason: "notYetOpen" });
	});

	it("not_received on COD requires paymentStatus cod_collected or status delivered", () => {
		const shipped = { shippedAt: "2026-01-02T00:00:00.000Z" };
		const now = new Date("2026-01-20T00:00:00.000Z");
		const notCollectedNotDelivered = baseOrder({
			...shipped,
			paymentMethod: "cod",
			paymentStatus: "cod_pending",
			status: "shipped",
		});
		expect(
			reasonWindow(
				"not_received",
				"buyer",
				notCollectedNotDelivered,
				SETTINGS,
				now,
			),
		).toEqual({ open: false, closesAt: null, reason: "notDelivered" });

		const collected = baseOrder({
			...shipped,
			paymentMethod: "cod",
			paymentStatus: "cod_collected",
			status: "shipped",
		});
		expect(
			reasonWindow("not_received", "buyer", collected, SETTINGS, now).open,
		).toBe(true);

		const delivered = baseOrder({
			...shipped,
			paymentMethod: "cod",
			paymentStatus: "cod_pending",
			status: "delivered",
		});
		expect(
			reasonWindow("not_received", "buyer", delivered, SETTINGS, now).open,
		).toBe(true);
	});

	it.each<DisputeReason>([
		"not_as_described",
		"wrong_item",
	])("%s (buyer): 15 days from deliveredAt, both boundaries", (reason) => {
		const order = baseOrder({ deliveredAt: "2026-02-01T00:00:00.000Z" });
		const atClose = new Date("2026-02-16T00:00:00.000Z");
		const pastClose = new Date("2026-02-16T00:00:00.001Z");
		expect(reasonWindow(reason, "buyer", order, SETTINGS, atClose)).toEqual({
			open: true,
			closesAt: "2026-02-16T00:00:00.000Z",
		});
		expect(reasonWindow(reason, "buyer", order, SETTINGS, pastClose)).toEqual({
			open: false,
			closesAt: "2026-02-16T00:00:00.000Z",
			reason: "windowClosed",
		});
	});

	it("damaged (buyer): 15 days from deliveredAt, both boundaries", () => {
		const order = baseOrder({ deliveredAt: "2026-02-01T00:00:00.000Z" });
		expect(
			reasonWindow(
				"damaged",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-02-16T00:00:00.000Z"),
			),
		).toEqual({ open: true, closesAt: "2026-02-16T00:00:00.000Z" });
		expect(
			reasonWindow(
				"damaged",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-02-16T00:00:00.001Z"),
			),
		).toEqual({
			open: false,
			closesAt: "2026-02-16T00:00:00.000Z",
			reason: "windowClosed",
		});
	});

	it("not_as_described/damaged/wrong_item (buyer): not yet delivered -> notYetOpen", () => {
		const order = baseOrder();
		expect(
			reasonWindow(
				"not_as_described",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-02-01T00:00:00.000Z"),
			),
		).toEqual({ open: false, closesAt: null, reason: "notYetOpen" });
	});

	it.each<DisputeReason>([
		"damaged",
		"wrong_item",
	])("%s (seller on a return case): open until the case's inspectBy, both boundaries", (reason) => {
		const order = baseOrder({
			returnCaseInspectBy: "2026-02-10T00:00:00.000Z",
		});
		expect(
			reasonWindow(
				reason,
				"shop",
				order,
				SETTINGS,
				new Date("2026-02-10T00:00:00.000Z"),
			),
		).toEqual({ open: true, closesAt: "2026-02-10T00:00:00.000Z" });
		expect(
			reasonWindow(
				reason,
				"shop",
				order,
				SETTINGS,
				new Date("2026-02-10T00:00:00.001Z"),
			),
		).toEqual({
			open: false,
			closesAt: "2026-02-10T00:00:00.000Z",
			reason: "windowClosed",
		});
	});

	it("damaged/wrong_item (seller): no inspectBy yet -> notYetOpen", () => {
		const order = baseOrder();
		expect(
			reasonWindow(
				"damaged",
				"shop",
				order,
				SETTINGS,
				new Date("2026-02-10T00:00:00.000Z"),
			),
		).toEqual({ open: false, closesAt: null, reason: "notYetOpen" });
	});

	it("counterfeit: 60 days from deliveredAt, both boundaries", () => {
		const order = baseOrder({ deliveredAt: "2026-02-01T00:00:00.000Z" });
		expect(
			reasonWindow(
				"counterfeit",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-04-02T00:00:00.000Z"),
			),
		).toEqual({ open: true, closesAt: "2026-04-02T00:00:00.000Z" });
		expect(
			reasonWindow(
				"counterfeit",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-04-02T00:00:00.001Z"),
			),
		).toEqual({
			open: false,
			closesAt: "2026-04-02T00:00:00.000Z",
			reason: "windowClosed",
		});
	});

	it("the 80-day protected cap overrides a longer counterfeit window", () => {
		// paidAt 2026-07-20 -> cap closes 2026-10-08, even though 60 days from
		// a 2026-09-01 delivery would run to 2026-10-31.
		const order = baseOrder({
			paymentMethod: "mobile_money",
			deliveredAt: "2026-09-01T00:00:00.000Z",
			paidAt: "2026-07-20T00:00:00.000Z",
		});
		expect(
			reasonWindow(
				"counterfeit",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-10-08T00:00:00.000Z"),
			),
		).toEqual({ open: true, closesAt: "2026-10-08T00:00:00.000Z" });
		expect(
			reasonWindow(
				"counterfeit",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-10-08T00:00:00.001Z"),
			),
		).toEqual({
			open: false,
			closesAt: "2026-10-08T00:00:00.000Z",
			reason: "windowClosed",
		});
	});

	it("seller_no_show: 7 days after the slot ends, both boundaries", () => {
		const order = baseOrder({
			noShow: { slotEndsAt: "2026-02-01T00:00:00.000Z" },
		});
		expect(
			reasonWindow(
				"seller_no_show",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-02-08T00:00:00.000Z"),
			),
		).toEqual({ open: true, closesAt: "2026-02-08T00:00:00.000Z" });
		expect(
			reasonWindow(
				"seller_no_show",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-02-08T00:00:00.001Z"),
			),
		).toEqual({
			open: false,
			closesAt: "2026-02-08T00:00:00.000Z",
			reason: "windowClosed",
		});
	});

	it("seller_no_show: closed before P7 ships the slot data, not a hard-coded disable", () => {
		const order = baseOrder();
		expect(
			reasonWindow(
				"seller_no_show",
				"buyer",
				order,
				SETTINGS,
				new Date("2026-06-01T00:00:00.000Z"),
			),
		).toEqual({ open: false, closesAt: null, reason: "unavailableBeforeP7" });
	});

	it("cod_refused_abuse: 7 days after the P4 refusal event, both boundaries", () => {
		const order = baseOrder({
			paymentMethod: "cod",
			codRefusalAt: "2026-02-01T00:00:00.000Z",
		});
		expect(
			reasonWindow(
				"cod_refused_abuse",
				"shop",
				order,
				SETTINGS,
				new Date("2026-02-08T00:00:00.000Z"),
			),
		).toEqual({ open: true, closesAt: "2026-02-08T00:00:00.000Z" });
		expect(
			reasonWindow(
				"cod_refused_abuse",
				"shop",
				order,
				SETTINGS,
				new Date("2026-02-08T00:00:00.001Z"),
			),
		).toEqual({
			open: false,
			closesAt: "2026-02-08T00:00:00.000Z",
			reason: "windowClosed",
		});
	});

	it("cod_refused_abuse: no refusal event yet -> notYetOpen", () => {
		const order = baseOrder({ paymentMethod: "cod" });
		expect(
			reasonWindow(
				"cod_refused_abuse",
				"shop",
				order,
				SETTINGS,
				new Date("2026-02-08T00:00:00.000Z"),
			),
		).toEqual({ open: false, closesAt: null, reason: "notYetOpen" });
	});
});

describe("openerAllowed", () => {
	it("matches the Reasons table exactly, reason by reason and role by role", () => {
		const reasons: DisputeReason[] = [
			"not_received",
			"not_as_described",
			"damaged",
			"counterfeit",
			"wrong_item",
			"seller_no_show",
			"cod_refused_abuse",
		];
		const matrix = Object.fromEntries(
			reasons.map((reason) => [
				reason,
				{
					buyer: openerAllowed(reason, "buyer"),
					shop: openerAllowed(reason, "shop"),
				},
			]),
		);
		expect(matrix).toEqual({
			not_received: { buyer: true, shop: false },
			not_as_described: { buyer: true, shop: false },
			damaged: { buyer: true, shop: true },
			counterfeit: { buyer: true, shop: false },
			wrong_item: { buyer: true, shop: true },
			seller_no_show: { buyer: true, shop: false },
			cod_refused_abuse: { buyer: false, shop: true },
		});
	});
});

describe("evidenceRequired", () => {
	it("matches the exact count per reason", () => {
		const reasons: DisputeReason[] = [
			"not_received",
			"not_as_described",
			"damaged",
			"counterfeit",
			"wrong_item",
			"seller_no_show",
			"cod_refused_abuse",
		];
		const counts = Object.fromEntries(
			reasons.map((reason) => [reason, evidenceRequired(reason)]),
		);
		expect(counts).toEqual({
			not_received: 0,
			not_as_described: 1,
			damaged: 1,
			counterfeit: 2,
			wrong_item: 1,
			seller_no_show: 0,
			cod_refused_abuse: 1,
		});
	});
});

describe("proofChecklist", () => {
	it.each<DisputeReason>([
		"not_as_described",
		"wrong_item",
	])("%s needs a snapshot match plus pre-shipment evidence", (reason) => {
		expect(
			proofChecklist(reason, {
				...NO_PROOF,
				snapshotMatch: true,
				packingBeforeShipment: true,
			}),
		).toEqual([
			{
				requirement: "snapshot_and_pre_shipment_evidence",
				established: true,
				source: "packing_record",
			},
		]);
		expect(
			proofChecklist(reason, {
				...NO_PROOF,
				snapshotMatch: true,
				preShipmentPhotos: true,
			}),
		).toEqual([
			{
				requirement: "snapshot_and_pre_shipment_evidence",
				established: true,
				source: "pre_shipment_photos",
			},
		]);
		for (const records of [
			NO_PROOF,
			{ ...NO_PROOF, snapshotMatch: true },
			{ ...NO_PROOF, preShipmentPhotos: true },
			{ ...NO_PROOF, packingBeforeShipment: true },
		]) {
			expect(proofChecklist(reason, records)).toEqual([
				{
					requirement: "snapshot_and_pre_shipment_evidence",
					established: false,
					source: null,
				},
			]);
		}
	});

	it("COD refusal checklist records delivery-attempt proof", () => {
		expect(
			proofChecklist("cod_refused_abuse", { ...NO_PROOF, attemptProof: true }),
		).toEqual([
			{
				requirement: "delivery_attempt_proof",
				established: true,
				source: "delivery_attempt",
			},
		]);
		expect(proofChecklist("cod_refused_abuse", NO_PROOF)).toEqual([
			{
				requirement: "delivery_attempt_proof",
				established: false,
				source: null,
			},
		]);
	});

	it("damaged proof needs an intact parcel POD photo, not GPS proximity", () => {
		const intact = {
			...NO_PROOF,
			preShipmentPhotos: true,
			podPhotoIntact: true,
		};
		expect(proofChecklist("damaged", intact)).toEqual([
			{
				requirement: "pre_shipment_and_pod_intact",
				established: true,
				source: "pre_shipment_and_pod",
			},
		]);
		expect(
			proofChecklist("damaged", {
				...NO_PROOF,
				preShipmentPhotos: true,
				podDistanceMeters: 50,
			}),
		).toEqual([
			{
				requirement: "pre_shipment_and_pod_intact",
				established: false,
				source: null,
			},
		]);
	});

	it.each([
		-1,
		Number.NEGATIVE_INFINITY,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("invalid POD distance %s does not establish delivery", (podDistanceMeters) => {
		expect(
			proofChecklist("not_received", { ...NO_PROOF, podDistanceMeters }),
		).toEqual([
			{
				requirement: "handover_otp_verified",
				established: false,
				source: null,
			},
			{ requirement: "pod_within_200m", established: false, source: null },
		]);
	});
	it("not_received: handover OTP establishes proof", () => {
		const checklist = proofChecklist("not_received", {
			...NO_PROOF,
			otpVerified: true,
		});
		expect(
			checklist.find((row) => row.requirement === "handover_otp_verified"),
		).toEqual({
			requirement: "handover_otp_verified",
			established: true,
			source: "handover",
		});
	});

	it("not_received: POD at exactly 200m establishes proof, 201m does not (the 200m line)", () => {
		const at200 = proofChecklist("not_received", {
			...NO_PROOF,
			podDistanceMeters: 200,
		});
		const at201 = proofChecklist("not_received", {
			...NO_PROOF,
			podDistanceMeters: 201,
		});
		expect(
			at200.find((row) => row.requirement === "pod_within_200m")?.established,
		).toBe(true);
		expect(
			at201.find((row) => row.requirement === "pod_within_200m")?.established,
		).toBe(false);
	});

	it("counterfeit: brand authorisation establishes proof", () => {
		expect(
			proofChecklist("counterfeit", { ...NO_PROOF, brandAuthorisation: true }),
		).toEqual([
			{
				requirement: "brand_authorisation",
				established: true,
				source: "brand_authorisation",
			},
		]);
		expect(proofChecklist("counterfeit", NO_PROOF)).toEqual([
			{ requirement: "brand_authorisation", established: false, source: null },
		]);
	});

	it("damaged: needs pre-shipment photos AND an intact POD photo, either alone is not enough", () => {
		expect(
			proofChecklist("damaged", {
				...NO_PROOF,
				podPhotoIntact: true,
				preShipmentPhotos: true,
			}),
		).toEqual([
			{
				requirement: "pre_shipment_and_pod_intact",
				established: true,
				source: "pre_shipment_and_pod",
			},
		]);
		expect(
			proofChecklist("damaged", {
				...NO_PROOF,
				preShipmentPhotos: true,
				podDistanceMeters: null,
			}),
		).toEqual([
			{
				requirement: "pre_shipment_and_pod_intact",
				established: false,
				source: null,
			},
		]);
		expect(
			proofChecklist("damaged", { ...NO_PROOF, podPhotoIntact: true }),
		).toEqual([
			{
				requirement: "pre_shipment_and_pod_intact",
				established: false,
				source: null,
			},
		]);
	});

	it("seller_no_show: an attempt or an accepted reschedule establishes proof", () => {
		expect(
			proofChecklist("seller_no_show", {
				...NO_PROOF,
				attemptProof: true,
			}).find((row) => row.requirement === "delivery_attempt_at_slot")
				?.established,
		).toBe(true);
		expect(
			proofChecklist("seller_no_show", {
				...NO_PROOF,
				rescheduleAccepted: true,
			}).find((row) => row.requirement === "reschedule_accepted_by_buyer")
				?.established,
		).toBe(true);
	});
});

describe("silenceOutcome", () => {
	it.each([
		200, 201,
	])("not_received uses the 200m POD line for silence (%sm)", (podDistanceMeters) => {
		expect(
			silenceOutcome(
				{ reason: "not_received", openedByType: "buyer" },
				proofChecklist("not_received", { ...NO_PROOF, podDistanceMeters }),
			),
		).toEqual(
			podDistanceMeters === 200
				? {
						outcome: "under_review",
						decidedByType: null,
						returnRequired: false,
					}
				: {
						outcome: "resolved_buyer",
						decidedByType: "system",
						returnRequired: false,
					},
		);
	});

	it.each<DisputeReason>([
		"not_as_described",
		"wrong_item",
	])("%s buyer silence resolves with return", (reason) => {
		expect(
			silenceOutcome(
				{ reason, openedByType: "buyer" },
				proofChecklist(reason, NO_PROOF),
			),
		).toEqual({
			outcome: "resolved_buyer",
			decidedByType: "system",
			returnRequired: true,
		});
	});

	it("wrong_item shop silence resolves for the opener", () => {
		expect(
			silenceOutcome(
				{ reason: "wrong_item", openedByType: "shop" },
				proofChecklist("wrong_item", NO_PROOF),
			),
		).toEqual({
			outcome: "resolved_seller",
			decidedByType: "system",
			returnRequired: false,
		});
	});
	it("not_received: OTP verified -> under_review", () => {
		const proof = proofChecklist("not_received", {
			...NO_PROOF,
			otpVerified: true,
		});
		expect(
			silenceOutcome({ reason: "not_received", openedByType: "buyer" }, proof),
		).toEqual({
			outcome: "under_review",
			decidedByType: null,
			returnRequired: false,
		});
	});

	it("not_received: no proof -> resolved_buyer by system", () => {
		const proof = proofChecklist("not_received", NO_PROOF);
		expect(
			silenceOutcome({ reason: "not_received", openedByType: "buyer" }, proof),
		).toEqual({
			outcome: "resolved_buyer",
			decidedByType: "system",
			returnRequired: false,
		});
	});

	it("counterfeit: always under_review, proof or not", () => {
		const withProof = proofChecklist("counterfeit", {
			...NO_PROOF,
			brandAuthorisation: true,
		});
		const withoutProof = proofChecklist("counterfeit", NO_PROOF);
		expect(
			silenceOutcome(
				{ reason: "counterfeit", openedByType: "buyer" },
				withProof,
			).outcome,
		).toBe("under_review");
		expect(
			silenceOutcome(
				{ reason: "counterfeit", openedByType: "buyer" },
				withoutProof,
			).outcome,
		).toBe("under_review");
	});

	it("damaged: buyer-opened silence -> resolved_buyer with a return required", () => {
		expect(
			silenceOutcome(
				{ reason: "damaged", openedByType: "buyer" },
				proofChecklist("damaged", NO_PROOF),
			),
		).toEqual({
			outcome: "resolved_buyer",
			decidedByType: "system",
			returnRequired: true,
		});
	});

	it("damaged: seller-opened silence -> resolved_seller, no return", () => {
		expect(
			silenceOutcome(
				{ reason: "damaged", openedByType: "shop" },
				proofChecklist("damaged", NO_PROOF),
			),
		).toEqual({
			outcome: "resolved_seller",
			decidedByType: "system",
			returnRequired: false,
		});
	});

	it("cod_refused_abuse: silence -> resolved_seller", () => {
		expect(
			silenceOutcome(
				{ reason: "cod_refused_abuse", openedByType: "shop" },
				proofChecklist("cod_refused_abuse", NO_PROOF),
			),
		).toEqual({
			outcome: "resolved_seller",
			decidedByType: "system",
			returnRequired: false,
		});
	});

	it("seller_no_show: silence -> resolved_buyer", () => {
		expect(
			silenceOutcome(
				{ reason: "seller_no_show", openedByType: "buyer" },
				proofChecklist("seller_no_show", NO_PROOF),
			),
		).toEqual({
			outcome: "resolved_buyer",
			decidedByType: "system",
			returnRequired: false,
		});
	});
});

describe("resolvedSellerNeedsOverride", () => {
	const noProofChecklist = proofChecklist("not_as_described", NO_PROOF);

	it("refuses a 49-char note", () => {
		const note = "x".repeat(49);
		expect(
			resolvedSellerNeedsOverride(noProofChecklist, "buyer_abuse", note),
		).toBe(false);
	});

	it("accepts a 50-char note with an allowed reasonCode", () => {
		const note = "x".repeat(50);
		expect(
			resolvedSellerNeedsOverride(noProofChecklist, "buyer_abuse", note),
		).toBe(true);
		expect(
			resolvedSellerNeedsOverride(noProofChecklist, "item_conforms", note),
		).toBe(true);
		expect(
			resolvedSellerNeedsOverride(noProofChecklist, "delivery_proven", note),
		).toBe(true);
	});

	it("refuses a reasonCode outside the allowed set, even with a long note", () => {
		const note = "x".repeat(80);
		expect(resolvedSellerNeedsOverride(noProofChecklist, "other", note)).toBe(
			false,
		);
	});

	it("needs no override once the checklist shows established proof", () => {
		const established = proofChecklist("not_as_described", {
			...NO_PROOF,
			snapshotMatch: true,
			preShipmentPhotos: true,
		});
		expect(resolvedSellerNeedsOverride(established, "other", "")).toBe(true);
	});
});

describe("returnWaived", () => {
	it("waives at exactly the max goods value, not above it", () => {
		const settings = { returnWaiverMaxGoodsValue: 10_000 };
		expect(
			returnWaived({
				basis: "non_conformity",
				goodsValue: 10_000,
				counterfeit: false,
				settings,
			}),
		).toBe(true);
		expect(
			returnWaived({
				basis: "non_conformity",
				goodsValue: 10_001,
				counterfeit: false,
				settings,
			}),
		).toBe(false);
	});

	it("always waives on counterfeit, whatever the goods value", () => {
		const settings = { returnWaiverMaxGoodsValue: 10_000 };
		expect(
			returnWaived({
				basis: "non_conformity",
				goodsValue: 500_000,
				counterfeit: true,
				settings,
			}),
		).toBe(true);
	});

	it("never waives outside non_conformity", () => {
		const settings = { returnWaiverMaxGoodsValue: 10_000 };
		expect(
			returnWaived({
				basis: "withdrawal",
				goodsValue: 100,
				counterfeit: false,
				settings,
			}),
		).toBe(false);
	});
});
