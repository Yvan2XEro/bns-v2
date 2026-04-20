const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";

const SERVICE_EMAIL = process.env.CHAT_SERVICE_EMAIL || "";
const SERVICE_PASSWORD = process.env.CHAT_SERVICE_PASSWORD || "";

let _token: string | null = null;
let _expiresAt = 0;

export async function getServiceToken(): Promise<string> {
	// Reuse if still valid (5 min margin)
	if (_token && Date.now() < _expiresAt - 5 * 60 * 1000) {
		return _token;
	}

	if (!SERVICE_EMAIL || !SERVICE_PASSWORD) {
		throw new Error(
			"CHAT_SERVICE_EMAIL / CHAT_SERVICE_PASSWORD not configured",
		);
	}

	const res = await fetch(`${PAYLOAD_API_URL}/users/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: SERVICE_EMAIL, password: SERVICE_PASSWORD }),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Service login failed: ${res.status} ${text}`);
	}

	const data = (await res.json()) as { token: string; exp: number };

	_token = data.token;
	// Payload returns exp in seconds from epoch
	_expiresAt = data.exp ? data.exp * 1000 : Date.now() + 2 * 60 * 60 * 1000; // fallback: 2h

	return _token;
}

/** Invalidate cached token (e.g. on 401 from Payload) */
export function invalidateServiceToken(): void {
	_token = null;
	_expiresAt = 0;
}
