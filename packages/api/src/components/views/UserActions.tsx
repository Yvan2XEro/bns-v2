"use client";

import { toast } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";

export const UserActions: React.FC<{
	userId: string;
	verified: boolean;
	role: string;
}> = ({ userId, verified, role }) => {
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	const toggleVerify = async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/users/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ verified: !verified }),
			});
			if (!res.ok) throw new Error("Failed to update verification status");
			toast.success(verified ? "User unverified" : "User verified");
			router.refresh();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update user");
		} finally {
			setLoading(false);
		}
	};

	const changeRole = async (newRole: string) => {
		setLoading(true);
		try {
			const res = await fetch(`/api/users/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role: newRole }),
			});
			if (!res.ok) throw new Error("Failed to change role");
			toast.success(`Role changed to ${newRole}`);
			router.refresh();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to change role");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
			<button
				type="button"
				onClick={toggleVerify}
				disabled={loading}
				style={{
					padding: "0.25rem 0.5rem",
					backgroundColor: verified ? "#f59e0b" : "#22c55e",
					color: "white",
					border: "none",
					borderRadius: "4px",
					cursor: loading ? "not-allowed" : "pointer",
					fontSize: "0.75rem",
					fontWeight: 500,
				}}
			>
				{verified ? "Unverify" : "Verify"}
			</button>
			{role !== "admin" && (
				<button
					type="button"
					onClick={() =>
						changeRole(role === "moderator" ? "user" : "moderator")
					}
					disabled={loading}
					style={{
						padding: "0.25rem 0.5rem",
						backgroundColor: role === "moderator" ? "#6b7280" : "#3b82f6",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: loading ? "not-allowed" : "pointer",
						fontSize: "0.75rem",
						fontWeight: 500,
					}}
				>
					{role === "moderator" ? "Demote to User" : "Make Moderator"}
				</button>
			)}
		</div>
	);
};

export default UserActions;
