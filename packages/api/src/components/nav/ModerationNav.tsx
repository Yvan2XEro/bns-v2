"use client";

import { Link, NavGroup } from "@payloadcms/ui";
import { usePathname } from "next/navigation";

const links = [
	{
		href: "/admin/collections/listings?where[status][equals]=pending&sort=-createdAt",
		label: "Pending Listings",
		id: "nav-mod-pending",
	},
	{
		href: "/admin/collections/reports?where[status][equals]=pending&sort=-createdAt",
		label: "Pending Reports",
		id: "nav-mod-reports",
	},
	{
		href: "/admin/collections/users?sort=-createdAt",
		label: "Users",
		id: "nav-mod-users",
	},
];

export default function ModerationNav() {
	const pathname = usePathname();

	return (
		<NavGroup label="Moderation">
			{links.map((link) => {
				const basePath = link.href.split("?")[0];
				const isActive = pathname === basePath;
				const Label = (
					<>
						{isActive && <div className="nav__link-indicator" />}
						<span className="nav__link-label">{link.label}</span>
					</>
				);

				if (isActive) {
					return (
						<div key={link.id} className="nav__link" id={link.id}>
							{Label}
						</div>
					);
				}

				return (
					<Link
						key={link.id}
						className="nav__link"
						href={link.href}
						prefetch={false}
						id={link.id}
					>
						{Label}
					</Link>
				);
			})}
		</NavGroup>
	);
}
