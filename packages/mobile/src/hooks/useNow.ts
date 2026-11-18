import { useEffect, useState } from "react";

/**
 * A clock that ticks, so a countdown and `availableActions(…, { now })` move
 * together: when a window closes on screen, its button goes with it.
 */
export function useNow(intervalMs = 60_000): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}
