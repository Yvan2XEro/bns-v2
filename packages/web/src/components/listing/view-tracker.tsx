"use client";

import { useEffect, useRef } from "react";

export function ViewTracker({ listingId, currentViews }: { listingId: number; currentViews: number }) {
	const tracked = useRef(false);

	useEffect(() => {
		if (tracked.current) return;
		tracked.current = true;

		fetch(`/api/listings/${listingId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ views: currentViews + 1 }),
			credentials: "include",
		}).catch(() => {});
	}, [listingId, currentViews]);

	return null;
}
