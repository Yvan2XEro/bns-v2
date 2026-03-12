"use client";

import { Loader2, Star } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

interface ReviewFormProps {
	reviewedUserId: number;
	onSuccess?: () => void;
}

export function ReviewForm({ reviewedUserId, onSuccess }: ReviewFormProps) {
	const [rating, setRating] = useState(0);
	const [hoveredRating, setHoveredRating] = useState(0);
	const [comment, setComment] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (rating === 0) {
			setError("Please select a rating");
			return;
		}
		setError("");
		setIsLoading(true);

		try {
			const res = await fetch("/api/reviews", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					reviewedUser: reviewedUserId,
					rating,
					comment: comment || undefined,
				}),
				credentials: "include",
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.errors?.[0]?.message || "Failed to submit review");
			}

			setSuccess(true);
			setRating(0);
			setComment("");
			onSuccess?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to submit review");
		} finally {
			setIsLoading(false);
		}
	}

	if (success) {
		return (
			<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-700">
				Review submitted successfully! Thank you.
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
			<h3 className="mb-3 text-sm font-bold text-[#0F172A]">Leave a review</h3>
			{error && (
				<div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</div>
			)}
			<div className="mb-3 flex items-center gap-1">
				{[1, 2, 3, 4, 5].map((star) => (
					<button
						key={star}
						type="button"
						onClick={() => setRating(star)}
						onMouseEnter={() => setHoveredRating(star)}
						onMouseLeave={() => setHoveredRating(0)}
						className="p-0.5"
					>
						<Star
							className={`h-6 w-6 transition-colors ${
								star <= (hoveredRating || rating)
									? "fill-[#F59E0B] text-[#F59E0B]"
									: "text-[#E2E8F0]"
							}`}
						/>
					</button>
				))}
				{rating > 0 && <span className="ml-2 text-sm text-[#64748B]">{rating}/5</span>}
			</div>
			<Textarea
				placeholder="Share your experience (optional)"
				value={comment}
				onChange={(e) => setComment(e.target.value)}
				rows={3}
				className="mb-3"
			/>
			<Button
				type="submit"
				disabled={isLoading || rating === 0}
				size="sm"
				className="rounded-lg bg-[#1E40AF] hover:bg-[#1E3A8A]"
			>
				{isLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
				Submit Review
			</Button>
		</form>
	);
}
