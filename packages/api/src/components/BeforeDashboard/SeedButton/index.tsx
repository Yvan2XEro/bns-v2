"use client";

import { toast } from "@payloadcms/ui";
import type React from "react";
import { Fragment, useCallback, useState } from "react";

export const SeedButton: React.FC = () => {
	const [loading, setLoading] = useState(false);
	const [seeded, setSeeded] = useState(false);
	const [error, setError] = useState<null | string>(null);

	const handleClick = useCallback(
		async (e: React.MouseEvent<HTMLButtonElement>) => {
			e.preventDefault();

			if (seeded) {
				toast.info("Categories already seeded.");
				return;
			}
			if (loading) {
				toast.info("Seeding already in progress.");
				return;
			}
			if (error) {
				toast.error("An error occurred, please refresh and try again.");
				return;
			}

			setLoading(true);

			try {
				toast.promise(
					new Promise((resolve, reject) => {
						fetch("/api/seed-categories", {
							method: "POST",
							credentials: "include",
						})
							.then((res) => {
								if (res.ok) {
									resolve(true);
									setSeeded(true);
								} else {
									reject("An error occurred while seeding categories.");
								}
							})
							.catch((err) => {
								reject(err);
							});
					}),
					{
						loading: "Seeding categories...",
						success: "Categories seeded successfully!",
						error: "An error occurred while seeding categories.",
					},
				);
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				setError(error);
			}
		},
		[loading, seeded, error],
	);

	let message = "";
	if (loading && !seeded) message = " (seeding...)";
	if (seeded) message = " (done!)";
	if (error) message = ` (error: ${error})`;

	return (
		<Fragment>
			<button
				type="button"
				onClick={handleClick}
				style={{
					appearance: "none",
					background: "none",
					border: "none",
					padding: 0,
					textDecoration: "underline",
					cursor: "pointer",
				}}
			>
				Seed categories
			</button>
			{message}
		</Fragment>
	);
};
