"use client";

import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function ErrorPage({
	error: err,
	reset,
}: {
	error: globalThis.Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
			<div className="text-center">
				<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF3C7]">
					<AlertTriangle className="h-8 w-8 text-[#F59E0B]" />
				</div>
				<h1 className="font-bold text-2xl text-[#0F172A]">
					Something went wrong
				</h1>
				<p className="mt-2 max-w-md text-[#64748B]">
					An unexpected error occurred. Please try again or return to the home
					page.
				</p>
				{err.digest && (
					<p className="mt-2 font-mono text-[#94A3B8] text-xs">
						Error ID: {err.digest}
					</p>
				)}
				<div className="mt-8 flex items-center justify-center gap-4">
					<button
						type="button"
						onClick={reset}
						className="inline-flex items-center gap-2 rounded-xl bg-[#1E40AF] px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-[#1E3A8A]"
					>
						<RefreshCw className="h-4 w-4" />
						Try again
					</button>
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-2.5 font-medium text-[#0F172A] text-sm transition-colors hover:bg-[#F8FAFC]"
					>
						<Home className="h-4 w-4" />
						Back to home
					</Link>
				</div>
			</div>
		</div>
	);
}
