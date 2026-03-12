import Image from "next/image";
import Link from "next/link";

export function Footer() {
	return (
		<footer className="border-t border-[#E2E8F0] bg-white">
			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
				<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
					{/* Brand */}
					<div>
						<Link href="/" className="inline-flex items-center gap-2">
							<Image src="/logo.png" alt="Buy'N'Sellem" width={28} height={28} className="h-7 w-7 object-contain" />
							<span className="text-base font-bold text-[#0F172A]">
								Buy<span className="text-[#F59E0B]">&apos;N&apos;</span>Sellem
							</span>
						</Link>
						<p className="mt-3 text-sm leading-relaxed text-[#64748B]">
							The marketplace to buy and sell locally.
						</p>
					</div>

					{/* Marketplace */}
					<div>
						<h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
							Marketplace
						</h3>
						<nav className="flex flex-col gap-2">
							{[
								{ label: "Browse listings", href: "/search" },
								{ label: "Sell an item", href: "/create" },
								{ label: "Categories", href: "/search" },
							].map((link) => (
								<Link
									key={link.label}
									href={link.href}
									className="text-sm text-[#475569] hover:text-[#1E40AF]"
								>
									{link.label}
								</Link>
							))}
						</nav>
					</div>

					{/* Support */}
					<div>
						<h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
							Support
						</h3>
						<nav className="flex flex-col gap-2">
							{[
								{ label: "Help center", href: "/help" },
								{ label: "Safety tips", href: "/safety" },
								{ label: "Contact us", href: "/contact" },
							].map((link) => (
								<Link
									key={link.label}
									href={link.href}
									className="text-sm text-[#475569] hover:text-[#1E40AF]"
								>
									{link.label}
								</Link>
							))}
						</nav>
					</div>

					{/* Legal */}
					<div>
						<h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
							Legal
						</h3>
						<nav className="flex flex-col gap-2">
							{[
								{ label: "Terms of service", href: "/terms" },
								{ label: "Privacy policy", href: "/privacy" },
								{ label: "Cookie policy", href: "/cookies" },
							].map((link) => (
								<Link
									key={link.label}
									href={link.href}
									className="text-sm text-[#475569] hover:text-[#1E40AF]"
								>
									{link.label}
								</Link>
							))}
						</nav>
					</div>
				</div>

				{/* App Download */}
				<div className="mt-8 border-t border-[#E2E8F0] pt-6">
					<div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
						<div>
							<p className="text-sm font-semibold text-[#0F172A]">Get the app</p>
							<p className="mt-0.5 text-xs text-[#64748B]">Buy and sell on the go</p>
						</div>
						<div className="flex items-center gap-3">
							<a
								href="https://apps.apple.com"
								target="_blank"
								rel="noopener noreferrer"
								className="flex h-10 items-center gap-2 rounded-lg bg-[#0F172A] px-4 transition-opacity hover:opacity-90"
							>
								<svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
									<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
								</svg>
								<div className="text-left">
									<p className="text-[8px] leading-none text-white/70">Download on the</p>
									<p className="text-xs font-semibold leading-tight text-white">App Store</p>
								</div>
							</a>
							<a
								href="https://play.google.com"
								target="_blank"
								rel="noopener noreferrer"
								className="flex h-10 items-center gap-2 rounded-lg bg-[#0F172A] px-4 transition-opacity hover:opacity-90"
							>
								<svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
									<path d="M3.18 23.49c.27.16.57.24.87.24.28 0 .55-.07.81-.2L20.2 13.3a1.62 1.62 0 000-2.83L4.86.25A1.62 1.62 0 002.56 1.6v20.56c0 .6.33 1.16.82 1.45l-.2-.12zM6 3.54l7.34 7.67L6 18.87V3.54zm8.28 8.63l2.97-3.1 3.28 1.81-3.28 1.81-2.97-3.1v2.58z"/>
								</svg>
								<div className="text-left">
									<p className="text-[8px] leading-none text-white/70">Get it on</p>
									<p className="text-xs font-semibold leading-tight text-white">Google Play</p>
								</div>
							</a>
						</div>
					</div>
				</div>

				<div className="mt-6 border-t border-[#E2E8F0] pt-6">
					<p className="text-center text-xs text-[#94A3B8]">
						&copy; {new Date().getFullYear()} Buy&apos;N&apos;Sellem. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
}
