export function deliveryEstimateRequest(
	listingId: string,
	userId: string | null,
	city: string | null,
) {
	const params = new URLSearchParams();
	if (city) params.set("city", city);
	const suffix = params.size ? `?${params.toString()}` : "";
	return {
		queryKey: [
			"listings",
			listingId,
			"delivery-estimates",
			userId ?? "",
			city ?? "",
		] as const,
		path: `/api/public/listings/${encodeURIComponent(listingId)}/delivery-options${suffix}`,
	};
}
