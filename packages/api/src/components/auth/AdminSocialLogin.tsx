const providers = [
	{ label: "Google", value: "google" },
	{ label: "Apple", value: "apple" },
	{ label: "Facebook", value: "facebook" },
];

export default function AdminSocialLogin() {
	return (
		<div
			style={{
				border: "1px solid rgba(15, 23, 42, 0.08)",
				borderRadius: 16,
				display: "grid",
				gap: 12,
				marginBottom: 20,
				padding: 16,
			}}
		>
			<div style={{ display: "grid", gap: 4 }}>
				<strong style={{ color: "#0f172a", fontSize: 16 }}>
					Continue with a provider
				</strong>
				<p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
					OAuth is now available for admin accounts. Email / password remains
					available during the transition.
				</p>
			</div>

			<div style={{ display: "grid", gap: 8 }}>
				{providers.map((provider) => (
					<a
						href={`/api/public/auth/oauth/${provider.value}/start?audience=admin&redirectTo=/admin`}
						key={provider.value}
						style={{
							alignItems: "center",
							border: "1px solid #dbe4f0",
							borderRadius: 12,
							color: "#0f172a",
							display: "flex",
							fontSize: 14,
							fontWeight: 600,
							justifyContent: "center",
							minHeight: 44,
							textDecoration: "none",
						}}
					>
						Continue with {provider.label}
					</a>
				))}
			</div>
		</div>
	);
}
