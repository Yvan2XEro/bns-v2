import { redirect } from "next/navigation";

/**
 * A shop conversation by path, as the shop's notifications name it: the
 * inbox selects a conversation with `?conversation=`.
 */
export default async function ShopConversationLink({
	params,
}: {
	params: Promise<{ conversationId: string }>;
}) {
	const { conversationId } = await params;
	redirect(
		`/seller/messages?conversation=${encodeURIComponent(conversationId)}`,
	);
}
