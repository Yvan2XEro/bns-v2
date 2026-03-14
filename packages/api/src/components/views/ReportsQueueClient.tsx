"use client";

import { Banner, Button, Pill, ShimmerEffect } from "@payloadcms/ui";
import { useEffect, useState } from "react";

const REASON_LABELS: Record<string, string> = {
	spam: "Spam",
	inappropriate: "Inappropriate",
	fraud: "Fraud",
	prohibited: "Prohibited",
	harassment: "Harassment",
	other: "Other",
};

const TARGET_URLS: Record<string, string> = {
	listing: "/admin/collections/listings/",
	user: "/admin/collections/users/",
	message: "/admin/collections/messages/",
};

interface ReportDoc {
	id: string;
	reason: string;
	description?: string;
	targetType: string;
	targetId: string;
	reporter?: { name?: string; email: string } | string;
	createdAt: string;
}

export function ReportsQueueClient() {
	const [reports, setReports] = useState<ReportDoc[]>([]);
	const [loading, setLoading] = useState(true);
	const [resolveId, setResolveId] = useState<string | null>(null);
	const [resolution, setResolution] = useState("");
	const [acting, setActing] = useState(false);

	const fetchReports = () => {
		setLoading(true);
		fetch(
			"/api/reports?where[status][equals]=pending&sort=-createdAt&depth=1&limit=50",
		)
			.then((r) => r.json())
			.then((data) => setReports(data.docs || []))
			.catch(() => {})
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		fetchReports();
	}, [fetchReports]);

	const handleDismiss = async (id: string) => {
		setActing(true);
		try {
			await fetch(`/api/reports/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "reviewed", resolution: "Dismissed" }),
			});
			fetchReports();
		} catch {
			/* ignore */
		} finally {
			setActing(false);
		}
	};

	const handleResolve = async (id: string) => {
		if (!resolution.trim()) return;
		setActing(true);
		try {
			await fetch(`/api/reports/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "resolved", resolution }),
			});
			setResolveId(null);
			setResolution("");
			fetchReports();
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

	const severityStyle = (reason: string): "error" | "warning" =>
		reason === "fraud" || reason === "harassment" ? "error" : "warning";

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
				<h1 style={{ margin: 0 }}>Reports</h1>
				<Pill pillStyle="error">{reports.length} pending</Pill>
			</div>

			{reports.length === 0 ? (
				<Banner type="success">No pending reports.</Banner>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
					{reports.map((report) => {
						const reporter =
							typeof report.reporter === "object" ? report.reporter : null;
						const targetUrl = TARGET_URLS[report.targetType] || "#";

						return (
							<div
								key={report.id}
								style={{
									border: "1px solid var(--theme-elevation-150)",
									borderRadius: "var(--style-radius-s)",
									padding: "1rem",
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "0.5rem",
										marginBottom: "0.5rem",
									}}
								>
									<Pill pillStyle={severityStyle(report.reason)} size="small">
										{REASON_LABELS[report.reason] || report.reason}
									</Pill>
									<Pill pillStyle="light-gray" size="small">
										{report.targetType}
									</Pill>
									<a
										href={`${targetUrl}${report.targetId}`}
										style={{
											fontSize: "0.8125rem",
											color: "var(--theme-elevation-500)",
											textDecoration: "underline",
										}}
									>
										View {report.targetType}
									</a>
								</div>
								<div
									style={{
										fontSize: "0.8125rem",
										color: "var(--theme-elevation-500)",
										marginBottom: "0.5rem",
									}}
								>
									Reporter: {reporter?.name || reporter?.email || "Unknown"} ·{" "}
									{formatDate(report.createdAt)}
								</div>
								{report.description && (
									<div
										style={{
											fontSize: "0.8125rem",
											padding: "0.5rem",
											background: "var(--theme-elevation-50)",
											borderRadius: "var(--style-radius-s)",
											marginBottom: "0.75rem",
											color: "var(--theme-elevation-600)",
										}}
									>
										{report.description}
									</div>
								)}
								{resolveId === report.id ? (
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: "0.5rem",
										}}
									>
										<textarea
											value={resolution}
											onChange={(e) => setResolution(e.target.value)}
											placeholder="Describe the action taken..."
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
												buttonStyle="primary"
												size="small"
												onClick={() => handleResolve(report.id)}
												disabled={acting}
											>
												Confirm
											</Button>
											<Button
												buttonStyle="secondary"
												size="small"
												onClick={() => {
													setResolveId(null);
													setResolution("");
												}}
											>
												Cancel
											</Button>
										</div>
									</div>
								) : (
									<div style={{ display: "flex", gap: "0.5rem" }}>
										<Button
											buttonStyle="secondary"
											size="small"
											onClick={() => handleDismiss(report.id)}
											disabled={acting}
										>
											Dismiss
										</Button>
										<Button
											buttonStyle="primary"
											size="small"
											onClick={() => setResolveId(report.id)}
											disabled={acting}
										>
											Take Action
										</Button>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</>
	);
}
