"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useOrderAction } from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	addPendingPhotos,
	type PendingReviewPhoto,
	pendingPhoto,
	REVIEW_PHOTO_ISSUE_KEYS,
	REVIEW_PHOTO_ISSUE_PARAMS,
	REVIEW_PHOTO_MIME_TYPES,
	REVIEW_PHOTOS_MAX,
} from "~/lib/review-photos";
import { shopApi } from "~/lib/shop-api";
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
		{ order: string; rating: number; comment?: string; photos?: string[] },
		unknown
	>("review_shop", { orderId });
	const [photos, setPhotos] = useState<PendingReviewPhoto[]>([]);
	const [photoIssue, setPhotoIssue] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const photosId = useId();
	const latest = useRef(photos);
	latest.current = photos;
	useEffect(
		() => () => {
			for (const photo of latest.current) URL.revokeObjectURL(photo.previewUrl);
		},
		[],
	);

	const pickPhotos = (files: FileList | null) => {
		if (!files || files.length === 0) return;
		const picked = Array.from(files).map((file, index) =>
			pendingPhoto(
				file,
				`${Date.now()}-${index}-${file.name}`,
				URL.createObjectURL(file),
			),
		);
		const { photos: next, issue } = addPendingPhotos(photos, picked);
		for (const photo of picked) {
			if (!next.includes(photo)) URL.revokeObjectURL(photo.previewUrl);
		}
		setPhotos(next);
		setPhotoIssue(
			issue
				? t(REVIEW_PHOTO_ISSUE_KEYS[issue], REVIEW_PHOTO_ISSUE_PARAMS)
				: null,
		);
		if (fileInput.current) fileInput.current.value = "";
	};

	const removePhoto = (key: string) => {
		const photo = photos.find((p) => p.key === key);
		if (photo) URL.revokeObjectURL(photo.previewUrl);
		setPhotos(photos.filter((p) => p.key !== key));
		setPhotoIssue(null);
	};
	const { formState, handleSubmit, register, setError } = useForm<
		ReviewInput,
		unknown,
		ReviewValues
	>({ resolver: zodResolver(reviewSchema), defaultValues: { comment: "" } });

	const onSubmit = handleSubmit(async ({ rating, comment }) => {
		try {
			setUploading(true);
			const photoIds = await Promise.all(
				photos.map((photo) => shopApi.uploadMedia(photo.file, shopName)),
			).finally(() => setUploading(false));
			await review.mutateAsync({
				order: orderId,
				rating,
				...(comment ? { comment } : {}),
				...(photoIds.length > 0 ? { photos: photoIds } : {}),
			});
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
			<h2 className="font-semibold text-ink">{t("reviewShop")}</h2>
			<p className="text-ink-muted text-sm">{shopName}</p>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<fieldset>
					<legend className="mb-2 font-medium text-sm">
						{t("reviewRating")}
					</legend>
					<div className="flex gap-1">
						{RATINGS.map((value) => (
							<label
								key={value}
								className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-[#F59E0B] has-[:checked]:bg-warn-soft"
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
				<div className="space-y-2">
					<p id={photosId} className="font-medium text-sm">
						{t("reviewPhotos")}{" "}
						<span className="font-normal text-ink-muted">
							{t("reviewPhotosHint", { max: REVIEW_PHOTOS_MAX })}
						</span>
					</p>
					<ul aria-labelledby={photosId} className="flex flex-wrap gap-2">
						{photos.map((photo, index) => (
							<li key={photo.key} className="relative h-[68px] w-[68px]">
								<img
									src={photo.previewUrl}
									alt=""
									className="h-full w-full rounded-[10px] object-cover"
								/>
								<button
									type="button"
									onClick={() => removePhoto(photo.key)}
									aria-label={t("reviewPhotoRemove", { index: index + 1 })}
									className="-top-2 -right-2 absolute flex h-6 w-6 items-center justify-center rounded-full bg-night text-white"
								>
									<X className="h-3.5 w-3.5" aria-hidden />
								</button>
							</li>
						))}
						{photos.length < REVIEW_PHOTOS_MAX && (
							<li>
								<button
									type="button"
									onClick={() => fileInput.current?.click()}
									className="flex h-[68px] w-[68px] flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px] border-ink-faint border-dashed text-ink-muted hover:bg-canvas"
								>
									<Camera className="h-5 w-5" aria-hidden />
									<span className="font-semibold text-[10px]">
										{t("reviewPhotoAdd")}
									</span>
								</button>
							</li>
						)}
					</ul>
					<input
						ref={fileInput}
						type="file"
						accept={REVIEW_PHOTO_MIME_TYPES.join(",")}
						multiple
						hidden
						onChange={(event) => pickPhotos(event.target.files)}
					/>
					{photoIssue && (
						<p role="alert" className="text-red-700 text-sm">
							{photoIssue}
						</p>
					)}
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
				<Button
					type="submit"
					className="min-h-11"
					disabled={review.isPending || uploading}
				>
					{t("reviewSubmit")}
				</Button>
			</form>
		</section>
	);
}
