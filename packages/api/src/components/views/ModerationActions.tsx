"use client";

import { toast } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";

export const ModerationActions: React.FC<{ listingId: string }> = ({
	listingId,
}) => {
	const router = useRouter();
	const [showReject, setShowReject] = useState(false);
	const [reason, setReason] = useState("");
	const [loading, setLoading] = useState(false);

	const handleApprove = async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/listings/${listingId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "published" }),
			});
			if (!res.ok) throw new Error("Failed to approve listing");
			toast.success("Listing approved");
			router.refresh();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to approve listing",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleReject = async () => {
		if (!reason.trim()) {
			toast.error("Please provide a rejection reason");
			return;
		}
		setLoading(true);
		try {
			const res = await fetch(`/api/listings/${listingId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
			});
			if (!res.ok) throw new Error("Failed to reject listing");
			toast.success("Listing rejected");
			router.refresh();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to reject listing",
			);
		} finally {
			setLoading(false);
			setShowReject(false);
			setReason("");
		}
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
			<div style={{ display: "flex", gap: "0.5rem" }}>
				<button
					type="button"
					onClick={handleApprove}
					disabled={loading}
					style={{
						padding: "0.375rem 0.75rem",
						backgroundColor: "#22c55e",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: loading ? "not-allowed" : "pointer",
						fontSize: "0.875rem",
						fontWeight: 500,
					}}
				>
					Approve
				</button>
				<button
					type="button"
					onClick={() => setShowReject(!showReject)}
					disabled={loading}
					style={{
						padding: "0.375rem 0.75rem",
						backgroundColor: "#ef4444",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: loading ? "not-allowed" : "pointer",
						fontSize: "0.875rem",
						fontWeight: 500,
					}}
				>
					Reject
				</button>
			</div>
			{showReject && (
				<div
					style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
				>
					<textarea
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder="Rejection reason..."
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
						onClick={handleReject}
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
						Confirm Rejection
					</button>
				</div>
			)}
		</div>
	);
};

export default ModerationActions;
