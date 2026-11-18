import { describe, expect, test } from "bun:test";
import { permissionAction, permissionState } from "./appPermissions";

describe("permissionState", () => {
	test("reads Expo's answer", () => {
		expect(permissionState({ status: "granted", canAskAgain: true })).toBe(
			"granted",
		);
		expect(permissionState({ status: "undetermined", canAskAgain: true })).toBe(
			"undetermined",
		);
		expect(permissionState(null)).toBe("unavailable");
	});

	test("tells a refusal the app may ask again from one it may not", () => {
		expect(permissionState({ status: "denied", canAskAgain: true })).toBe(
			"denied",
		);
		expect(permissionState({ status: "denied", canAskAgain: false })).toBe(
			"blocked",
		);
	});

	test("sees iOS's limited photo access", () => {
		expect(
			permissionState({
				status: "granted",
				canAskAgain: true,
				accessPrivileges: "limited",
			}),
		).toBe("limited");
	});
});

describe("permissionAction", () => {
	test("asks while it may, opens the system settings otherwise", () => {
		expect(permissionAction("undetermined")).toBe("request");
		expect(permissionAction("denied")).toBe("request");
		expect(permissionAction("blocked")).toBe("openSettings");
		expect(permissionAction("granted")).toBe("openSettings");
		expect(permissionAction("limited")).toBe("openSettings");
		expect(permissionAction("unavailable")).toBeNull();
	});
});
