"use client";

import { useEffect, useState } from "react";

interface Stats {
	pendingListings: number;
	pendingReports: number;
	unverifiedUsers: number;
}

export default function ModerationWidget() {
	const [stats, setStats] = useState<Stats | null>(null);

	useEffect(() => {
		async function fetchStats() {
			try {
				const [listings, reports, users] = await Promise.all([
					fetch("/api/listings?where[status][equals]=pending&limit=0").then(
						(r) => r.json(),
					),
					fetch("/api/reports?where[status][equals]=pending&limit=0").then(
						(r) => r.json(),
					),
					fetch("/api/users?where[verified][equals]=false&limit=0").then((r) =>
						r.json(),
					),
				]);
				setStats({
					pendingListings: listings.totalDocs ?? 0,
					pendingReports: reports.totalDocs ?? 0,
					unverifiedUsers: users.totalDocs ?? 0,
				});
			} catch {
				/* ignore */
			}
		}
		fetchStats();
	}, []);

	if (!stats) return null;

	const items = [
		{
			label: "Pending Listings",
			count: stats.pendingListings,
			href: "/admin/moderation",
			color: "#f59e0b",
		},
		{
			label: "Pending Reports",
			count: stats.pendingReports,
			href: "/admin/reports-queue",
			color: "#ef4444",
		},
		{
			label: "Unverified Users",
			count: stats.unverifiedUsers,
			href: "/admin/users-management",
			color: "#3b82f6",
		},
	];

	return (
		<div
			style={{
				marginBottom: "1.5rem",
				border: "1px solid var(--theme-elevation-200)",
				borderRadius: "4px",
				padding: "1rem",
			}}
		>
			<h3 style={{ margin: "0 0 1rem 0" }}>Moderation Overview</h3>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(3, 1fr)",
					gap: "1rem",
				}}
			>
				{items.map((stat) => (
					<a
						key={stat.label}
						href={stat.href}
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							padding: "1rem",
							border: "1px solid var(--theme-elevation-200)",
							borderRadius: "4px",
							textDecoration: "none",
							color: "var(--theme-text)",
						}}
					>
						<span
							style={{
								fontSize: "2rem",
								fontWeight: 700,
								color: stat.color,
							}}
						>
							{stat.count}
						</span>
						<span
							style={{
								fontSize: "0.875rem",
								color: "var(--theme-elevation-500)",
								marginTop: "0.25rem",
							}}
						>
							{stat.label}
						</span>
					</a>
				))}
			</div>
		</div>
	);
}
