"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Routes that bring their own bare shell: the rider's token page has no header, footer or category bar. */
const BARE_PREFIXES = ["/r/"] as const;

export function SiteChrome({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	if (BARE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
	return <>{children}</>;
}
