"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useOrderAction } from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type ReviewInput,
	type ReviewValues,
	reviewSchema,
} from "../purchase-view";

const RATINGS = [1, 2, 3, 4, 5] as const;

/**
 * A review names only the order: `enforceReviewRules` resolves the shop and
 * its owner from it and marks the purchase verified, so nothing here claims
 * either. The panel is mounted only while `availableActions` offers
 * `review_shop`, which reads the serialised `reviewable`; once published,
 * the purchase is refetched and the panel goes with the flag.
 */
export function ReviewPanel({
	orderId,
	shopName,
}: {
	orderId: string;
	shopName: string;
}) {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const review = useOrderAction<
		{ order: string; rating: number; comment?: string },
		unknown
	>("review_shop", { orderId });
	const { formState, handleSubmit, register, setError } = useForm<
		ReviewInput,
		unknown,
		ReviewValues
	>({ resolver: zodResolver(reviewSchema), defaultValues: { comment: "" } });

	const onSubmit = handleSubmit(async ({ rating, comment }) => {
		try {
			await review.mutateAsync({
				order: orderId,
				rating,
				...(comment ? { comment } : {}),
			});
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-semibold text-[#0F172A]">{t("reviewShop")}</h2>
			<p className="text-[#64748B] text-sm">{shopName}</p>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<fieldset>
					<legend className="mb-2 font-medium text-sm">
						{t("reviewRating")}
					</legend>
					<div className="flex gap-1">
						{RATINGS.map((value) => (
							<label
								key={value}
								className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-[#F59E0B] has-[:checked]:bg-[#FEF3C7]"
							>
								<input
									type="radio"
									value={value}
									className="sr-only"
									{...register("rating")}
								/>
								<Star aria-hidden />
								<span className="sr-only">
									{t("reviewStars", { count: value })}
								</span>
							</label>
						))}
					</div>
				</fieldset>
				{formState.errors.rating && (
					<p className="text-red-700 text-sm">{t("reviewRatingRequired")}</p>
				)}
				<div className="space-y-1.5">
					<label htmlFor="review-comment" className="block font-medium text-sm">
						{t("reviewComment")}
					</label>
					<Textarea id="review-comment" rows={3} {...register("comment")} />
				</div>
				{formState.errors.root?.message && (
					<p role="alert" className="text-red-700 text-sm">
						{formState.errors.root.message}
					</p>
				)}
				{review.isSuccess && (
					<output className="block text-green-700 text-sm">
						{t("reviewSent")}
					</output>
				)}
				<Button type="submit" className="min-h-11" disabled={review.isPending}>
					{t("reviewSubmit")}
				</Button>
			</form>
		</section>
	);
}
