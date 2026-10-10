"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { acceptCountdown } from "./seller-orders";

/** A clock that ticks once a minute, which is the countdown's resolution. */
function useMinuteClock(): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

const URGENT_HOURS = 6;

export function AcceptCountdown({ acceptBy }: { acceptBy: string | null }) {
	const t = useTranslations("SellerOrders");
	const countdown = acceptCountdown(acceptBy, useMinuteClock());

	if (!countdown) return <span className="text-[#94A3B8]">—</span>;
	if (countdown.expired) {
		return (
			<span className="font-medium text-[#B91C1C]">
				{t("countdownExpired")}
			</span>
		);
	}
	return (
		<time
			dateTime={acceptBy ?? undefined}
			className={cn(
				"font-medium",
				countdown.hours < URGENT_HOURS ? "text-[#B45309]" : "text-[#0F172A]",
			)}
		>
			{t("countdown", { hours: countdown.hours, minutes: countdown.minutes })}
		</time>
	);
}
