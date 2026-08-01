import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlockedUser {
	id: string;
	blocked: { id: string } | string;
	blocker: string;
	createdAt: string;
}

export interface BlockedUsersResponse {
	docs: BlockedUser[];
	totalDocs: number;
}

function getBlockedId(entry: BlockedUser): string | undefined {
	return typeof entry.blocked === "string" ? entry.blocked : entry.blocked?.id;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * The users the current account has blocked. `blocked-users` is already scoped
 * server-side to `blocker == req.user`, so this never leaks other people's
 * block lists.
 */
export function useBlockedUsers() {
	const { user, isLoading } = useAuth();

	return useQuery({
		queryKey: ["blocked-users"],
		queryFn: () =>
			api.get<BlockedUsersResponse>("/api/blocked-users?limit=200&depth=0"),
		enabled: !!user && !isLoading,
	});
}

/**
 * Whether `userId` is blocked, plus the block document id needed to undo it.
 */
export function useIsBlocked(userId: string | undefined): {
	isBlocked: boolean;
	blockId: string | undefined;
} {
	const { data } = useBlockedUsers();

	if (!userId || !data?.docs) {
		return { isBlocked: false, blockId: undefined };
	}

	const entry = data.docs.find((doc) => getBlockedId(doc) === userId);
	return { isBlocked: Boolean(entry), blockId: entry?.id };
}

/**
 * Block / unblock a user. Blocking is enforced server-side (a `messages`
 * beforeChange hook rejects sends in either direction), so this is not merely a
 * client-side filter.
 */
export function useToggleBlock() {
	const queryClient = useQueryClient();

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: ["blocked-users"] });
		void queryClient.invalidateQueries({ queryKey: ["conversations"] });
	};

	const block = useMutation({
		mutationFn: (userId: string) =>
			api.post<BlockedUser>("/api/blocked-users", { blocked: userId }),
		onSuccess: invalidate,
	});

	const unblock = useMutation({
		mutationFn: (blockId: string) =>
			api.delete<unknown>(`/api/blocked-users/${blockId}`),
		onSuccess: invalidate,
	});

	return { block, unblock, isPending: block.isPending || unblock.isPending };
}
