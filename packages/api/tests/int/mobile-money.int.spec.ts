// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	operatorFromPhone,
	ussdDialUrl,
} from "../../src/contracts/mobileMoney";

describe("operatorFromPhone", () => {
	it("tells MTN from Orange by prefix", () => {
		expect(operatorFromPhone("677 12 34 56")).toBe("cm.mtn");
		expect(operatorFromPhone("+237 652 12 34 56")).toBe("cm.mtn");
		expect(operatorFromPhone("+237699123456")).toBe("cm.orange");
		expect(operatorFromPhone("656123456")).toBe("cm.orange");
		expect(operatorFromPhone("686123456")).toBe("cm.orange");
	});

	it("knows nothing of other networks or partial input", () => {
		expect(operatorFromPhone("662123456")).toBeNull();
		expect(operatorFromPhone("2")).toBeNull();
	});
});

describe("ussdDialUrl", () => {
	it("escapes the # the dialer would drop", () => {
		expect(ussdDialUrl("cm.mtn")).toBe("tel:*126%23");
		expect(ussdDialUrl("cm.orange")).toBe("tel:%23150%23");
	});
});
