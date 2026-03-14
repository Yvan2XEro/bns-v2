import type { AdminViewServerProps } from "payload";
import type React from "react";

const ModerationWidget: React.FC<AdminViewServerProps> = async ({
	initPageResult,
}) => {
	const { req } = initPageResult;
	const { payload } = req;

	const [pendingListings, pendingReports, unverifiedUsers] = await Promise.all([
		payload.count({
			collection: "listings",
			where: { status: { equals: "pending" } },
		}),
		payload.count({
			collection: "reports",
			where: { status: { equals: "pending" } },
		}),
		payload.count({
			collection: "users",
			where: { verified: { equals: false } },
		}),
	]);

	const stats = [
		{
			label: "Pending Listings",
			count: pendingListings.totalDocs,
			href: "/admin/moderation",
			color: "#f59e0b",
		},
		{
			label: "Pending Reports",
			count: pendingReports.totalDocs,
			href: "/admin/reports-queue",
			color: "#ef4444",
		},
		{
			label: "Unverified Users",
			count: unverifiedUsers.totalDocs,
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
				{stats.map((stat) => (
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
							transition: "background-color 0.15s",
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
};

export default ModerationWidget;
