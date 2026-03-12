"use client";

import Image from "next/image";

interface LogoLoaderProps {
	size?: "sm" | "md" | "lg";
	text?: string;
}

export function LogoLoader({ size = "md", text }: LogoLoaderProps) {
	const sizes = {
		sm: { logo: 32, ring: 48, text: "text-xs" },
		md: { logo: 48, ring: 72, text: "text-sm" },
		lg: { logo: 64, ring: 96, text: "text-base" },
	};

	const s = sizes[size];

	return (
		<div className="flex flex-col items-center justify-center gap-4">
			{/* Logo with animated ring */}
			<div className="relative" style={{ width: s.ring, height: s.ring }}>
				{/* Spinning ring */}
				<svg
					aria-hidden="true"
					className="logo-loader-ring absolute inset-0"
					width={s.ring}
					height={s.ring}
					viewBox="0 0 72 72"
				>
					<circle
						cx="36"
						cy="36"
						r="33"
						fill="none"
						stroke="#E2E8F0"
						strokeWidth="3"
					/>
					<circle
						cx="36"
						cy="36"
						r="33"
						fill="none"
						stroke="url(#loader-gradient)"
						strokeWidth="3"
						strokeLinecap="round"
						strokeDasharray="120 207"
						className="logo-loader-arc"
					/>
					<defs>
						<linearGradient
							id="loader-gradient"
							x1="0%"
							y1="0%"
							x2="100%"
							y2="0%"
						>
							<stop offset="0%" stopColor="#1E40AF" />
							<stop offset="100%" stopColor="#F59E0B" />
						</linearGradient>
					</defs>
				</svg>

				{/* Logo (pulsing) */}
				<div className="logo-loader-pulse absolute inset-0 flex items-center justify-center">
					<Image
						src="/logo.png"
						alt="Loading"
						width={s.logo}
						height={s.logo}
						className="object-contain"
						priority
					/>
				</div>
			</div>

			{/* Optional text */}
			{text && (
				<p className={`${s.text} logo-loader-text font-medium text-[#64748B]`}>
					{text}
				</p>
			)}
		</div>
	);
}
