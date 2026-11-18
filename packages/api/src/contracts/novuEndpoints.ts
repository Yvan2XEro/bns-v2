/**
 * Where the apps reach Novu — Novu Cloud or a self-hosted instance — read
 * once from the environment, so the API, the website and the app agree.
 *
 * - `NOVU_APPLICATION_IDENTIFIER`: the environment's application id;
 * - `NOVU_API_URL`: Novu's API, e.g. `https://novu-api.example.com`;
 * - `NOVU_SOCKET_URL`: its WebSocket service, e.g. `https://novu-ws.example.com`.
 *
 * Unset (or Novu Cloud's own address), a URL stays `null` and Novu's SDKs use
 * their default — Novu Cloud — so nothing changes for a Cloud setup.
 */

export const NOVU_CLOUD_API_URL = "https://api.novu.co";

export interface NovuEndpoints {
	applicationIdentifier: string;
	/** Novu's API for the inbox SDKs (`backendUrl`); null: Novu Cloud. */
	apiUrl: string | null;
	/** Novu's WebSocket service (`socketUrl`); null: Novu Cloud. */
	socketUrl: string | null;
}

const HTTP = ["https:", "http:"];
/** Novu's socket client takes a WebSocket address as well as an http one. */
const SOCKET = ["https:", "http:", "wss:", "ws:"];

/** A URL in one of `protocols`, without its trailing slash, or null. */
function serviceUrl(
	raw: string | undefined,
	protocols: readonly string[],
): string | null {
	const value = raw?.trim().replace(/\/+$/, "");
	if (!value) return null;
	try {
		return protocols.includes(new URL(value).protocol) ? value : null;
	} catch {
		return null;
	}
}

/** The API's own Novu address, for the server SDK (`serverURL`). */
export function novuApiUrl(env: Record<string, string | undefined>) {
	return serviceUrl(env.NOVU_API_URL, HTTP);
}

/** What the inbox clients need; null when notifications are not set up. */
export function novuEndpoints(
	env: Record<string, string | undefined>,
): NovuEndpoints | null {
	const applicationIdentifier = env.NOVU_APPLICATION_IDENTIFIER?.trim();
	if (!applicationIdentifier) return null;
	const apiUrl = novuApiUrl(env);
	return {
		applicationIdentifier,
		apiUrl: apiUrl === NOVU_CLOUD_API_URL ? null : apiUrl,
		socketUrl: serviceUrl(env.NOVU_SOCKET_URL, SOCKET),
	};
}
