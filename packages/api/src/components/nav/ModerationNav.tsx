"use client";

import { NavGroup } from "@payloadcms/ui";
import type React from "react";

const ModerationNav: React.FC = () => {
	return (
		<NavGroup label="Moderation">
			<a
				href="/admin/moderation"
				style={{
					display: "block",
					padding: "0.5rem 1rem 0.5rem 2rem",
					color: "var(--theme-text)",
					textDecoration: "none",
					fontSize: "0.875rem",
				}}
			>
				Listings Queue
			</a>
			<a
				href="/admin/reports-queue"
				style={{
					display: "block",
					padding: "0.5rem 1rem 0.5rem 2rem",
					color: "var(--theme-text)",
					textDecoration: "none",
					fontSize: "0.875rem",
				}}
			>
				Reports
			</a>
			<a
				href="/admin/users-management"
				style={{
					display: "block",
					padding: "0.5rem 1rem 0.5rem 2rem",
					color: "var(--theme-text)",
					textDecoration: "none",
					fontSize: "0.875rem",
				}}
			>
				Users
			</a>
		</NavGroup>
	);
};

export default ModerationNav;
