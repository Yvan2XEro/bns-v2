import type { TaskConfig } from "payload";
import { getCertificateRenderer } from "../services/disputeCertificates";

export const renderDisputeCertificateTask: TaskConfig<{
	input: { disputeId: string };
	output: { certificateId: string };
}> = {
	slug: "renderDisputeCertificate",
	retries: 3,
	inputSchema: [{ name: "disputeId", type: "text", required: true }],
	handler: async ({ input, req }) => {
		const renderer = getCertificateRenderer();
		if (!renderer)
			throw new Error("Dispute certificate renderer is not registered");
		return {
			output: { certificateId: await renderer(req, input.disputeId) },
		};
	},
};
