import { describe, expect, it } from "bun:test";
import { returnActionEndpoint } from "./returnActionEndpoint";

describe("returnActionEndpoint", () => {
	it("maps every server action to its public route", () => {
		expect(returnActionEndpoint("ship")).toBe("ship");
		expect(returnActionEndpoint("confirm_refund")).toBe("confirm-refund");
		expect(returnActionEndpoint("contest_refund")).toBe("contest-refund");
		expect(returnActionEndpoint("upload_evidence")).toBe("evidence");
	});
});
