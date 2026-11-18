import { LEGACY_TIMEZONE, localDateString } from "../lib/marketTime";
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

function emptyBuckets(): ResponseBuckets {
	return { m5: 0, m15: 0, h1: 0, h4: 0, h24: 0, over24h: 0, unanswered: 0 };
}

/**
 * Every buyer burst (a buyer message after 12 h of silence) and the shop's
 * first reply to it before the next burst; `respondedAt` is null while
 * unanswered. Both the nightly buckets and the live per-day medians read this.
 */
export function responseBursts(
	messages: readonly ResponseBurstMessage[],
): Array<{ startedAt: number; respondedAt: number | null }> {
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

	const result: Array<{ startedAt: number; respondedAt: number | null }> = [];
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
		bursts.forEach((startedAt, index) => {
			const nextBurstAt = bursts[index + 1] ?? Number.POSITIVE_INFINITY;
			const response = conversation.find(
				(message) =>
					message.side === "shop" &&
					message.at > startedAt &&
					message.at < nextBurstAt,
			);
			result.push({ startedAt, respondedAt: response?.at ?? null });
		});
	}
	return result;
}

export function aggregateResponseBuckets(
	messages: readonly ResponseBurstMessage[],
	date: string,
	now: Date,
	timezone: string = LEGACY_TIMEZONE,
): ResponseBuckets {
	const result = emptyBuckets();
	for (const { startedAt, respondedAt } of responseBursts(messages)) {
		if (localDateString(new Date(startedAt), timezone) !== date) continue;
		if (respondedAt === null) {
			if (now.getTime() >= startedAt + RESPONSE_DEADLINE_MS)
				result.unanswered++;
			continue;
		}
		const elapsed = respondedAt - startedAt;
		if (elapsed > RESPONSE_DEADLINE_MS) result.over24h++;
		else if (elapsed <= 5 * 60_000) result.m5++;
		else if (elapsed <= 15 * 60_000) result.m15++;
		else if (elapsed <= 60 * 60_000) result.h1++;
		else if (elapsed <= 4 * 60 * 60_000) result.h4++;
		else result.h24++;
	}
	return result;
}

/**
 * The median minutes to the shop's first reply, per local day the buyer's
 * burst started on; a day without an answered burst carries null.
 */
export function dailyResponseMedians(
	messages: readonly ResponseBurstMessage[],
	dates: readonly string[],
	timezone: string = LEGACY_TIMEZONE,
): Array<{ date: string; medianMinutes: number | null; answered: number }> {
	const byDate = new Map<string, number[]>(dates.map((date) => [date, []]));
	for (const { startedAt, respondedAt } of responseBursts(messages)) {
		if (respondedAt === null) continue;
		const minutes = byDate.get(localDateString(new Date(startedAt), timezone));
		minutes?.push((respondedAt - startedAt) / 60_000);
	}
	return dates.map((date) => {
		const minutes = (byDate.get(date) ?? []).sort((a, b) => a - b);
		const middle = Math.floor(minutes.length / 2);
		const median =
			minutes.length === 0
				? null
				: minutes.length % 2
					? (minutes[middle] ?? 0)
					: ((minutes[middle - 1] ?? 0) + (minutes[middle] ?? 0)) / 2;
		return {
			date,
			medianMinutes: median === null ? null : Math.round(median),
			answered: minutes.length,
		};
	});
}

/**
 * Reply delays in minutes for the bursts started at or after `since`, for the
 * public response time: a burst unanswered past the 24 h deadline is
 * `Infinity`, one still within it is left out.
 */
export function responseDelaysSince(
	messages: readonly ResponseBurstMessage[],
	since: Date,
	now: Date,
): number[] {
	const delays: number[] = [];
	for (const { startedAt, respondedAt } of responseBursts(messages)) {
		if (startedAt < since.getTime()) continue;
		if (respondedAt === null) {
			if (now.getTime() >= startedAt + RESPONSE_DEADLINE_MS)
				delays.push(Number.POSITIVE_INFINITY);
			continue;
		}
		delays.push((respondedAt - startedAt) / 60_000);
	}
	return delays;
}
