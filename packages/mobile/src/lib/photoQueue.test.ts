import { describe, expect, test } from "bun:test";
import { makeMain, nextToUpload } from "./photoQueue";

describe("photo queue", () => {
	test("starts no more than the cap allows", () => {
		const waiting = [{ key: "a" }, { key: "b" }, { key: "c" }];
		expect(nextToUpload(waiting, 0).map((p) => p.key)).toEqual(["a", "b"]);
		expect(nextToUpload(waiting, 1).map((p) => p.key)).toEqual(["a"]);
		expect(nextToUpload(waiting, 2)).toEqual([]);
	});

	test("puts the chosen photo first and keeps the others in order", () => {
		expect(makeMain(["a", "b", "c"], 2)).toEqual(["c", "a", "b"]);
		expect(makeMain(["a", "b"], 0)).toEqual(["a", "b"]);
		expect(makeMain(["a"], 5)).toEqual(["a"]);
	});
});
