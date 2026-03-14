"use client";

import { Button, Pill, ShimmerEffect, toast } from "@payloadcms/ui";
import { useEffect, useState } from "react";

interface UserDoc {
	id: string;
	name?: string;
	email: string;
	role: string;
	verified?: boolean;
	rating?: number;
	totalReviews?: number;
	createdAt: string;
}

export function UserManagementClient() {
	const [users, setUsers] = useState<UserDoc[]>([]);
	const [loading, setLoading] = useState(true);
	const [acting, setActing] = useState<string | null>(null);

	const fetchUsers = () => {
		setLoading(true);
		fetch("/api/users?sort=-createdAt&limit=50&depth=0")
			.then((r) => r.json())
			.then((data) => setUsers(data.docs || []))
			.catch(() => {})
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		fetchUsers();
	}, [fetchUsers]);

	const patchUser = async (id: string, data: Record<string, unknown>) => {
		setActing(id);
		try {
			const res = await fetch(`/api/users/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});
			if (!res.ok) throw new Error("Failed");
			toast.success("User updated");
			fetchUsers();
		} catch {
			toast.error("Failed to update user");
		} finally {
			setActing(null);
		}
	};

	const formatDate = (date: string) =>
		new Date(date).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});

	const rolePillStyle = (role: string) => {
		if (role === "admin") return "error" as const;
		if (role === "moderator") return "warning" as const;
		return "light-gray" as const;
	};

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
				<h1 style={{ margin: 0 }}>Users</h1>
				<Pill pillStyle="light">{users.length} users</Pill>
			</div>

			<div style={{ overflowX: "auto" }}>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr
							style={{
								borderBottom: "2px solid var(--theme-elevation-150)",
								textAlign: "left",
							}}
						>
							{[
								"Name",
								"Email",
								"Role",
								"Verified",
								"Rating",
								"Joined",
								"Actions",
							].map((h) => (
								<th
									key={h}
									style={{
										padding: "0.75rem 0.5rem",
										fontSize: "0.75rem",
										fontWeight: 600,
										textTransform: "uppercase",
										letterSpacing: "0.05em",
										color: "var(--theme-elevation-500)",
									}}
								>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{users.map((u) => (
							<tr
								key={u.id}
								style={{ borderBottom: "1px solid var(--theme-elevation-100)" }}
							>
								<td style={{ padding: "0.75rem 0.5rem" }}>
									<a
										href={`/admin/collections/users/${u.id}`}
										style={{ color: "var(--theme-text)", fontWeight: 500 }}
									>
										{u.name || "—"}
									</a>
								</td>
								<td
									style={{
										padding: "0.75rem 0.5rem",
										color: "var(--theme-elevation-500)",
										fontSize: "0.8125rem",
									}}
								>
									{u.email}
								</td>
								<td style={{ padding: "0.75rem 0.5rem" }}>
									<Pill pillStyle={rolePillStyle(u.role)} size="small">
										{u.role}
									</Pill>
								</td>
								<td style={{ padding: "0.75rem 0.5rem" }}>
									<Pill
										pillStyle={u.verified ? "success" : "light-gray"}
										size="small"
									>
										{u.verified ? "Yes" : "No"}
									</Pill>
								</td>
								<td
									style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}
								>
									{u.rating != null
										? `${u.rating.toFixed(1)} (${u.totalReviews || 0})`
										: "—"}
								</td>
								<td
									style={{
										padding: "0.75rem 0.5rem",
										fontSize: "0.8125rem",
										color: "var(--theme-elevation-500)",
									}}
								>
									{formatDate(u.createdAt)}
								</td>
								<td style={{ padding: "0.75rem 0.5rem" }}>
									<div style={{ display: "flex", gap: "0.25rem" }}>
										<Button
											buttonStyle={u.verified ? "secondary" : "primary"}
											size="xsmall"
											onClick={() => patchUser(u.id, { verified: !u.verified })}
											disabled={acting === u.id}
										>
											{u.verified ? "Unverify" : "Verify"}
										</Button>
										{u.role !== "admin" && (
											<Button
												buttonStyle="secondary"
												size="xsmall"
												onClick={() =>
													patchUser(u.id, {
														role: u.role === "moderator" ? "user" : "moderator",
													})
												}
												disabled={acting === u.id}
											>
												{u.role === "moderator" ? "Demote" : "Mod"}
											</Button>
										)}
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}
