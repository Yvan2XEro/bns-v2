import { AlertTriangle, ArrowLeft, Home, Search } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "~/components/ui/button";

export default async function ListingNotFound() {
	const t = await getTranslations("Listing");

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<div className="border-[#E2E8F0] border-b bg-white">
				<div className="container mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 text-[#64748B] text-sm sm:px-6 lg:px-8">
					<Link
						href="/search"
						className="flex items-center gap-1 hover:text-[#1E40AF]"
					>
						<ArrowLeft className="h-4 w-4" />
						{t("backToResults")}
					</Link>
				</div>
			</div>

			<div className="container mx-auto flex max-w-7xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
				<div className="w-full max-w-3xl rounded-3xl border border-[#E2E8F0] bg-white p-8 shadow-sm sm:p-10">
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EFF6FF]">
						<AlertTriangle className="h-8 w-8 text-[#1E40AF]" />
					</div>
					<div className="mt-6 text-center">
						<h1 className="font-bold text-3xl text-[#0F172A]">
							{t("notFoundTitle")}
						</h1>
						<p className="mx-auto mt-3 max-w-2xl text-[#64748B]">
							{t("notFoundDescription")}
						</p>
					</div>

					<div className="mt-8 rounded-2xl bg-[#F8FAFC] p-5">
						<h2 className="font-semibold text-[#0F172A] text-sm uppercase tracking-wide">
							{t("notFoundReasonsTitle")}
						</h2>
						<ul className="mt-4 space-y-3 text-[#475569] text-sm leading-6">
							<li>{t("notFoundReasonPending")}</li>
							<li>{t("notFoundReasonSold")}</li>
							<li>{t("notFoundReasonExpired")}</li>
							<li>{t("notFoundReasonModeration")}</li>
							<li>{t("notFoundReasonRemoved")}</li>
						</ul>
					</div>

					<div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
						<Button
							asChild
							className="rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]"
						>
							<Link href="/search">
								<Search className="mr-2 h-4 w-4" />
								{t("browseOtherListings")}
							</Link>
						</Button>
						<Button asChild variant="outline" className="rounded-xl">
							<Link href="/">
								<Home className="mr-2 h-4 w-4" />
								{t("backHome")}
							</Link>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
