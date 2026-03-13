"use client";

import { Loader2, Sparkles, Zap } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { createBoostPayment } from "~/lib/actions";
import type { BoostDuration } from "~/types";

const boostPrices: Record<BoostDuration, number> = {
	"7": 500,
	"14": 900,
	"30": 1500,
};

interface BoostDialogProps {
	listingId: string;
	children?: React.ReactNode;
}

export function BoostDialog({ listingId, children }: BoostDialogProps) {
	const [open, setOpen] = useState(false);
	const [duration, setDuration] = useState<BoostDuration>("7");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handleBoost() {
		setError(null);
		startTransition(async () => {
			const result = await createBoostPayment(listingId, duration);
			if (result.success && result.data?.paymentUrl) {
				window.location.href = result.data.paymentUrl;
			} else if (!result.success) {
				setError(result.error);
			}
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
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
						Boost your listing
					</DialogTitle>
					<DialogDescription className="text-center">
						Get more views by appearing at the top of search results.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2.5 py-3">
					{(["7", "14", "30"] as BoostDuration[]).map((d) => {
						const selected = duration === d;
						const label =
							d === "7" ? "1 week" : d === "14" ? "2 weeks" : "1 month";
						const popular = d === "14";
						return (
							<label
								key={d}
								className={`relative flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all duration-200 ${
									selected
										? "border-[#F59E0B] bg-amber-50/50 shadow-sm"
										: "border-[#E2E8F0] hover:border-[#F59E0B]/40 hover:bg-[#FFFBEB]/30"
								}`}
							>
								{popular && (
									<span className="-top-2.5 absolute right-3 rounded-full bg-[#F59E0B] px-2 py-0.5 font-bold text-[10px] text-white">
										Popular
									</span>
								)}
								<div className="flex items-center gap-3">
									<div
										className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
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
										value={d}
										checked={selected}
										onChange={() => setDuration(d)}
										className="sr-only"
									/>
									<div>
										<p className="font-semibold text-[#0F172A] text-sm">
											{label}
										</p>
										<p className="text-[#64748B] text-xs">
											{d} days of visibility
										</p>
									</div>
								</div>
								<p className="font-bold text-[#0F172A] text-base">
									{boostPrices[d]}{" "}
									<span className="font-medium text-[#64748B] text-xs">
										XAF
									</span>
								</p>
							</label>
						);
					})}
				</div>

				{error && <p className="text-center text-red-500 text-sm">{error}</p>}

				<DialogFooter className="flex-col gap-2 sm:flex-col">
					<Button
						className="w-full rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] font-bold text-[#0F172A] shadow-amber-500/20 shadow-md hover:shadow-lg"
						onClick={handleBoost}
						disabled={isPending}
					>
						{isPending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Sparkles className="mr-2 h-4 w-4" />
						)}
						Pay {boostPrices[duration]} XAF
					</Button>
					<button
						type="button"
						className="font-medium text-[#64748B] text-sm transition-colors hover:text-[#0F172A]"
						onClick={() => setOpen(false)}
					>
						Cancel
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
