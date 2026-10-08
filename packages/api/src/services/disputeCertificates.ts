import type { PayloadRequest } from "payload";
import { disputeCertificateLines } from "../lib/disputeCertificateDocument";
import { relationId } from "../lib/relationId";
import { renderTextPdf } from "../lib/textPdf";
import { withTransaction } from "../lib/transactions";
import type { Dispute } from "../payload-types";

type CertificateRenderer = (
	req: PayloadRequest,
	disputeId: string,
) => Promise<string>;

let renderer: CertificateRenderer | null = null;

export function registerCertificateRenderer(
	registered: CertificateRenderer,
): () => void {
	renderer = registered;
	return () => {
		if (renderer === registered) renderer = null;
	};
}

export async function renderDisputeCertificate(
	req: PayloadRequest,
	disputeId: string,
): Promise<string> {
	return withTransaction(req.payload, async (tx) => {
		const dispute = await tx.payload.findByID({
			collection: "disputes",
			id: disputeId,
			depth: 0,
			overrideAccess: true,
			req: tx,
		});
		const existing = relationId(dispute.effects?.certificate);
		if (existing) return existing;
		const orderId = relationId(dispute.order);
		const shopId = relationId(dispute.shop);
		if (!orderId || !shopId)
			throw new Error("Dispute certificate context missing");
		const [order, shop, logs] = await Promise.all([
			tx.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req: tx,
			}),
			tx.payload.findByID({
				collection: "shops",
				id: shopId,
				depth: 0,
				overrideAccess: true,
				req: tx,
			}),
			tx.payload.find({
				collection: "moderation-log",
				where: {
					and: [
						{ targetType: { equals: "dispute" } },
						{ targetId: { equals: disputeId } },
						{ action: { equals: "dispute.resolve" } },
					],
				},
				limit: 1,
				depth: 0,
				overrideAccess: true,
				req: tx,
			}),
		]);
		const metadata = logs.docs[0]?.metadata;
		const rawChecklist =
			typeof metadata === "object" &&
			metadata !== null &&
			!Array.isArray(metadata)
				? metadata.proofChecklist
				: null;
		const proof = Array.isArray(rawChecklist)
			? rawChecklist.flatMap((row) => {
					if (
						typeof row !== "object" ||
						row === null ||
						typeof row.requirement !== "string" ||
						typeof row.established !== "boolean"
					) {
						return [];
					}
					return [
						{ requirement: row.requirement, established: row.established },
					];
				})
			: [];
		const document = renderTextPdf(
			disputeCertificateLines({ dispute, order, shop, proof }),
		);
		const file = await tx.payload.create({
			collection: "dispute-evidence",
			req: tx,
			overrideAccess: true,
			data: {
				dispute: disputeId,
				uploadedByType: "system",
				kind: "document",
				visibility: "parties",
			},
			file: {
				data: document,
				mimetype: "application/pdf",
				name: `${dispute.number}-decision.pdf`,
				size: document.length,
			},
		});
		await tx.payload.update({
			collection: "disputes",
			id: disputeId,
			req: tx,
			overrideAccess: true,
			data: {
				effects: { ...dispute.effects, certificate: String(file.id) },
			},
		});
		return String(file.id);
	});
}

export async function queueCertificateRender(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<void> {
	await req.payload.jobs.queue({
		task: "renderDisputeCertificate",
		queue: "cases",
		input: { disputeId: String(dispute.id) },
	});
}

export function getCertificateRenderer(): CertificateRenderer | null {
	return renderer;
}

registerCertificateRenderer(renderDisputeCertificate);
