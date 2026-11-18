import type { Payload } from "payload";
import { withTransaction } from "../lib/transactions";
import { recordRiskSignal } from "./risk";

const BATCH_SIZE = 200;
const severityScore = { low: 25, medium: 50, high: 75 } as const;

export async function consumeRiskSignalOutbox(
	payload: Payload,
): Promise<{ consumed: number }> {
	const pending = await payload.find({
		collection: "risk-signal-outbox",
		where: { consumedAt: { equals: null } },
		sort: ["occurredAt", "id"],
		limit: BATCH_SIZE,
		depth: 0,
		overrideAccess: true,
	});
	let consumed = 0;
	for (const item of pending.docs) {
		const didConsume = await withTransaction(payload, async (req) => {
			const current = await payload.findByID({
				collection: "risk-signal-outbox",
				id: String(item.id),
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (current.consumedAt) return false;

			const flag = await recordRiskSignal(
				payload,
				{
					subjectType: current.subjectType,
					subjectId: current.subjectId,
					signal: current.signal,
					scoreOverride: severityScore[current.severity],
					evidence: {
						outboxId: String(current.id),
						sourceType: current.sourceType,
						sourceId: current.sourceId,
					},
				},
				new Date(current.occurredAt),
				req,
			);
			if (!flag) return false;

			await payload.update({
				collection: "risk-signal-outbox",
				id: String(current.id),
				overrideAccess: true,
				req,
				data: { consumedAt: new Date().toISOString() },
			});
			return true;
		});
		if (didConsume) consumed += 1;
	}
	return { consumed };
}
