export const updateUserRating = async ({
	req,
	reviewedUserId,
}: {
	req: { payload: unknown };
	reviewedUserId: string;
}) => {
	const payload = req.payload as {
		find: (options: {
			collection: string;
			where: Record<string, unknown>;
		}) => Promise<{ docs: Array<{ rating: number }> }>;
		update: (options: {
			collection: string;
			id: string;
			data: Record<string, unknown>;
		}) => Promise<unknown>;
	};

	const reviews = await payload.find({
		collection: "reviews",
		where: {
			reviewedUser: { equals: reviewedUserId },
		},
	});

	if (reviews.docs.length === 0) return;

	const totalRating = reviews.docs.reduce(
		(sum, review) => sum + (review.rating || 0),
		0,
	);
	const averageRating = totalRating / reviews.docs.length;

	await payload.update({
		collection: "users",
		id: reviewedUserId,
		data: {
			rating: Math.round(averageRating * 10) / 10,
			totalReviews: reviews.docs.length,
		},
	});
};
