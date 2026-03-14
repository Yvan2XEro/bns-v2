import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import type React from "react";
import { ModerationActions } from "./ModerationActions";

const ModerationQueue: React.FC<AdminViewServerProps> = async ({
	initPageResult,
}) => {
	const { req, permissions } = initPageResult;
	const { payload, user } = req;

	const pendingListings = await payload.find({
		collection: "listings",
		where: {
			status: { equals: "pending" },
		},
		sort: "-createdAt",
		depth: 1,
		limit: 50,
	});

	const formatDate = (date: string | undefined) => {
		if (!date) return "N/A";
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const formatPrice = (price: number | undefined) => {
		if (price == null) return "N/A";
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(price);
	};

	return (
		<DefaultTemplate
			i18n={req.i18n}
			locale={initPageResult.locale}
			params={{}}
			payload={payload}
			permissions={permissions}
			searchParams={{}}
			user={user ?? undefined}
			visibleEntities={initPageResult.visibleEntities}
		>
			<Gutter>
				<h1 style={{ marginBottom: "1.5rem" }}>
					Moderation Queue ({pendingListings.totalDocs} pending)
				</h1>

				{pendingListings.docs.length === 0 ? (
					<div
						style={{
							padding: "2rem",
							textAlign: "center",
							color: "var(--theme-elevation-500)",
							border: "1px solid var(--theme-elevation-200)",
							borderRadius: "4px",
						}}
					>
						<p>No pending listings to review.</p>
					</div>
				) : (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "1rem",
						}}
					>
						{pendingListings.docs.map((listing: any) => {
							const seller =
								typeof listing.seller === "object" ? listing.seller : null;
							const category =
								typeof listing.category === "object" ? listing.category : null;
							const firstImage =
								listing.images?.[0]?.image &&
								typeof listing.images[0].image === "object"
									? listing.images[0].image
									: null;

							return (
								<div
									key={listing.id}
									style={{
										border: "1px solid var(--theme-elevation-200)",
										borderRadius: "4px",
										padding: "1rem",
										display: "flex",
										gap: "1rem",
										alignItems: "flex-start",
										backgroundColor: "var(--theme-elevation-50)",
									}}
								>
									{firstImage?.url && (
										<img
											src={firstImage.thumbnailURL || firstImage.url}
											alt={listing.title}
											style={{
												width: "80px",
												height: "80px",
												objectFit: "cover",
												borderRadius: "4px",
												flexShrink: 0,
											}}
										/>
									)}
									<div style={{ flex: 1, minWidth: 0 }}>
										<div
											style={{
												display: "flex",
												justifyContent: "space-between",
												alignItems: "flex-start",
												gap: "1rem",
												marginBottom: "0.5rem",
											}}
										>
											<div>
												<h3 style={{ margin: 0 }}>
													<a
														href={`/admin/collections/listings/${listing.id}`}
														style={{ color: "var(--theme-text)" }}
													>
														{listing.title}
													</a>
												</h3>
												<div
													style={{
														fontSize: "0.875rem",
														color: "var(--theme-elevation-500)",
														marginTop: "0.25rem",
													}}
												>
													{category?.name && (
														<span>Category: {category.name} | </span>
													)}
													<span>
														Seller: {seller?.name || seller?.email || "Unknown"}{" "}
														|{" "}
													</span>
													<span>Price: {formatPrice(listing.price)} | </span>
													<span>
														Submitted: {formatDate(listing.createdAt)}
													</span>
												</div>
											</div>
										</div>
										{listing.description && (
											<p
												style={{
													fontSize: "0.875rem",
													color: "var(--theme-elevation-600)",
													margin: "0.5rem 0",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
											>
												{listing.description}
											</p>
										)}
										<ModerationActions listingId={listing.id} />
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Gutter>
		</DefaultTemplate>
	);
};

export default ModerationQueue;
