import type { Payload, PayloadRequest } from "payload";

/**
 * Whether the account has verified a phone number by SMS code. Read fresh
 * from the account rather than off a session, which can predate the code.
 */
export async function hasVerifiedPhone(
	payload: Payload,
	userId: string,
	req?: PayloadRequest,
): Promise<boolean> {
	const user = await payload
		.findByID({
			collection: "users",
			id: userId,
			depth: 0,
			overrideAccess: true,
			...(req ? { req } : {}),
		})
		.catch(() => null);
	return Boolean(user?.phoneVerifiedAt);
}
