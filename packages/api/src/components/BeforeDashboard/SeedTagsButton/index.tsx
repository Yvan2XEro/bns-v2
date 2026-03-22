"use client";

import { toast } from "@payloadcms/ui";
import type React from "react";
import { Fragment, useCallback, useState } from "react";

export const SeedTagsButton: React.FC = () => {
	const [loading, setLoading] = useState(false);
	const [seeded, setSeeded] = useState(false);
	const [error, setError] = useState<null | string>(null);

	const handleClick = useCallback(
		async (e: React.MouseEvent<HTMLButtonElement>) => {
			e.preventDefault();

			if (seeded) {
				toast.info("Tags already seeded.");
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
						fetch("/api/seed-tags", {
							method: "POST",
							credentials: "include",
						})
							.then((res) => {
								if (res.ok) {
									resolve(true);
									setSeeded(true);
								} else {
									reject("An error occurred while seeding tags.");
								}
							})
							.catch((err) => {
								reject(err);
							});
					}),
					{
						loading: "Seeding tags...",
						success: "Tags seeded successfully!",
						error: "An error occurred while seeding tags.",
					},
				);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				setError(errorMsg);
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
				Seed tags
			</button>
			{message}
		</Fragment>
	);
};
