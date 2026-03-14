"use client";

import { Banner, Button, Pill, ShimmerEffect } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

interface ListingDoc {
	id: string;
	title: string;
	description?: string;
	price: number;
	createdAt: string;
	seller?: { name?: string; email: string } | string;
	category?: { name?: string } | string;
	images?: { image?: { url?: string; thumbnailURL?: string } | string }[];
}

export function ModerationQueueClient() {
	const [listings, setListings] = useState<ListingDoc[]>([]);
	const [loading, setLoading] = useState(true);
	const [rejectId, setRejectId] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [acting, setActing] = useState(false);

	const fetchListings = useCallback(() => {
		setLoading(true);
		fetch(
			"/api/listings?where[status][equals]=pending&sort=-createdAt&depth=1&limit=50",
		)
			.then((r) => r.json())
			.then((data) => setListings(data.docs || []))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		fetchListings();
	}, [fetchListings]);

	const handleApprove = async (id: string) => {
		setActing(true);
		try {
			const res = await fetch(`/api/listings/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "published" }),
			});
			if (!res.ok) throw new Error("Failed");
			fetchListings();
		} catch {
			/* ignore */
		} finally {
			setActing(false);
		}
	};

	const handleReject = async (id: string) => {
		if (!reason.trim()) return;
		setActing(true);
		try {
			const res = await fetch(`/api/listings/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
			});
			if (!res.ok) throw new Error("Failed");
			setRejectId(null);
			setReason("");
			fetchListings();
		} catch {
			/* ignore */
		} finally {
			setActing(false);
		}
	};

	const formatDate = (date: string) =>
		new Date(date).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});

	if (loading) return <ShimmerEffect />;

	return (
		<>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "1.5rem",
				}}
			>
				<h1 style={{ margin: 0 }}>Moderation Queue</h1>
				<Pill pillStyle="warning">{listings.length} pending</Pill>
			</div>

			{listings.length === 0 ? (
				<Banner type="success">No pending listings to review.</Banner>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
					{listings.map((listing) => {
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
									border: "1px solid var(--theme-elevation-150)",
									borderRadius: "var(--style-radius-s)",
									padding: "1rem",
									display: "flex",
									gap: "1rem",
									alignItems: "flex-start",
								}}
							>
								{firstImage?.url && (
									// biome-ignore lint/performance/noImgElement: admin panel
									<img
										src={firstImage.thumbnailURL || firstImage.url}
										alt={listing.title}
										style={{
											width: "80px",
											height: "80px",
											objectFit: "cover",
											borderRadius: "var(--style-radius-s)",
											flexShrink: 0,
										}}
									/>
								)}
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: "0.5rem",
											marginBottom: "0.25rem",
										}}
									>
										<a
											href={`/admin/collections/listings/${listing.id}`}
											style={{ fontWeight: 600, color: "var(--theme-text)" }}
										>
											{listing.title}
										</a>
										{category?.name && (
											<Pill pillStyle="light-gray" size="small">
												{category.name}
											</Pill>
										)}
									</div>
									<div
										style={{
											fontSize: "0.8125rem",
											color: "var(--theme-elevation-500)",
											marginBottom: "0.5rem",
										}}
									>
										{seller?.name || seller?.email || "Unknown"} ·{" "}
										{listing.price.toLocaleString()} XAF ·{" "}
										{formatDate(listing.createdAt)}
									</div>
									{listing.description && (
										<p
											style={{
												fontSize: "0.8125rem",
												color: "var(--theme-elevation-600)",
												margin: "0 0 0.75rem",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{listing.description}
										</p>
									)}
									{rejectId === listing.id ? (
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: "0.5rem",
											}}
										>
											<textarea
												value={reason}
												onChange={(e) => setReason(e.target.value)}
												placeholder="Rejection reason..."
												rows={2}
												style={{
													width: "100%",
													padding: "0.5rem",
													border: "1px solid var(--theme-elevation-200)",
													borderRadius: "var(--style-radius-s)",
													fontSize: "0.8125rem",
													resize: "vertical",
													background: "var(--theme-input-bg)",
													color: "var(--theme-text)",
												}}
											/>
											<div style={{ display: "flex", gap: "0.5rem" }}>
												<Button
													buttonStyle="error"
													size="small"
													onClick={() => handleReject(listing.id)}
													disabled={acting}
												>
													Confirm Reject
												</Button>
												<Button
													buttonStyle="secondary"
													size="small"
													onClick={() => {
														setRejectId(null);
														setReason("");
													}}
												>
													Cancel
												</Button>
											</div>
										</div>
									) : (
										<div style={{ display: "flex", gap: "0.5rem" }}>
											<Button
												buttonStyle="primary"
												size="small"
												onClick={() => handleApprove(listing.id)}
												disabled={acting}
											>
												Approve
											</Button>
											<Button
												buttonStyle="error"
												size="small"
												onClick={() => setRejectId(listing.id)}
												disabled={acting}
											>
												Reject
											</Button>
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</>
	);
}
