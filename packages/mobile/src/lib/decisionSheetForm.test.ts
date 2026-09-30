import { describe, expect, it } from "bun:test";
import {
	buildDecisionSchema,
	decisionSheetDefaults,
} from "./decisionSheetForm";

describe("buildDecisionSchema", () => {
	it("requires a choice when the action offers one", () => {
		const schema = buildDecisionSchema({
			needsChoice: true,
			needsDuration: false,
			singleDuration: false,
			textRequired: false,
		});
		expect(
			schema.safeParse({ choice: null, duration: null, text: "" }).success,
		).toBe(false);
		expect(
			schema.safeParse({ choice: "fraud", duration: null, text: "" }).success,
		).toBe(true);
	});

	it("requires an explicit duration when there is more than one option", () => {
		const schema = buildDecisionSchema({
			needsChoice: false,
			needsDuration: true,
			singleDuration: false,
			textRequired: false,
		});
		expect(
			schema.safeParse({ choice: null, duration: null, text: "" }).success,
		).toBe(false);
		expect(
			schema.safeParse({ choice: null, duration: 7, text: "" }).success,
		).toBe(true);
	});

	it("does not require touching a single duration option", () => {
		const schema = buildDecisionSchema({
			needsChoice: false,
			needsDuration: true,
			singleDuration: true,
			textRequired: false,
		});
		expect(
			schema.safeParse({ choice: null, duration: 30, text: "" }).success,
		).toBe(true);
	});

	it("requires non-empty text when the action needs a reason message", () => {
		const schema = buildDecisionSchema({
			needsChoice: false,
			needsDuration: false,
			singleDuration: false,
			textRequired: true,
		});
		expect(
			schema.safeParse({ choice: null, duration: null, text: "   " }).success,
		).toBe(false);
		expect(
			schema.safeParse({ choice: null, duration: null, text: "ok" }).success,
		).toBe(true);
	});

	it("is satisfied with nothing filled in when the action needs none of it", () => {
		const schema = buildDecisionSchema({
			needsChoice: false,
			needsDuration: false,
			singleDuration: false,
			textRequired: false,
		});
		expect(
			schema.safeParse({ choice: null, duration: null, text: "" }).success,
		).toBe(true);
	});
});

describe("decisionSheetDefaults", () => {
	it("pre-fills the single duration option, and nothing else", () => {
		expect(decisionSheetDefaults(true, 30)).toEqual({
			choice: null,
			duration: 30,
			text: "",
		});
	});

	it("leaves duration unset when there is more than one option", () => {
		expect(decisionSheetDefaults(false, 30)).toEqual({
			choice: null,
			duration: null,
			text: "",
		});
	});
});
