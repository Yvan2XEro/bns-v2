import type { Payload } from "payload";

type BoostPaymentRecord = {
	id: string;
	status?: string | null;
	duration: string | number;
	listing: string | { id: string };
};

type ListingRecord = {
	id: string;
	boostedUntil?: string | null;
};

const extractListingId = (
	listing: BoostPaymentRecord["listing"],
): string | null => {
	if (typeof listing === "string" && listing.length > 0) return listing;
	if (listing && typeof listing === "object" && "id" in listing) {
		const id = listing.id;
		if (typeof id === "string" && id.length > 0) return id;
	}
	return null;
};

const isBoostStillActive = (value: unknown): boolean => {
	if (typeof value !== "string" || !value) return false;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) && date > new Date();
};

export async function resolveBoostPayment(
	payload: Payload,
	candidateReferences: Array<string | undefined>,
): Promise<BoostPaymentRecord | null> {
	for (const candidateReference of candidateReferences) {
		if (!candidateReference) continue;

		if (candidateReference.startsWith("BOOST-")) {
			const paymentId = candidateReference.replace(/^BOOST-/, "");
			const payment = await payload
				.findByID({
					collection: "boost-payments",
					id: paymentId,
				})
				.catch(() => null);

			if (payment) return payment as BoostPaymentRecord;
		}

		const result = await payload
			.find({
				collection: "boost-payments",
				where: {
					paymentReference: {
						equals: candidateReference,
					},
				},
				limit: 1,
				pagination: false,
			})
			.catch(() => null);

		const payment = result?.docs?.[0];
		if (payment) return payment as BoostPaymentRecord;
	}

	return null;
}

export async function activateBoostPayment({
	payload,
	candidateReferences,
}: {
	payload: Payload;
	candidateReferences: Array<string | undefined>;
}): Promise<{
	paymentId: string;
	listingId: string;
	boostedUntil: string;
} | null> {
	const payment = await resolveBoostPayment(payload, candidateReferences);
	if (!payment) return null;

	const listingId = extractListingId(payment.listing);
	if (!listingId) return null;

	const listing = (await payload
		.findByID({
			collection: "listings",
			id: listingId,
			depth: 0,
		})
		.catch(() => null)) as ListingRecord | null;

	if (
		payment.status === "completed" &&
		isBoostStillActive(listing?.boostedUntil)
	) {
		return {
			paymentId: payment.id,
			listingId,
			boostedUntil: listing?.boostedUntil as string,
		};
	}

	const days = Number.parseInt(String(payment.duration), 10);
	const boostedUntil = new Date();
	boostedUntil.setDate(boostedUntil.getDate() + days);
	const boostedUntilIso = boostedUntil.toISOString();

	await payload.update({
		collection: "listings",
		id: listingId,
		data: { boostedUntil: boostedUntilIso },
	});

	if (payment.status !== "completed") {
		await payload.update({
			collection: "boost-payments",
			id: payment.id,
			data: { status: "completed" },
		});
	}

	return {
		paymentId: payment.id,
		listingId,
		boostedUntil: boostedUntilIso,
	};
}
