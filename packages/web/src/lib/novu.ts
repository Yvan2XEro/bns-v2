import {
	type NovuEndpoints,
	novuEndpoints,
} from "../../../api/src/contracts/novuEndpoints";

export type { NovuEndpoints };

/**
 * Where the inbox reaches Novu — Novu Cloud, or a self-hosted instance named
 * by NOVU_API_URL and NOVU_SOCKET_URL — read on the server, like the API
 * does; null when notifications are not set up.
 */
export function novuInbox(): NovuEndpoints | null {
	return novuEndpoints(process.env);
}
