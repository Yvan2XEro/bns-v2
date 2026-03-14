import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import type React from "react";
import { ReportActions } from "./ReportActions";

const REASON_LABELS: Record<string, string> = {
	spam: "Spam",
	inappropriate: "Inappropriate content",
	fraud: "Fraud",
	prohibited: "Prohibited item",
	harassment: "Harassment",
	other: "Other",
};

const TARGET_LABELS: Record<string, string> = {
	listing: "Listing",
	user: "User",
	message: "Message",
};

const TARGET_URLS: Record<string, string> = {
	listing: "/admin/collections/listings/",
	user: "/admin/collections/users/",
	message: "/admin/collections/messages/",
};

const ReportsQueue: React.FC<AdminViewServerProps> = async ({
	initPageResult,
}) => {
	const { req, permissions } = initPageResult;
	const { payload, user } = req;

	const pendingReports = await payload.find({
		collection: "reports",
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
					Reports Queue ({pendingReports.totalDocs} pending)
				</h1>

				{pendingReports.docs.length === 0 ? (
					<div
						style={{
							padding: "2rem",
							textAlign: "center",
							color: "var(--theme-elevation-500)",
							border: "1px solid var(--theme-elevation-200)",
							borderRadius: "4px",
						}}
					>
						<p>No pending reports to review.</p>
					</div>
				) : (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "1rem",
						}}
					>
						{pendingReports.docs.map((report: any) => {
							const reporter =
								typeof report.reporter === "object" ? report.reporter : null;
							const targetUrl = TARGET_URLS[report.targetType] || "#";

							return (
								<div
									key={report.id}
									style={{
										border: "1px solid var(--theme-elevation-200)",
										borderRadius: "4px",
										padding: "1rem",
										backgroundColor: "var(--theme-elevation-50)",
									}}
								>
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
												<span
													style={{
														display: "inline-block",
														padding: "0.125rem 0.5rem",
														backgroundColor:
															report.reason === "fraud" ||
															report.reason === "harassment"
																? "#fecaca"
																: "#fef3c7",
														color:
															report.reason === "fraud" ||
															report.reason === "harassment"
																? "#991b1b"
																: "#92400e",
														borderRadius: "9999px",
														fontSize: "0.75rem",
														fontWeight: 600,
														marginRight: "0.5rem",
													}}
												>
													{REASON_LABELS[report.reason] || report.reason}
												</span>
												<span
													style={{
														display: "inline-block",
														padding: "0.125rem 0.5rem",
														backgroundColor: "var(--theme-elevation-200)",
														borderRadius: "9999px",
														fontSize: "0.75rem",
														fontWeight: 500,
													}}
												>
													{TARGET_LABELS[report.targetType] ||
														report.targetType}
												</span>
											</h3>
											<div
												style={{
													fontSize: "0.875rem",
													color: "var(--theme-elevation-500)",
													marginTop: "0.375rem",
												}}
											>
												<span>
													Reporter:{" "}
													{reporter?.name || reporter?.email || "Unknown"}
												</span>
												{" | "}
												<span>Reported: {formatDate(report.createdAt)}</span>
												{" | "}
												<a
													href={`${targetUrl}${report.targetId}`}
													style={{
														color: "var(--theme-success-500)",
														textDecoration: "underline",
													}}
												>
													View reported {report.targetType}
												</a>
											</div>
										</div>
									</div>
									{report.description && (
										<p
											style={{
												fontSize: "0.875rem",
												color: "var(--theme-elevation-600)",
												margin: "0.5rem 0",
												padding: "0.5rem",
												backgroundColor: "var(--theme-elevation-100)",
												borderRadius: "4px",
											}}
										>
											{report.description}
										</p>
									)}
									<ReportActions reportId={report.id} />
								</div>
							);
						})}
					</div>
				)}
			</Gutter>
		</DefaultTemplate>
	);
};

export default ReportsQueue;
