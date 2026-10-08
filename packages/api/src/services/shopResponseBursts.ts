export type ResponseBurstMessage = {
	conversationId: string;
	senderSide: "buyer" | "shop";
	createdAt: string;
};

export type ResponseBuckets = {
	m5: number;
	m15: number;
	h1: number;
	h4: number;
	h24: number;
	over24h: number;
	unanswered: number;
};

const SILENCE_MS = 12 * 60 * 60 * 1000;
const RESPONSE_DEADLINE_MS = 24 * 60 * 60 * 1000;

function doualaDate(timestamp: number): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Douala",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(timestamp);
}

function emptyBuckets(): ResponseBuckets {
	return { m5: 0, m15: 0, h1: 0, h4: 0, h24: 0, over24h: 0, unanswered: 0 };
}

export function aggregateResponseBuckets(
	messages: readonly ResponseBurstMessage[],
	date: string,
	now: Date,
): ResponseBuckets {
	const byConversation = new Map<
		string,
		Array<{ side: "buyer" | "shop"; at: number }>
	>();
	for (const message of messages) {
		const at = Date.parse(message.createdAt);
		if (!Number.isFinite(at)) continue;
		const conversation = byConversation.get(message.conversationId) ?? [];
		conversation.push({ side: message.senderSide, at });
		byConversation.set(message.conversationId, conversation);
	}

	const result = emptyBuckets();
	for (const conversation of byConversation.values()) {
		conversation.sort((left, right) => left.at - right.at);
		let previousAt: number | undefined;
		const bursts: number[] = [];
		for (const message of conversation) {
			if (
				message.side === "buyer" &&
				(previousAt === undefined || message.at - previousAt >= SILENCE_MS)
			) {
				bursts.push(message.at);
			}
			previousAt = message.at;
		}

		for (let index = 0; index < bursts.length; index++) {
			const startedAt = bursts[index];
			if (startedAt === undefined || doualaDate(startedAt) !== date) continue;
			const nextBurstAt = bursts[index + 1] ?? Number.POSITIVE_INFINITY;
			const deadline = startedAt + RESPONSE_DEADLINE_MS;
			const response = conversation.find(
				(message) =>
					message.side === "shop" &&
					message.at > startedAt &&
					message.at < nextBurstAt,
			);
			if (!response) {
				if (now.getTime() >= deadline) result.unanswered++;
				continue;
			}
			const elapsed = response.at - startedAt;
			if (elapsed > RESPONSE_DEADLINE_MS) result.over24h++;
			else if (elapsed <= 5 * 60_000) result.m5++;
			else if (elapsed <= 15 * 60_000) result.m15++;
			else if (elapsed <= 60 * 60_000) result.h1++;
			else if (elapsed <= 4 * 60 * 60_000) result.h4++;
			else result.h24++;
		}
	}
	return result;
}
