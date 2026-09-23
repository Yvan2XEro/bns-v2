"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import type { ProductStatus } from "~/types";

/**
 * Breadcrumb, product name and the save actions. Creating offers the two
 * outcomes the status carries — a draft nobody sees, or a published listing —
 * while an existing product saves with the status its publication card holds.
 */
export function ProductEditorHeader({
	heading,
	isEdit,
	pending,
	onSubmitAs,
}: {
	heading: string;
	isEdit: boolean;
	pending: boolean;
	onSubmitAs: (status: ProductStatus) => void;
}) {
	const t = useTranslations("ProductEditor");
	const spinner = pending ? (
		<LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
	) : null;

	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<p className="text-[#64748B] text-sm">
					<Link href="/seller/catalogue" className="hover:text-[#1E40AF]">
						{t("breadcrumb")}
					</Link>{" "}
					› {heading}
				</p>
				<h1 className="font-bold text-2xl text-[#0F172A]">{heading}</h1>
			</div>
			<div className="flex gap-2">
				{isEdit ? (
					<Button
						type="submit"
						disabled={pending}
						className="bg-[#1E40AF] hover:bg-[#1E3A8A]"
					>
						{spinner}
						{t("save")}
					</Button>
				) : (
					<>
						<Button
							type="button"
							variant="outline"
							onClick={() => onSubmitAs("draft")}
							disabled={pending}
						>
							{t("saveDraft")}
						</Button>
						<Button
							type="button"
							onClick={() => onSubmitAs("active")}
							disabled={pending}
							className="bg-[#1E40AF] hover:bg-[#1E3A8A]"
						>
							{spinner}
							{t("publish")}
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
