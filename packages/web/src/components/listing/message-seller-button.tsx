"use client";

import { Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { useStartConversation } from "~/hooks/use-shop-inbox";
import { resolveErrorMessage } from "~/lib/apiError";

interface MessageSellerButtonProps {
	listingId: string;
	signedIn: boolean;
}

function goToSignIn() {
	window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
}

/**
 * Posts to `/api/conversations/start`, which the server dedupes by
 * `(shop, buyer)` for a shop listing — so messaging two products of the same
 * shop lands in one thread, not two. Replaces the old find-or-create by
 * participants, which looked up any conversation with the seller regardless
 * of listing and otherwise posted arbitrary participants.
 */
export function MessageSellerButton({
	listingId,
	signedIn,
}: MessageSellerButtonProps) {
	const t = useTranslations("Listing");
	const tErrors = useTranslations();
	const router = useRouter();
	const start = useStartConversation();

	function onClick() {
		if (!signedIn) {
			goToSignIn();
			return;
		}
		start.mutate(listingId, {
			onSuccess: ({ conversationId }) => {
				router.push(`/messages?conversation=${conversationId}`);
			},
			onError: (error) => {
				if (error.status === 401) goToSignIn();
			},
		});
	}

	return (
		<div className="flex w-full flex-col gap-1">
			<Button
				className="w-full rounded-lg bg-[#1E40AF] hover:bg-[#1E3A8A]"
				onClick={onClick}
				disabled={start.isPending}
			>
				{start.isPending ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<MessageCircle className="mr-2 h-4 w-4" />
				)}
				{t("messageSeller")}
			</Button>
			{start.isError && start.error.status !== 401 && (
				<p className="text-center text-red-500 text-xs">
					{resolveErrorMessage(start.error, tErrors)}
				</p>
			)}
		</div>
	);
}
