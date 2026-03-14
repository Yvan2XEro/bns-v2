"use client";

import { Ban, ShieldOff } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import { blockUser, unblockUser } from "~/lib/actions";

interface BlockUserButtonProps {
	userId: string;
	initialBlocked: boolean;
	onBlockChange?: (blocked: boolean) => void;
	variant?: "icon" | "full";
}

export function BlockUserButton({
	userId,
	initialBlocked,
	onBlockChange,
	variant = "icon",
}: BlockUserButtonProps) {
	const [isBlocked, setIsBlocked] = useState(initialBlocked);
	const [isPending, startTransition] = useTransition();

	const handleToggle = useCallback(() => {
		startTransition(async () => {
			if (isBlocked) {
				const result = await unblockUser(userId);
				if (result.success) {
					setIsBlocked(false);
					onBlockChange?.(false);
				}
			} else {
				const result = await blockUser(userId);
				if (result.success) {
					setIsBlocked(true);
					onBlockChange?.(true);
				}
			}
		});
	}, [isBlocked, userId, onBlockChange]);

	if (variant === "full") {
		return (
			<Button
				variant={isBlocked ? "outline" : "destructive"}
				size="sm"
				onClick={handleToggle}
				disabled={isPending}
				className={isBlocked ? "border-[#E2E8F0] text-[#64748B]" : ""}
			>
				{isBlocked ? (
					<>
						<ShieldOff className="mr-2 h-4 w-4" />
						{isPending ? "Unblocking..." : "Unblock user"}
					</>
				) : (
					<>
						<Ban className="mr-2 h-4 w-4" />
						{isPending ? "Blocking..." : "Block user"}
					</>
				)}
			</Button>
		);
	}

	return (
		<button
			type="button"
			onClick={handleToggle}
			disabled={isPending}
			className="rounded-lg p-1.5 text-[#94A3B8] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
			title={isBlocked ? "Unblock user" : "Block user"}
		>
			{isBlocked ? (
				<ShieldOff className="h-4 w-4" />
			) : (
				<Ban className="h-4 w-4" />
			)}
		</button>
	);
}
