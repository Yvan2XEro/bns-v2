import {
	createLocalReq,
	generatePayloadCookie,
	getFieldsToSign,
	jwtSign,
	type Payload,
} from "payload";
import { addSessionToUser } from "payload/shared";
import type { User } from "@/payload-types";

export async function issuePayloadSession(
	payload: Payload,
	user: User,
): Promise<{ cookie: string; exp: number; token: string }> {
	const collectionConfig = payload.collections.users?.config;

	if (!collectionConfig?.auth) {
		throw new Error("Users collection auth config is not available");
	}

	const req = await createLocalReq({}, payload);
	const { sid } = await addSessionToUser({
		collectionConfig,
		payload,
		req,
		user,
	});

	const fieldsToSign = getFieldsToSign({
		collectionConfig,
		email: user.email,
		sid,
		user,
	});

	const { exp, token } = await jwtSign({
		fieldsToSign,
		secret: payload.secret,
		tokenExpiration: collectionConfig.auth.tokenExpiration,
	});

	const cookie = generatePayloadCookie({
		collectionAuthConfig: collectionConfig.auth,
		cookiePrefix: payload.config.cookiePrefix,
		token,
	});

	return { cookie, exp, token };
}
