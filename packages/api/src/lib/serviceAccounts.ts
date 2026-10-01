/**
 * The chat-service account is the one caller allowed to name a sender other
 * than itself: it persists websocket messages on a user's behalf. Matched on
 * `CHAT_SERVICE_EMAIL` rather than on a role, because the account is
 * provisioned outside this repository and giving it `admin` to satisfy an
 * access rule would hand a socket gateway the whole panel.
 *
 * An unset `CHAT_SERVICE_EMAIL` matches nobody, so a misconfigured deployment
 * fails closed: websocket messages stop persisting rather than every REST
 * caller gaining the right to forge a sender.
 */
export function isChatServiceAccount(
	user: { email?: string | null } | null | undefined,
): boolean {
	const expected = process.env.CHAT_SERVICE_EMAIL;
	if (!expected) return false;
	return typeof user?.email === "string" && user.email === expected;
}
