"use client";

import { Phone } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";

interface PhoneRevealProps {
	phone: string;
}

function maskPhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.length < 4) return phone.replace(/./g, "X");
	const first = digits.charAt(0);
	const lastTwo = digits.slice(-2);
	const middleLength = digits.length - 3;
	return `${first}${"X".repeat(Math.min(middleLength, 2))} XXX XX${lastTwo}`;
}

export function PhoneReveal({ phone }: PhoneRevealProps) {
	const [revealed, setRevealed] = useState(false);

	return (
		<div className="flex flex-col gap-2">
			<a
				href={`tel:${phone}`}
				className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#0F172A] text-sm transition-colors hover:bg-[#F1F5F9]"
			>
				<Phone className="h-4 w-4 text-[#16A34A]" />
				{revealed ? phone : maskPhone(phone)}
			</a>
			{!revealed && (
				<Button
					variant="ghost"
					size="sm"
					className="text-[#1E40AF] text-xs hover:text-[#1E3A8A]"
					onClick={() => setRevealed(true)}
				>
					Show number
				</Button>
			)}
		</div>
	);
}
