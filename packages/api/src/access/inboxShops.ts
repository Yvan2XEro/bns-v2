import type { PayloadRequest } from "payload";
import { memberShopIds } from "./shopRoles";

export const INBOX_SHOPS_CACHE = "inboxShopIds";

/**
 * The shops whose inbox the caller may read and answer. Cached on
 * `req.context` because `Conversations.access.read` and
 * `Messages.access.read` both ask for it inside one request, and
 * `memberShopIds` already caches the membership rows underneath.
 */
export async function inboxShopIds(req: PayloadRequest): Promise<string[]> {
	req.context ??= {};
	const context = req.context as Record<string, unknown>;
	const cached = context[INBOX_SHOPS_CACHE] as string[] | undefined;
	if (cached) return cached;
	const ids = await memberShopIds(req, { permission: "inbox.reply" });
	context[INBOX_SHOPS_CACHE] = ids;
	return ids;
}
