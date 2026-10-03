import type { TaskConfig } from "payload";
import { recoverSellerReceivables } from "../services/refunds";

/** Daily at 03:00; registered and scheduled by P5 Task 20, exported only. */
export const recoverSellerReceivablesTask: TaskConfig<{
	input: object;
	output: {
		debits: number;
		writtenOff: number;
		suspended: number;
		failed: number;
	};
}> = {
	slug: "recoverSellerReceivables",
	retries: 1,
	inputSchema: [],
	outputSchema: [
		{ name: "debits", type: "number" },
		{ name: "writtenOff", type: "number" },
		{ name: "suspended", type: "number" },
		{ name: "failed", type: "number" },
	],
	handler: async ({ req }) => {
		const result = await recoverSellerReceivables(req.payload);
		return {
			output: {
				debits: result.debits.length,
				writtenOff: result.writeOffs.length,
				suspended: result.suspended.length,
				failed: result.failed.length,
			},
		};
	},
};
