export interface WireRequest {
	method: "GET" | "POST" | "PUT";
	path: string;
	query?: Record<string, string>;
	body?: unknown;
	idempotencyKey?: string;
}

export interface WireResponse {
	status: number;
	body: unknown;
}

export type NotchPayTransport = (request: WireRequest) => Promise<WireResponse>;

/** Timeout or network failure; the adapter maps it to ProviderUnavailableError(method). */
export class TransportFailure extends Error {}

export const DEFAULT_TIMEOUT_MS = 15_000;

export function liveTransport(config: {
	baseUrl: string;
	publicKey: string;
	privateKey: string;
	timeoutMs?: number;
}): NotchPayTransport {
	return async (request) => {
		const url = new URL(config.baseUrl.replace(/\/+$/, "") + request.path);
		for (const [key, value] of Object.entries(request.query ?? {})) {
			url.searchParams.set(key, value);
		}
		const headers: Record<string, string> = {
			Authorization: config.publicKey,
			"X-Grant": config.privateKey,
			"Content-Type": "application/json",
			Accept: "application/json",
		};
		if (request.idempotencyKey) {
			headers["Idempotency-Key"] = request.idempotencyKey;
		}
		let response: Response;
		try {
			response = await fetch(url, {
				method: request.method,
				headers,
				body:
					request.body === undefined ? undefined : JSON.stringify(request.body),
				signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
			});
		} catch (cause) {
			throw new TransportFailure(
				`NotchPay ${request.method} ${request.path} failed`,
				{ cause },
			);
		}
		const body: unknown = await response.json().catch(() => null);
		return { status: response.status, body };
	};
}
