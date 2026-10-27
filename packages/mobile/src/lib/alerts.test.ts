import { describe, expect, mock, test } from "bun:test";
import { type AlertRequest, createAlerts } from "./alerts";

/** A sheet the test answers: the button index pressed, or null (dismissed). */
function sheet(answer: number | null) {
	const shown: AlertRequest[] = [];
	const present = mock(async (request: AlertRequest) => {
		shown.push(request);
		return answer;
	});
	const hide = mock(() => {});
	return { shown, alerts: createAlerts(present, hide, (key) => key), hide };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("confirm", () => {
	test("is true on the confirm button, false on cancel or dismissal", async () => {
		expect(await sheet(1).alerts.confirm("Delete?")).toBe(true);
		expect(await sheet(0).alerts.confirm("Delete?")).toBe(false);
		expect(await sheet(null).alerts.confirm("Delete?")).toBe(false);
	});

	test("names its buttons, cancel first, destructive when asked", async () => {
		const { alerts, shown } = sheet(1);
		await alerts.confirm("Delete?", "Gone for good", {
			confirmText: "Delete",
			destructive: true,
		});
		expect(shown[0]).toEqual({
			type: "confirm",
			title: "Delete?",
			message: "Gone for good",
			buttons: [
				{ text: "common.cancel", style: "cancel" },
				{ text: "Delete", style: "destructive" },
			],
		});
	});
});

describe("the callback API", () => {
	test("showConfirm runs onConfirm, or onCancel — a dismissal included", async () => {
		for (const [answer, confirmed] of [
			[1, true],
			[0, false],
			[null, false],
		] as const) {
			const onConfirm = mock(() => {});
			const onCancel = mock(() => {});
			sheet(answer).alerts.showConfirm("Leave?", "", onConfirm, onCancel);
			await tick();
			expect(onConfirm).toHaveBeenCalledTimes(confirmed ? 1 : 0);
			expect(onCancel).toHaveBeenCalledTimes(confirmed ? 0 : 1);
		}
	});

	test("showAlert runs the pressed button's onPress, none on dismissal", async () => {
		const retry = mock(() => {});
		const buttons = [{ text: "Later" }, { text: "Retry", onPress: retry }];
		sheet(1).alerts.showAlert("Failed", undefined, buttons, "error");
		await tick();
		expect(retry).toHaveBeenCalledTimes(1);
		sheet(null).alerts.showAlert("Failed", undefined, buttons, "error");
		await tick();
		expect(retry).toHaveBeenCalledTimes(1);
	});

	test("showError shows one OK button", async () => {
		const { alerts, shown } = sheet(0);
		alerts.showError("Oops", "Try again");
		expect(shown[0]).toEqual({
			type: "error",
			title: "Oops",
			message: "Try again",
			buttons: [{ text: "common.ok" }],
		});
	});
});
