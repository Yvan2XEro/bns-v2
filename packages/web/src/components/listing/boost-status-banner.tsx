"use client";

import { CheckCircle, Clock, X, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Props {
	status: string | undefined;
}

export function BoostStatusBanner({ status }: Props) {
	const t = useTranslations("Listing");
	const [visible, setVisible] = useState(!!status);

	useEffect(() => {
		if (status) setVisible(true);
	}, [status]);

	if (!visible || !status) return null;

	const isSuccess = status === "success";
	const isPending = status === "pending";

	const colorClasses = isSuccess
		? "border-green-200 bg-green-50 text-green-800"
		: isPending
			? "border-amber-200 bg-amber-50 text-amber-800"
			: "border-red-200 bg-red-50 text-red-800";

	const message = isSuccess
		? t("boostSuccess")
		: isPending
			? t("boostPending")
			: t("boostFailed");

	const Icon = isSuccess ? CheckCircle : isPending ? Clock : XCircle;

	return (
		<div
			className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 ${colorClasses}`}
		>
			<Icon className="mt-0.5 h-5 w-5 shrink-0" />
			<span className="flex-1 font-medium text-sm">{message}</span>
			<button
				type="button"
				onClick={() => setVisible(false)}
				className="shrink-0 opacity-60 hover:opacity-100"
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	);
}
