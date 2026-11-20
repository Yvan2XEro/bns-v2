type Env = Readonly<Record<string, string | undefined>>;

export const CAMPAY_DEFAULT_BASE_URL = "https://www.campay.net";

/**
 * Credentials (a permanent token, or username and password) and the webhook
 * key: without the key no callback is accepted, so a half-configured CamPay
 * is not offered at all. Its own module so a test that stubs
 * `lib/payments` still has it.
 */
export function campayConfigured(env: Env = process.env): boolean {
	const credentials = Boolean(
		env.CAMPAY_PERMANENT_TOKEN || (env.CAMPAY_USERNAME && env.CAMPAY_PASSWORD),
	);
	return credentials && Boolean(env.CAMPAY_WEBHOOK_KEY);
}
