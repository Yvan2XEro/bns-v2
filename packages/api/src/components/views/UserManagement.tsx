import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { UserActions } from "./UserActions";

export async function UserManagement({
	initPageResult,
	params,
	searchParams,
}: AdminViewServerProps) {
	const { payload, user } = initPageResult.req;

	const users = await payload.find({
		collection: "users",
		sort: "-createdAt",
		limit: 50,
		depth: 0,
	});

	const formatDate = (date: string | undefined) => {
		if (!date) return "N/A";
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	const roleBadgeColors: Record<string, { bg: string; color: string }> = {
		admin: { bg: "#fecaca", color: "#991b1b" },
		moderator: { bg: "#dbeafe", color: "#1e40af" },
		user: { bg: "var(--theme-elevation-200)", color: "var(--theme-text)" },
	};

	return (
		<DefaultTemplate
			i18n={initPageResult.req.i18n}
			locale={initPageResult.locale}
			params={params}
			payload={payload}
			permissions={initPageResult.permissions}
			searchParams={searchParams}
			user={user || undefined}
			visibleEntities={initPageResult.visibleEntities}
		>
			<Gutter>
				<h1 style={{ marginBottom: "1.5rem" }}>
					User Management ({users.totalDocs} users)
				</h1>

				<div style={{ overflowX: "auto" }}>
					<table
						style={{
							width: "100%",
							borderCollapse: "collapse",
							fontSize: "0.875rem",
						}}
					>
						<thead>
							<tr
								style={{
									borderBottom: "2px solid var(--theme-elevation-200)",
									textAlign: "left",
								}}
							>
								<th style={{ padding: "0.75rem 0.5rem" }}>Name</th>
								<th style={{ padding: "0.75rem 0.5rem" }}>Email</th>
								<th style={{ padding: "0.75rem 0.5rem" }}>Role</th>
								<th style={{ padding: "0.75rem 0.5rem" }}>Verified</th>
								<th style={{ padding: "0.75rem 0.5rem" }}>Rating</th>
								<th style={{ padding: "0.75rem 0.5rem" }}>Joined</th>
								<th style={{ padding: "0.75rem 0.5rem" }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{users.docs.map((u: any) => {
								const colors = roleBadgeColors[u.role] || roleBadgeColors.user;
								return (
									<tr
										key={u.id}
										style={{
											borderBottom: "1px solid var(--theme-elevation-150)",
										}}
									>
										<td style={{ padding: "0.75rem 0.5rem" }}>
											<a
												href={`/admin/collections/users/${u.id}`}
												style={{ color: "var(--theme-text)", fontWeight: 500 }}
											>
												{u.name || "N/A"}
											</a>
										</td>
										<td style={{ padding: "0.75rem 0.5rem" }}>{u.email}</td>
										<td style={{ padding: "0.75rem 0.5rem" }}>
											<span
												style={{
													display: "inline-block",
													padding: "0.125rem 0.5rem",
													backgroundColor: colors.bg,
													color: colors.color,
													borderRadius: "9999px",
													fontSize: "0.75rem",
													fontWeight: 600,
												}}
											>
												{u.role}
											</span>
										</td>
										<td style={{ padding: "0.75rem 0.5rem" }}>
											<span
												style={{
													display: "inline-block",
													width: "8px",
													height: "8px",
													borderRadius: "50%",
													backgroundColor: u.verified ? "#22c55e" : "#d1d5db",
												}}
												title={u.verified ? "Verified" : "Not verified"}
											/>
										</td>
										<td style={{ padding: "0.75rem 0.5rem" }}>
											{u.rating != null
												? `${u.rating.toFixed(1)} (${u.totalReviews || 0})`
												: "N/A"}
										</td>
										<td style={{ padding: "0.75rem 0.5rem" }}>
											{formatDate(u.createdAt)}
										</td>
										<td style={{ padding: "0.75rem 0.5rem" }}>
											<UserActions
												userId={u.id}
												verified={u.verified || false}
												role={u.role || "user"}
											/>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</Gutter>
		</DefaultTemplate>
	);
}

export default UserManagement;
