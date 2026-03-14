"use client";

import { toast } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";

export const ReportActions: React.FC<{ reportId: string }> = ({ reportId }) => {
	const router = useRouter();
	const [showResolve, setShowResolve] = useState(false);
	const [resolution, setResolution] = useState("");
	const [loading, setLoading] = useState(false);

	const handleDismiss = async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/reports/${reportId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					status: "reviewed",
					resolution: "Dismissed - no action required",
				}),
			});
			if (!res.ok) throw new Error("Failed to dismiss report");
			toast.success("Report dismissed");
			router.refresh();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to dismiss report",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleResolve = async () => {
		if (!resolution.trim()) {
			toast.error("Please describe the action taken");
			return;
		}
		setLoading(true);
		try {
			const res = await fetch(`/api/reports/${reportId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "resolved", resolution }),
			});
			if (!res.ok) throw new Error("Failed to resolve report");
			toast.success("Report resolved");
			router.refresh();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to resolve report",
			);
		} finally {
			setLoading(false);
			setShowResolve(false);
			setResolution("");
		}
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
			<div style={{ display: "flex", gap: "0.5rem" }}>
				<button
					type="button"
					onClick={handleDismiss}
					disabled={loading}
					style={{
						padding: "0.375rem 0.75rem",
						backgroundColor: "var(--theme-elevation-400)",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: loading ? "not-allowed" : "pointer",
						fontSize: "0.875rem",
						fontWeight: 500,
					}}
				>
					Dismiss
				</button>
				<button
					type="button"
					onClick={() => setShowResolve(!showResolve)}
					disabled={loading}
					style={{
						padding: "0.375rem 0.75rem",
						backgroundColor: "#f59e0b",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: loading ? "not-allowed" : "pointer",
						fontSize: "0.875rem",
						fontWeight: 500,
					}}
				>
					Take Action
				</button>
			</div>
			{showResolve && (
				<div
					style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
				>
					<textarea
						value={resolution}
						onChange={(e) => setResolution(e.target.value)}
						placeholder="Describe the action taken..."
						rows={3}
						style={{
							width: "100%",
							padding: "0.5rem",
							border: "1px solid var(--theme-elevation-300)",
							borderRadius: "4px",
							fontSize: "0.875rem",
							resize: "vertical",
							backgroundColor: "var(--theme-elevation-50)",
							color: "var(--theme-text)",
						}}
					/>
					<button
						type="button"
						onClick={handleResolve}
						disabled={loading}
						style={{
							padding: "0.375rem 0.75rem",
							backgroundColor: "#dc2626",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: loading ? "not-allowed" : "pointer",
							fontSize: "0.875rem",
							fontWeight: 500,
							alignSelf: "flex-start",
						}}
					>
						Confirm Resolution
					</button>
				</div>
			)}
		</div>
	);
};

export default ReportActions;
