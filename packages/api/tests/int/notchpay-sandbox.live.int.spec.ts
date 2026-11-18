// @vitest-environment node
import { afterAll, describe, it } from "vitest";
import { runMarketplaceContract } from "./helpers/marketplaceContract";
import {
	createSandbox,
	debitGap,
	isRecordRun,
	type Sandbox,
} from "./helpers/notchpaySandbox";

const live = isRecordRun(process.env);

describe.runIf(live)("NotchPay sandbox (record mode)", () => {
	let sandbox: Sandbox | undefined;
	const current = () => {
		sandbox ??= createSandbox();
		return sandbox;
	};

	// The driver must be the same object the provider was built next to.
	runMarketplaceContract(() => current().provider, {
		activeAccount: (p) => current().driver.activeAccount(p),
		completeOnboarding: (p, id) => current().driver.completeOnboarding(p, id),
		settlePayment: (p, ref) => current().driver.settlePayment(p, ref),
		settleTransfer: (p, t) => current().driver.settleTransfer(p, t),
		seedBalance: (p, id) => current().driver.seedBalance(p, id),
		capabilityGap: debitGap,
	});

	afterAll(() => {
		if (!sandbox) return;
		const { cleared, stillAssumed, verified } = sandbox.recorder.summary();
		console.log(
			`NotchPay record run\n  cleared:       ${cleared.join(", ") || "none"}\n  still assumed: ${stillAssumed.join(", ") || "none"}\n  verified:      ${verified.join(", ") || "none"}`,
		);
	});
});

if (!live)
	it.skip("NotchPay sandbox pass — set NOTCHPAY_SANDBOX=record with sandbox keys to run", () => {});
