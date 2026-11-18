import { describe, expect, test } from "bun:test";
import { movedIndex, queueShortcut } from "./use-queue-shortcuts";

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
	key: k,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	...mods,
});

describe("queue shortcuts", () => {
	test("maps the console keys and ignores chords", () => {
		expect(queueShortcut(key("j"))).toBe("next");
		expect(queueShortcut(key("ArrowUp"))).toBe("previous");
		expect(queueShortcut(key("?"))).toBe("help");
		expect(queueShortcut(key("j", { ctrlKey: true }))).toBeNull();
		expect(queueShortcut(key("x"))).toBeNull();
	});

	test("moves within the list", () => {
		expect(movedIndex(-1, 3, 1)).toBe(0);
		expect(movedIndex(-1, 3, -1)).toBe(2);
		expect(movedIndex(2, 3, 1)).toBe(2);
		expect(movedIndex(0, 3, -1)).toBe(0);
		expect(movedIndex(0, 0, 1)).toBeNull();
	});
});
