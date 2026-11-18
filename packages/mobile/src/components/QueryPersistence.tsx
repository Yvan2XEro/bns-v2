import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/src/lib/auth";
import {
	persistQueryCache,
	restoreQueryCache,
} from "@/src/lib/queryPersistence";

/**
 * Restores the last session's lists once the account is known, then keeps the
 * snapshot current. Another account on the same phone starts from nothing.
 */
export function QueryPersistence() {
	const queryClient = useQueryClient();
	const { user, isLoading } = useAuth();
	const userId = user?.id ? String(user.id) : null;

	useEffect(() => {
		if (isLoading) return;
		let cancelled = false;
		let stop = () => {};
		void restoreQueryCache(queryClient, userId).then(() => {
			if (!cancelled) stop = persistQueryCache(queryClient, userId);
		});
		return () => {
			cancelled = true;
			stop();
		};
	}, [queryClient, userId, isLoading]);

	return null;
}
