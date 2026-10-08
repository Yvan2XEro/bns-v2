import type {
	ConnectedAccountStatus,
	NormalisedEvent,
	NormalisedRefundStatus,
	NormalisedTransferStatus,
} from "./marketplace";
import { mapNotchPayStatus, toAmount, toCurrency, toText } from "./notchpay";
import {
	ACCOUNT_STATUSES,
	failureCodeOf,
	REFUND_STATUSES,
	TRANSFER_STATUSES,
} from "./notchpayTables";
import { isRecord, type ProviderPaymentStatus } from "./types";

type EventKind =
	| { entity: "payment"; status: ProviderPaymentStatus }
	| { entity: "refund"; status: NormalisedRefundStatus }
	| { entity: "transfer"; status: NormalisedTransferStatus }
	| { entity: "account"; status: ConnectedAccountStatus | null };

/** Both spellings (legacy `event` names and Sync `type` names) in one table. */
export const EVENT_KINDS: Record<string, EventKind> = {
	"payment.complete": { entity: "payment", status: "succeeded" },
	"payment.succeeded": { entity: "payment", status: "succeeded" },
	"payment.failed": { entity: "payment", status: "failed" },
	"payment.canceled": { entity: "payment", status: "cancelled" },
	"payment.cancelled": { entity: "payment", status: "cancelled" },
	"payment.expired": { entity: "payment", status: "expired" },
	"refund.created": { entity: "refund", status: REFUND_STATUSES.pending },
	"refund.complete": { entity: "refund", status: REFUND_STATUSES.complete },
	"refund.failed": { entity: "refund", status: REFUND_STATUSES.failed },
	"transfer.created": { entity: "transfer", status: TRANSFER_STATUSES.pending },
	"transfer.sent": { entity: "transfer", status: TRANSFER_STATUSES.sent },
	"transfer.processing": {
		entity: "transfer",
		status: TRANSFER_STATUSES.processing,
	},
	"transfer.reversed": {
		entity: "transfer",
		status: TRANSFER_STATUSES.reversed,
	},
	"transfer.complete": {
		entity: "transfer",
		status: TRANSFER_STATUSES.complete,
	},
	"transfer.failed": { entity: "transfer", status: TRANSFER_STATUSES.failed },
	"account.created": { entity: "account", status: null },
	"account.updated": { entity: "account", status: null },
	"account.application.deauthorized": {
		entity: "account",
		status: ACCOUNT_STATUSES.deauthorized,
	},
};

const record = (value: unknown): Record<string, unknown> =>
	isRecord(value) ? value : {};

/** Pure, so `processWebhookEvent` can re-parse a stored body without any provider config. */
export function parseNotchPayMarketplaceEvent(raw: unknown): NormalisedEvent {
	const event = record(raw);
	const data = record(event.data);
	const name = toText(event.type) || toText(event.event);
	const kind = EVENT_KINDS[name];
	const common = {
		providerEventId: toText(event.id),
		reference: toText(data.merchant_reference) || toText(data.trxref),
		amount: toAmount(data.amount),
		currency: toCurrency(data.currency),
		providerTransactionId: toText(data.reference) || null,
	};
	const fee = toAmount(data.fee);
	const failure = toText(data.failure_reason) || toText(data.message) || null;

	if (kind?.entity === "refund") {
		return {
			...common,
			entity: "refund",
			type: `refund/${kind.status}`,
			status: kind.status,
			refundId: toText(data.id),
			paymentReference:
				toText(record(data.metadata).payment_reference) ||
				toText(data.merchant_reference),
			accountId: toText(record(data.destination).account) || null,
			fee,
		};
	}
	if (kind?.entity === "transfer") {
		return {
			...common,
			entity: "transfer",
			type: `transfer/${kind.status}`,
			status: kind.status,
			transferId: toText(data.id),
			accountId: toText(data.account),
			fee,
			failureReason: kind.status === "failed" ? failure : null,
		};
	}
	if (kind?.entity === "account") {
		const status =
			kind.status ??
			ACCOUNT_STATUSES[toText(data.status).toLowerCase()] ??
			(name === "account.created" ? "created" : "onboarding");
		return {
			...common,
			entity: "account",
			type: `account/${status}`,
			status,
			accountId: toText(data.id),
		};
	}
	const status =
		kind?.entity === "payment"
			? kind.status
			: mapNotchPayStatus(toText(data.status));
	return {
		...common,
		entity: "payment",
		type: `payment/${status}`,
		status,
		accountId: toText(record(data.destination).account) || null,
		fee,
		failureCode: failureCodeOf(
			toText(data.failure_reason) || toText(data.status),
			status,
		),
	};
}
