import { Home, Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
			<div className="text-center">
				<p className="font-extrabold text-7xl text-[#1E40AF]">404</p>
				<h1 className="mt-4 font-bold text-2xl text-[#0F172A]">
					Page not found
				</h1>
				<p className="mt-2 max-w-md text-[#64748B]">
					Sorry, the page you are looking for does not exist or has been moved.
				</p>
				<div className="mt-8 flex items-center justify-center gap-4">
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-xl bg-[#1E40AF] px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-[#1E3A8A]"
					>
						<Home className="h-4 w-4" />
						Back to home
					</Link>
					<Link
						href="/search"
						className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-2.5 font-medium text-[#0F172A] text-sm transition-colors hover:bg-[#F8FAFC]"
					>
						<Search className="h-4 w-4" />
						Search
					</Link>
				</div>
			</div>
		</div>
	);
}
