import type { Payload } from "payload";
import type { OpenWithdrawalInput } from "../returns";
import { openWithdrawal as openReturnWithdrawal } from "../returns";
import type { ServiceUser } from "../shops";

export type WithdrawalItemInput = OpenWithdrawalInput["items"][number];
export type WithdrawalInput = OpenWithdrawalInput;

/** P4 keeps its established API; P6 owns the shared return-case workflow. */
export function openWithdrawal(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
	input: WithdrawalInput,
): Promise<{ caseNumber: string; caseId: string }> {
	return openReturnWithdrawal(payload, user, orderId, input);
}
