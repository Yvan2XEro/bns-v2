"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { useCreatePaymentIntent, usePaymentStatus } from "~/hooks/use-checkout";
import { availableActions, useCancelOrder } from "~/hooks/use-order-actions";
import { usePurchase } from "~/hooks/use-purchases";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	codFallbackAllowed,
	failedActions,
	freshAttempt,
	stepFor,
} from "~/lib/payment-flow";
import { useNow } from "../../../(public)/purchases/use-now";
import { FailedState } from "./failed-state";
import { PendingState } from "./pending-state";

/**
 * Pending, failed and expired all render here, off the order's latest
 * intent — including when NotchPay's hosted-checkout callback lands the
 * buyer here directly, so every branch stands on `orderId` alone.
 */
export function PendingClient({
	orderId,
	providerInstructions,
}: {
	orderId: string;
	providerInstructions: string | null;
}) {
	const t = useTranslations("Payments");
	const tRoot = useTranslations();
	const router = useRouter();
	const now = useNow(1_000).getTime();

	const purchase = usePurchase(orderId);
	const status = usePaymentStatus(orderId, purchase.isSuccess);
	const createIntent = useCreatePaymentIntent(orderId);
	const cancel = useCancelOrder({ orderId });

	const order = purchase.data;
	const intent = status.data?.intent ?? null;
	const step = intent ? stepFor(intent.status) : null;

	// The moment this screen first sees a given intent as open, kept per
	// intent id so a retry's fresh intent gets its own 3-minute cool-down
	// instead of inheriting the one that already elapsed on the last.
	const pendingSinceRef = useRef<Record<string, number>>({});
	if (intent && step === "pending" && !(intent.id in pendingSinceRef.current)) {
		pendingSinceRef.current[intent.id] = Date.now();
	}

	// Only the navigation straight from `/pay` carries a live `instructions`
	// string; a retry fired from this screen gets its own, which then wins.
	const [instructions, setInstructions] = useState(providerInstructions);

	useEffect(() => {
		if (step === "paid")
			router.replace(`/purchases/${encodeURIComponent(orderId)}`);
	}, [step, orderId, router]);

	useEffect(() => {
		if (status.isSuccess && !intent) {
			router.replace(`/checkout/${encodeURIComponent(orderId)}/pay`);
		}
	}, [status.isSuccess, intent, orderId, router]);

	if (purchase.isPending || status.isPending || step === "paid") {
		return (
			<LoaderCircle className="mx-auto h-6 w-6 animate-spin text-[#64748B]" />
		);
	}
	if (!order || !intent || !step) {
		return (
			<p role="alert" className="text-red-700 text-sm">
				{resolveErrorMessage(purchase.error, tRoot)}
			</p>
		);
	}

	/** Always a fresh `Idempotency-Key` — `freshAttempt` builds it that way. */
	const runAttempt = (attempt: {
		channel: string;
		phone: string;
		idempotencyKey: string;
	}) => {
		createIntent.mutate(attempt, {
			onSuccess: (response) => setInstructions(response.instructions),
		});
	};

	const payOnDelivery = async () => {
		await cancel.mutateAsync({ reason: "buyer_changed_mind" });
		router.push("/purchases");
	};

	if (step === "expired") {
		return (
			<div className="space-y-4 text-center">
				<h1 className="font-bold text-2xl text-[#0F172A]">
					{t("expired_title")}
				</h1>
				<p className="text-[#334155] text-sm">{t("expired_body")}</p>
				<Button asChild className="min-h-11">
					<Link href="/purchases">{tRoot("Checkout.viewOrder")}</Link>
				</Button>
			</div>
		);
	}

	if (step === "pending") {
		return (
			<PendingState
				channel={intent.channel}
				expiresAt={intent.expiresAt}
				providerInstructions={instructions}
				pendingSince={pendingSinceRef.current[intent.id] ?? now}
				now={now}
				resending={createIntent.isPending}
				onResend={() =>
					runAttempt(
						freshAttempt(
							{ channel: intent.channel, phone: order.delivery.phone },
							crypto.randomUUID(),
						),
					)
				}
			/>
		);
	}

	const orderAllowsCod = availableActions(order, "buyer").includes("cancel");
	const offerCod =
		intent.attemptsLeft === 0 &&
		codFallbackAllowed("payment.tooManyAttempts", orderAllowsCod);

	return (
		<FailedState
			failureCode={intent.failureCode ?? "provider_error"}
			channel={intent.channel}
			attemptsLeft={intent.attemptsLeft}
			defaultPhone={order.delivery.phone}
			actions={failedActions(intent.attemptsLeft, offerCod)}
			submitting={createIntent.isPending}
			submitError={createIntent.error}
			cancelPending={cancel.isPending}
			onRetrySame={() =>
				runAttempt(
					freshAttempt(
						{ channel: intent.channel, phone: order.delivery.phone },
						crypto.randomUUID(),
					),
				)
			}
			onSubmitAttempt={(values) =>
				runAttempt({ ...values, idempotencyKey: crypto.randomUUID() })
			}
			onPayOnDelivery={() => void payOnDelivery()}
		/>
	);
}
