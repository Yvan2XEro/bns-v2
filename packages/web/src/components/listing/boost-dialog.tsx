"use client";

import {
	Elements,
	PaymentElement,
	useElements,
	useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
	ArrowLeft,
	CreditCard,
	Loader2,
	Smartphone,
	Sparkles,
	Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { useAppConfig } from "~/hooks/use-app-config";
import type { BoostDuration } from "~/types";

const boostPrices: Record<BoostDuration, number> = {
	"7": 500,
	"14": 900,
	"30": 1500,
};

// Module-level cache keyed by publishable key — one Stripe instance per key
const stripeInstances = new Map<string, ReturnType<typeof loadStripe>>();

function getStripePromise(key: string | null) {
	if (!key) return null;
	if (!stripeInstances.has(key)) {
		stripeInstances.set(key, loadStripe(key));
	}
	return stripeInstances.get(key)!;
}

type PaymentMethod = "mobilemoney" | "card";
type Step = "select" | "stripe-form";

interface BoostApiResponse {
	paymentId: string;
	provider: "notchpay" | "stripe";
	checkoutUrl?: string;
	clientSecret?: string;
}

interface BoostDialogProps {
	listingId: string;
	children?: React.ReactNode;
}

export function BoostDialog({ listingId, children }: BoostDialogProps) {
	const t = useTranslations("Boost");
	const { stripePublishableKey } = useAppConfig();
	const stripePromise = getStripePromise(stripePublishableKey);
	const [open, setOpen] = useState(false);
	const [duration, setDuration] = useState<BoostDuration>("14");
	const [paymentMethod, setPaymentMethod] =
		useState<PaymentMethod>("mobilemoney");
	const [step, setStep] = useState<Step>("select");
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const stripeAvailable = !!stripePromise;

	function handleOpenChange(v: boolean) {
		setOpen(v);
		if (!v) {
			setStep("select");
			setClientSecret(null);
			setError(null);
			setDuration("14");
			setPaymentMethod("mobilemoney");
		}
	}

	function handlePay() {
		setError(null);
		startTransition(async () => {
			try {
				const res = await fetch("/api/public/boost", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						listingId,
						duration,
						provider: paymentMethod === "card" ? "stripe" : "notchpay",
					}),
				});

				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					setError(err.error ?? t("genericError"));
					return;
				}

				const data: BoostApiResponse = await res.json();

				if (paymentMethod === "mobilemoney") {
					if (!data.checkoutUrl) {
						setError(t("noCheckoutUrl"));
						return;
					}
					window.location.href = data.checkoutUrl;
				} else {
					if (!data.clientSecret) {
						setError(t("initError"));
						return;
					}
					setClientSecret(data.clientSecret);
					setStep("stripe-form");
				}
			} catch {
				setError(t("networkError"));
			}
		});
	}

	const title = step === "select" ? t("dialogTitle") : t("cardFormTitle");
	const subtitle =
		step === "select" ? t("dialogSubtitle") : t("cardFormSubtitle");

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				{children ?? (
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5 border-[#F59E0B]/40 text-[#92400E] hover:bg-amber-50"
					>
						<Zap className="h-3.5 w-3.5" />
						Boost
					</Button>
				)}
			</DialogTrigger>

			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#FBBF24] shadow-amber-500/20 shadow-lg">
						<Sparkles className="h-6 w-6 text-white" />
					</div>
					<DialogTitle className="text-center text-xl">{title}</DialogTitle>
					<DialogDescription className="text-center">
						{subtitle}
					</DialogDescription>
				</DialogHeader>

				{step === "select" ? (
					<SelectStep
						t={t}
						duration={duration}
						setDuration={setDuration}
						paymentMethod={paymentMethod}
						setPaymentMethod={setPaymentMethod}
						stripeAvailable={stripeAvailable}
						isPending={isPending}
						error={error}
						onPay={handlePay}
					/>
				) : (
					clientSecret &&
					stripePromise && (
						<Elements
							stripe={stripePromise}
							options={{ clientSecret, locale: "fr" }}
						>
							<StripeFormStep
								t={t}
								listingId={listingId}
								onBack={() => {
									setStep("select");
									setClientSecret(null);
									setError(null);
								}}
							/>
						</Elements>
					)
				)}
			</DialogContent>
		</Dialog>
	);
}

// ─── Plan + payment method selection ────────────────────────────────────────

interface SelectStepProps {
	t: ReturnType<typeof useTranslations<"Boost">>;
	duration: BoostDuration;
	setDuration: (d: BoostDuration) => void;
	paymentMethod: PaymentMethod;
	setPaymentMethod: (m: PaymentMethod) => void;
	stripeAvailable: boolean;
	isPending: boolean;
	error: string | null;
	onPay: () => void;
}

const PLANS: {
	value: BoostDuration;
	labelKey: "week1" | "week2" | "month1";
	days: number;
	popular?: boolean;
}[] = [
	{ value: "7", labelKey: "week1", days: 7 },
	{ value: "14", labelKey: "week2", days: 14, popular: true },
	{ value: "30", labelKey: "month1", days: 30 },
];

function SelectStep({
	t,
	duration,
	setDuration,
	paymentMethod,
	setPaymentMethod,
	stripeAvailable,
	isPending,
	error,
	onPay,
}: SelectStepProps) {
	const price = boostPrices[duration];

	return (
		<div className="space-y-5">
			{/* Plans */}
			<div className="space-y-2">
				{PLANS.map((plan) => {
					const selected = duration === plan.value;
					return (
						<label
							key={plan.value}
							className={`relative flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all ${
								selected
									? "border-[#F59E0B] bg-amber-50/50 shadow-sm"
									: "border-[#E2E8F0] hover:border-[#F59E0B]/40 hover:bg-[#FFFBEB]/30"
							}`}
						>
							{plan.popular && (
								<span className="-top-2.5 absolute right-3 rounded-full bg-[#F59E0B] px-2 py-0.5 font-bold text-[10px] text-white">
									{t("popular")}
								</span>
							)}
							<div className="flex items-center gap-3">
								<div
									className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
										selected
											? "border-[#F59E0B] bg-[#F59E0B]"
											: "border-[#CBD5E1]"
									}`}
								>
									{selected && (
										<div className="h-2 w-2 rounded-full bg-white" />
									)}
								</div>
								<input
									type="radio"
									name="boost-duration"
									value={plan.value}
									checked={selected}
									onChange={() => setDuration(plan.value)}
									className="sr-only"
								/>
								<div>
									<p className="font-semibold text-[#0F172A] text-sm">
										{t(plan.labelKey)}
									</p>
									<p className="text-[#64748B] text-xs">
										{t("daysVisibility", { days: plan.days })}
									</p>
								</div>
							</div>
							<p className="font-bold text-[#0F172A] text-base">
								{boostPrices[plan.value].toLocaleString()}{" "}
								<span className="font-medium text-[#64748B] text-xs">XAF</span>
							</p>
						</label>
					);
				})}
			</div>

			{/* Payment method */}
			<div className="space-y-2">
				<p className="font-semibold text-[#0F172A] text-sm">
					{t("paymentMethod")}
				</p>
				<div className="grid grid-cols-2 gap-2">
					<PaymentMethodCard
						active={paymentMethod === "mobilemoney"}
						onClick={() => setPaymentMethod("mobilemoney")}
						icon={<Smartphone className="h-6 w-6" />}
						label={t("mobileMoney")}
						desc={t("mobileMoneyDesc")}
						activeColor="amber"
					/>

					{stripeAvailable ? (
						<PaymentMethodCard
							active={paymentMethod === "card"}
							onClick={() => setPaymentMethod("card")}
							icon={<CreditCard className="h-6 w-6" />}
							label={t("card")}
							desc={t("cardDesc")}
							activeColor="blue"
						/>
					) : (
						<div className="flex cursor-not-allowed flex-col items-center gap-2 rounded-xl border-2 border-[#E2E8F0] border-dashed px-4 py-3 opacity-40">
							<CreditCard className="h-6 w-6 text-[#64748B]" />
							<div className="text-center">
								<p className="font-semibold text-[#0F172A] text-sm">
									{t("card")}
								</p>
								<p className="text-[#94A3B8] text-xs">{t("cardUnavailable")}</p>
							</div>
						</div>
					)}
				</div>
			</div>

			{error && <p className="text-center text-red-500 text-sm">{error}</p>}

			<div className="flex flex-col gap-2">
				<Button
					className={`w-full rounded-xl font-bold shadow-md hover:shadow-lg ${
						paymentMethod === "card"
							? "bg-[#1E40AF] text-white hover:bg-[#1E3A8A]"
							: "bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] text-[#0F172A] shadow-amber-500/20"
					}`}
					onClick={onPay}
					disabled={isPending}
				>
					{isPending ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : paymentMethod === "card" ? (
						<CreditCard className="mr-2 h-4 w-4" />
					) : (
						<Smartphone className="mr-2 h-4 w-4" />
					)}
					{paymentMethod === "card"
						? t("continueBtn", { amount: price.toLocaleString() })
						: t("payBtn", { amount: price.toLocaleString() })}
				</Button>
			</div>
		</div>
	);
}

function PaymentMethodCard({
	active,
	onClick,
	icon,
	label,
	desc,
	activeColor,
}: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	desc: string;
	activeColor: "amber" | "blue";
}) {
	const activeBorder =
		activeColor === "amber"
			? "border-[#F59E0B] bg-amber-50/50"
			: "border-[#1E40AF] bg-blue-50/50";
	const activeIcon =
		activeColor === "amber" ? "text-[#F59E0B]" : "text-[#1E40AF]";
	const hoverBorder =
		activeColor === "amber"
			? "hover:border-[#F59E0B]/40"
			: "hover:border-[#1E40AF]/40";

	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-3 transition-all ${
				active ? activeBorder : `border-[#E2E8F0] ${hoverBorder}`
			}`}
		>
			<span className={active ? activeIcon : "text-[#64748B]"}>{icon}</span>
			<div className="text-center">
				<p className="font-semibold text-[#0F172A] text-sm">{label}</p>
				<p className="text-[#94A3B8] text-xs">{desc}</p>
			</div>
		</button>
	);
}

// ─── Stripe card form ────────────────────────────────────────────────────────

interface StripeFormStepProps {
	t: ReturnType<typeof useTranslations<"Boost">>;
	listingId: string;
	onBack: () => void;
}

function StripeFormStep({ t, listingId, onBack }: StripeFormStepProps) {
	const stripe = useStripe();
	const elements = useElements();
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!stripe || !elements) return;

		setIsProcessing(true);
		setError(null);

		const returnUrl = `${window.location.origin}/listing/${listingId}?boostStatus=success`;

		const { error: stripeError } = await stripe.confirmPayment({
			elements,
			confirmParams: { return_url: returnUrl },
			// Only redirect for payment methods that require it (3DS handles inline)
			redirect: "if_required",
		});

		if (stripeError) {
			setError(stripeError.message ?? t("paymentDeclined"));
			setIsProcessing(false);
		} else {
			// Payment confirmed without redirect — go to listing with success banner
			window.location.href = `/listing/${listingId}?boostStatus=success`;
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-5">
			<button
				type="button"
				onClick={onBack}
				className="flex items-center gap-1.5 text-[#64748B] text-sm hover:text-[#0F172A]"
			>
				<ArrowLeft className="h-4 w-4" />
				{t("back")}
			</button>

			<PaymentElement options={{ layout: "tabs" }} />

			{error && <p className="text-center text-red-500 text-sm">{error}</p>}

			<Button
				type="submit"
				className="w-full rounded-xl bg-[#1E40AF] font-bold text-white hover:bg-[#1E3A8A]"
				disabled={!stripe || !elements || isProcessing}
			>
				{isProcessing ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<CreditCard className="mr-2 h-4 w-4" />
				)}
				{t("confirmPayBtn")}
			</Button>
		</form>
	);
}
