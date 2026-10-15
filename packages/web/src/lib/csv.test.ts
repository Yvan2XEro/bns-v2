import { describe, expect, test } from "bun:test";
import { toCsv } from "./csv";

describe("toCsv", () => {
	test("quotes cells holding a separator, a quote or a line break", () => {
		expect(
			toCsv(
				["a", "b"],
				[
					["x,y", 'say "hi"'],
					["line\nbreak", 3],
					[null, undefined],
				],
			),
		).toBe('﻿a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3\r\n,\r\n');
	});
});
