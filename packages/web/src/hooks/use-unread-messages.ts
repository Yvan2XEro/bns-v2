"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const POLL_INTERVAL = 30_000; // 30 seconds

export function useUnreadMessages(enabled: boolean) {
	const [count, setCount] = useState(0);

	const fetchCount = useCallback(async () => {
		try {
			const res = await fetch(`${API_URL}/api/public/messages/unread`, {
				credentials: "include",
			});
			if (res.ok) {
				const data = await res.json();
				setCount(data.count ?? 0);
			}
		} catch {
			// silently ignore
		}
	}, []);

	useEffect(() => {
		if (!enabled) return;

		fetchCount();
		const interval = setInterval(fetchCount, POLL_INTERVAL);
		return () => clearInterval(interval);
	}, [enabled, fetchCount]);

	return count;
}
