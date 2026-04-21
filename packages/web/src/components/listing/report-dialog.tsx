"use client";

import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { ReportReason } from "~/types";

interface ReportDialogProps {
	targetType: "listing" | "user" | "message";
	targetId: string;
	children?: React.ReactNode;
}

export function ReportDialog({
	targetType,
	targetId,
	children,
}: ReportDialogProps) {
	const t = useTranslations("Report");
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState<ReportReason | "">("");
	const [description, setDescription] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsLoading(true);

		try {
			const response = await fetch("/api/reports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					targetType,
					targetId,
					reason,
					description: description || undefined,
				}),
			});

			if (!response.ok) throw new Error(t("failedToSubmit"));

			setSuccess(true);
			setTimeout(() => {
				setOpen(false);
				setSuccess(false);
				setReason("");
				setDescription("");
			}, 2000);
		} catch (error) {
			console.error("Report submission failed:", error);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{children || (
					<Button variant="ghost" size="sm">
						<Flag className="mr-2 h-4 w-4" />
						{t("submitReport")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>{t("submitReport")}</DialogTitle>
						<DialogDescription>{t("reportSubmitted")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						{success ? (
							<div className="rounded-md bg-green-50 p-4 text-green-900 dark:bg-green-900/20">
								{t("reportSubmitted")}
							</div>
						) : (
							<>
								<div className="space-y-2">
									<Label htmlFor="reason">{t("reportReason")}</Label>
									<Select
										value={reason}
										onValueChange={(value) => setReason(value as ReportReason)}
										required
									>
										<SelectTrigger>
											<SelectValue placeholder={t("reportReason")} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="spam">{t("spam")}</SelectItem>
											<SelectItem value="inappropriate">
												{t("inappropriate")}
											</SelectItem>
											<SelectItem value="fraud">{t("reportScam")}</SelectItem>
											<SelectItem value="prohibited">
												{t("prohibitedItem")}
											</SelectItem>
											<SelectItem value="harassment">{t("spam")}</SelectItem>
											<SelectItem value="other">{t("otherReason")}</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="description">{t("reportDescription")}</Label>
									<Input
										id="description"
										placeholder={t("reportDescriptionPlaceholder")}
										value={description}
										onChange={(e) => setDescription(e.target.value)}
									/>
								</div>
							</>
						)}
					</div>
					{!success && (
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								{t("cancel")}
							</Button>
							<Button type="submit" disabled={isLoading || !reason}>
								{isLoading ? t("submitting") : t("submitReport")}
							</Button>
						</DialogFooter>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
