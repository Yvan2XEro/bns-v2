import { redirect } from "next/navigation";

/**
 * A conversation by path, as notifications and the app name it: the inbox
 * selects a conversation with `?conversation=`.
 */
export default async function ConversationLink({
	params,
}: {
	params: Promise<{ conversationId: string }>;
}) {
	const { conversationId } = await params;
	redirect(`/messages?conversation=${encodeURIComponent(conversationId)}`);
}
