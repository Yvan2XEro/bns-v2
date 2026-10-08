import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import {
	isScreenFile,
	rootRegistrationFor,
	stackScreenNames,
} from "./appRoutes";

const APP_ROOT = join(import.meta.dir, "../../app");

/**
 * P3 shipped a screen nothing could reach. Every P4 screen file under these
 * roots must have its root `Stack.Screen`, found by reading the files on disk
 * rather than a list someone has to remember to extend.
 */
const P4_ROOTS = [
	"cart.tsx",
	"checkout/**/*",
	"purchases/**/*",
	"seller/orders/**/*",
	"seller/billing/**/*",
	"seller/order-settings.tsx",
	"moderation/order/**/*",
	// Task 29: the P5 pay/pending screens already live under checkout/**, and
	// the seller payments hub/setup/payouts screens join the inventory here.
	"seller/payments/**/*",
	// Registrations task: the P7 delivery settings, shipment, rider and
	// courier screens.
	"seller/delivery/**/*",
	"seller/shipment/**/*",
	"rider/**/*",
	"courier/**/*",
];

function appFiles(pattern: string): string[] {
	return [...new Glob(pattern).scanSync({ cwd: APP_ROOT })].sort();
}

const allFiles = appFiles("**/*");
const layoutDirs = allFiles
	.filter((file) => /(^|\/)_layout\.tsx$/.test(file))
	.map((file) => file.replace(/\/?_layout\.tsx$/, ""))
	.filter(Boolean);
const p4Screens = P4_ROOTS.flatMap(appFiles).filter(isScreenFile).sort();
const p6Screens = allFiles
	.filter(
		(file) =>
			file === "account/disputes.tsx" ||
			file === "account/returns.tsx" ||
			file === "disputes/[id].tsx" ||
			file === "purchases/[id]/problem.tsx" ||
			file === "seller/returns/index.tsx" ||
			file.startsWith("moderation/disputes/") ||
			file === "returns/[id].tsx",
	)
	.filter(isScreenFile)
	.sort();
const registered = stackScreenNames(
	readFileSync(join(APP_ROOT, "_layout.tsx"), "utf8"),
);

describe("every P4 screen is registered in the root stack", () => {
	// Task 29 added the five P5 screens (checkout/[orderId]/pay.tsx,
	// checkout/[orderId]/pending.tsx and the three seller/payments/** files),
	// taking the list from fifteen to twenty. The registrations task adds the
	// reschedule screen and the eight P7 delivery/rider/courier screens.
	test("the roots hold the thirty screens the plan lists", () => {
		expect(p4Screens).toEqual([
			"cart.tsx",
			"checkout/[orderId]/pay.tsx",
			"checkout/[orderId]/pending.tsx",
			"checkout/address.tsx",
			"checkout/confirmation/[id].tsx",
			"checkout/delivery.tsx",
			"checkout/review.tsx",
			"courier/index.tsx",
			"moderation/order/[id].tsx",
			"purchases/[id].tsx",
			"purchases/[id]/problem.tsx",
			"purchases/[id]/reschedule.tsx",
			"purchases/[id]/withdrawal.tsx",
			"purchases/index.tsx",
			"rider/index.tsx",
			"rider/shipment/[id].tsx",
			"seller/billing/[id].tsx",
			"seller/billing/index.tsx",
			"seller/delivery/index.tsx",
			"seller/delivery/location/[id].tsx",
			"seller/delivery/locations.tsx",
			"seller/delivery/zone/[id].tsx",
			"seller/order-settings.tsx",
			"seller/orders/[id].tsx",
			"seller/orders/[id]/handover.tsx",
			"seller/orders/index.tsx",
			"seller/payments/index.tsx",
			"seller/payments/payouts/[id].tsx",
			"seller/payments/setup.tsx",
			"seller/shipment/[id].tsx",
		]);
	});

	test("checkout's steps answer to one entry, through its own layout", () => {
		expect(layoutDirs).toContain("checkout");
		expect(
			rootRegistrationFor("checkout/confirmation/[id].tsx", layoutDirs),
		).toBe("checkout");
	});

	test.each(p4Screens)("%s has a Stack.Screen", (file) => {
		const name = rootRegistrationFor(file, layoutDirs);
		if (!registered.includes(name)) {
			throw new Error(
				`app/${file} is not reachable: app/_layout.tsx has no <Stack.Screen name="${name}">`,
			);
		}
		expect(registered).toContain(name);
	});

	test("every new entry hides the stack header, which the screens draw themselves", () => {
		const source = readFileSync(join(APP_ROOT, "_layout.tsx"), "utf8");
		const names = [
			...new Set(p4Screens.map((f) => rootRegistrationFor(f, layoutDirs))),
		];
		// The problem-report flow adds one nested purchase root; the reschedule screen and the eight P7 screens add nine more.
		expect(names).toHaveLength(25);
		for (const name of names) {
			const entry = new RegExp(
				`<Stack\\.Screen\\s+name="${name.replace(/[[\]]/g, "\\$&")}"[^>]*headerShown: false`,
			);
			expect({ name, hidden: entry.test(source) }).toEqual({
				name,
				hidden: true,
			});
		}
	});
});

describe("P6 return and dispute screens are reachable", () => {
	test.each(p6Screens)("%s has a root Stack.Screen", (file) => {
		const name = rootRegistrationFor(file, layoutDirs);
		expect(registered).toContain(name);
	});
});
