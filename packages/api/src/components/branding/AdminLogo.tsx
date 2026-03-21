"use client";

export function Logo() {
	return (
		<div
			style={{
				alignItems: "center",
				display: "flex",
				gap: "0.75rem",
			}}
		>
			<img
				alt="Buy'N'Sellem"
				src="/logo.png"
				style={{
					borderRadius: "0.9rem",
					display: "block",
					height: "2.5rem",
					objectFit: "contain",
					width: "2.5rem",
				}}
			/>
			<span
				style={{
					color: "#0F172A",
					fontSize: "1.1rem",
					fontWeight: 700,
					letterSpacing: "-0.02em",
					lineHeight: 1,
					whiteSpace: "nowrap",
				}}
			>
				Buy<span style={{ color: "#F59E0B" }}>&apos;N&apos;</span>Sellem
			</span>
		</div>
	);
}

export function Icon() {
	return (
		<img
			alt="Buy'N'Sellem"
			src="/logo.png"
			style={{
				borderRadius: "0.75rem",
				display: "block",
				height: "2rem",
				objectFit: "contain",
				width: "2rem",
			}}
		/>
	);
}
