"use client";

import { CreditCard, Loader2, Smartphone, Sparkles, Zap } from "lucide-react";
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

type PaymentMethod = "mobilemoney" | "card";

interface BoostApiResponse {
	paymentId: string;
	provider: "notchpay" | "stripe";
	checkoutUrl?: string;
}

interface BoostDialogProps {
	listingId: string;
	children?: React.ReactNode;
}

export function BoostDialog({ listingId, children }: BoostDialogProps) {
	const t = useTranslations("Boost");
	const { stripePublishableKey } = useAppConfig();
	const [open, setOpen] = useState(false);
	const [duration, setDuration] = useState<BoostDuration>("14");
	const [paymentMethod, setPaymentMethod] =
		useState<PaymentMethod>("mobilemoney");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const stripeAvailable = !!stripePublishableKey;

	function handleOpenChange(v: boolean) {
		setOpen(v);
		if (!v) {
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
					if (res.status === 401) {
						window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
						return;
					}
					const err = await res.json().catch(() => ({}));
					setError(err.error ?? t("genericError"));
					return;
				}

				const data: BoostApiResponse = await res.json();

				if (!data.checkoutUrl) {
					setError(t("noCheckoutUrl"));
					return;
				}

				window.location.href = data.checkoutUrl;
			} catch {
				setError(t("networkError"));
			}
		});
	}

	const price = boostPrices[duration];

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
					<DialogTitle className="text-center text-xl">
						{t("dialogTitle")}
					</DialogTitle>
					<DialogDescription className="text-center">
						{t("dialogSubtitle")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5">
					{/* Plans */}
					<div className="space-y-2">
						{(
							[
								{ value: "7" as const, labelKey: "week1" as const, days: 7 },
								{
									value: "14" as const,
									labelKey: "week2" as const,
									days: 14,
									popular: true,
								},
								{ value: "30" as const, labelKey: "month1" as const, days: 30 },
							] satisfies {
								value: BoostDuration;
								labelKey: "week1" | "week2" | "month1";
								days: number;
								popular?: boolean;
							}[]
						).map((plan) => {
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
										<span className="font-medium text-[#64748B] text-xs">
											XAF
										</span>
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
										<p className="text-[#94A3B8] text-xs">
											{t("cardUnavailable")}
										</p>
									</div>
								</div>
							)}
						</div>
					</div>

					{error && <p className="text-center text-red-500 text-sm">{error}</p>}

					<Button
						className={`w-full rounded-xl font-bold shadow-md hover:shadow-lg ${
							paymentMethod === "card"
								? "bg-[#1E40AF] text-white hover:bg-[#1E3A8A]"
								: "bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] text-[#0F172A] shadow-amber-500/20"
						}`}
						onClick={handlePay}
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
			</DialogContent>
		</Dialog>
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
