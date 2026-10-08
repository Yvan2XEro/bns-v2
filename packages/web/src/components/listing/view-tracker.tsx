"use client";

import { useEffect, useRef } from "react";

export function ViewTracker({ listingId }: { listingId: string }) {
	const tracked = useRef(false);

	useEffect(() => {
		if (tracked.current) return;
		tracked.current = true;

		let installId: string | null = null;
		try {
			installId = window.localStorage.getItem("bns_iid");
			if (!installId) {
				installId = window.crypto.randomUUID();
				window.localStorage.setItem("bns_iid", installId);
			}
		} catch {
			// The API falls back to a keyed hash of the network address and agent.
		}

		fetch(`/api/public/listings/${listingId}/view`, {
			method: "POST",
			headers: installId ? { "X-BNS-Install-Id": installId } : undefined,
			credentials: "include",
		}).catch(() => {
			/* fire and forget */
		});
	}, [listingId]);

	return null;
}
