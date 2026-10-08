import type { Dispute, Order, Shop } from "../payload-types";
import type { PdfLine } from "./textPdf";

export interface DisputeCertificateDocumentInput {
	dispute: Pick<Dispute, "number" | "status" | "resolution">;
	order: Pick<Order, "orderNumber">;
	shop: Pick<Shop, "name" | "handle" | "legal">;
	proof: Array<{ requirement: string; established: boolean }>;
}

const RECOURSE_FR =
	"Cette décision est contractuelle et ne vous prive d'aucun recours : vous pouvez saisir une association de consommateurs ou les tribunaux.";
const RECOURSE_EN =
	"This decision is contractual and removes no recourse: you may take the claim to a consumer association or the courts.";

export function disputeCertificateLines({
	dispute,
	order,
	shop,
	proof,
}: DisputeCertificateDocumentInput): PdfLine[] {
	const statement = dispute.resolution?.publicStatement;
	const establishedProof = proof.filter((row) => row.established);
	const lines: PdfLine[] = [
		{
			text: "BUY N SELLEM - DISPUTE DECISION / DECISION DE LITIGE",
			bold: true,
			size: 13,
		},
		{ text: `Dispute / Litige: ${dispute.number}`, gap: 8 },
		{ text: `Order / Commande: ${order.orderNumber}` },
		{
			text: `Decision / Décision: ${dispute.resolution?.outcome ?? dispute.status}`,
		},
		{
			text: `Refund / Remboursement: ${dispute.resolution?.refundAmount ?? 0} XAF`,
		},
		{ text: `Shop / Boutique: ${shop.name} (@${shop.handle})`, gap: 8 },
	];
	if (shop.legal?.rccmNumber)
		lines.push({ text: `RCCM: ${shop.legal.rccmNumber}` });
	if (shop.legal?.niu) lines.push({ text: `NIU: ${shop.legal.niu}` });
	lines.push(
		{ text: "Decision statement (FR)", bold: true, gap: 8 },
		{ text: statement?.fr ?? "" },
		{ text: "Decision statement (EN)", bold: true, gap: 8 },
		{ text: statement?.en ?? "" },
		{ text: "Evidence relied on / Éléments retenus", bold: true, gap: 8 },
	);
	for (const row of establishedProof) lines.push({ text: row.requirement });
	if (!establishedProof.length) {
		lines.push({ text: "No proof checklist item was marked established." });
	}
	lines.push({ text: RECOURSE_FR, gap: 10 }, { text: RECOURSE_EN, gap: 8 });
	return lines;
}
