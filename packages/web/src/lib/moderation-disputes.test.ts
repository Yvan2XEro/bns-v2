import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import { DISPUTE_REASON_LABELS, DISPUTE_STATUS_LABELS } from "./case-status";
import {
	assigneeView,
	deadlineTone,
	QUEUE_COLUMNS,
	queueQuery,
} from "./moderation-disputes";

describe("queueQuery", () => {
	test("sends only the filters that are set, overdue as text", () => {
		expect(queueQuery({})).toBe("");
		expect(
			queueQuery({ status: "under_review", overdue: true, assigned: "me" }),
		).toBe("?status=under_review&overdue=true&assigned=me");
		expect(queueQuery({ overdue: false })).toBe("?overdue=false");
	});
});

describe("deadlineTone", () => {
	test("red only when the server says overdue", () => {
		expect(
			deadlineTone({ deadline: "2026-10-01T00:00:00Z", overdue: true }),
		).toBe("overdue");
		expect(
			deadlineTone({ deadline: "2999-10-01T00:00:00Z", overdue: false }),
		).toBe("normal");
		expect(deadlineTone({ deadline: null, overdue: false })).toBe("none");
	});
});

describe("assigneeView", () => {
	test("names the three states", () => {
		expect(assigneeView(null, "m1")).toBe("unassigned");
		expect(assigneeView("m1", "m1")).toBe("me");
		expect(assigneeView("m2", "m1")).toBe("other");
	});
});

describe("queue vocabulary", () => {
	test("the eight columns of the plan, each with a heading in both languages", () => {
		expect([...QUEUE_COLUMNS]).toEqual([
			"number",
			"reason",
			"paymentMethod",
			"amount",
			"status",
			"deadline",
			"assignee",
			"age",
		]);
		for (const messages of [en, fr])
			for (const column of QUEUE_COLUMNS)
				expect(messages.ModerationDisputes.col[column]).toBeString();
	});
	test("every reason and status label the table uses resolves in both Disputes namespaces", () => {
		for (const messages of [en, fr]) {
			for (const key of [
				...Object.values(DISPUTE_REASON_LABELS),
				...Object.values(DISPUTE_STATUS_LABELS),
			]) {
				const [group, leaf] = key.split(".");
				const table = messages.Disputes as unknown as Record<
					string,
					Record<string, string>
				>;
				expect(table[group]?.[leaf]).toBeString();
			}
		}
	});
	test("both payment methods, assignee states and guard codes are translated", () => {
		for (const m of [en, fr].map((x) => x.ModerationDisputes)) {
			expect(Object.keys(m.payment).sort()).toEqual(["cod", "mobile_money"]);
			expect(Object.keys(m.assignee).sort()).toEqual([
				"me",
				"other",
				"unassigned",
			]);
			expect(Object.keys(m.guard).sort()).toEqual([
				"admin_required",
				"note_required",
				"override_required",
				"refund_invalid",
				"refund_out_of_bounds",
				"return_payer_required",
				"statement_required",
			]);
		}
	});
});
