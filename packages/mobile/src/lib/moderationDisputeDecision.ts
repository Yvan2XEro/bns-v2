export function canSubmitDisputeResolution(
	previewedRefundAmount: number | null,
	refundAmount: number,
): boolean {
	return (
		previewedRefundAmount !== null && previewedRefundAmount === refundAmount
	);
}
