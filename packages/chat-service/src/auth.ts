const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";

export type AuthPayload = {
	userId: string;
	email?: string;
};

export async function verifyToken(token: string): Promise<AuthPayload> {
	const response = await fetch(`${PAYLOAD_API_URL}/users/me`, {
		headers: {
			Authorization: `JWT ${token}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Payload auth failed: ${response.status}`);
	}

	const data = (await response.json()) as {
		user?: { id: number | string; email?: string };
	};

	if (!data.user?.id) {
		throw new Error("No user returned from Payload");
	}

	return {
		userId: String(data.user.id),
		email: data.user.email,
	};
}
