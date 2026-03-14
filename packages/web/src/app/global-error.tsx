"use client";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					fontFamily:
						'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
					backgroundColor: "#F8FAFC",
					color: "#0F172A",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					minHeight: "100vh",
				}}
			>
				<div style={{ textAlign: "center", padding: "2rem" }}>
					<div
						style={{
							width: "64px",
							height: "64px",
							borderRadius: "50%",
							backgroundColor: "#FEF3C7",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							margin: "0 auto 1rem",
							fontSize: "2rem",
						}}
					>
						!
					</div>
					<h1
						style={{
							fontSize: "1.5rem",
							fontWeight: 700,
							margin: "0 0 0.5rem",
						}}
					>
						Something went wrong
					</h1>
					<p
						style={{ color: "#64748B", margin: "0 0 2rem", maxWidth: "400px" }}
					>
						A critical error occurred. Please try again.
					</p>
					{error.digest && (
						<p
							style={{
								color: "#94A3B8",
								fontSize: "0.75rem",
								fontFamily: "monospace",
								margin: "0 0 1rem",
							}}
						>
							Error ID: {error.digest}
						</p>
					)}
					<div
						style={{ display: "flex", gap: "1rem", justifyContent: "center" }}
					>
						<button
							type="button"
							onClick={reset}
							style={{
								backgroundColor: "#1E40AF",
								color: "white",
								border: "none",
								borderRadius: "0.75rem",
								padding: "0.625rem 1.25rem",
								fontSize: "0.875rem",
								fontWeight: 500,
								cursor: "pointer",
							}}
						>
							Try again
						</button>
						<a
							href="/"
							style={{
								backgroundColor: "white",
								color: "#0F172A",
								border: "1px solid #E2E8F0",
								borderRadius: "0.75rem",
								padding: "0.625rem 1.25rem",
								fontSize: "0.875rem",
								fontWeight: 500,
								textDecoration: "none",
								display: "inline-block",
							}}
						>
							Back to home
						</a>
					</div>
				</div>
			</body>
		</html>
	);
}
