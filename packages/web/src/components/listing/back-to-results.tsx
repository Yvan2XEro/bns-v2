"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { lastSearchHref } from "~/lib/last-search";

/** Back to the results as they were — query, filters, city — not a bare /search. */
export function BackToResults({ label }: { label: string }) {
	const [href, setHref] = useState("/search");
	useEffect(() => setHref(lastSearchHref()), []);
	return (
		<Link href={href} className="flex items-center gap-1 hover:text-brand">
			<ArrowLeft aria-hidden className="h-4 w-4" />
			{label}
		</Link>
	);
}
