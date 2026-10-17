import { AlertTriangle, ArrowLeft, Home, Search } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "~/components/ui/button";

export default async function ListingNotFound() {
	const t = await getTranslations("Listing");

	return (
		<div className="min-h-screen bg-canvas">
			<div className="border-line border-b bg-surface">
				<div className="container mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 text-ink-muted text-sm sm:px-6 lg:px-8">
					<Link
						href="/search"
						className="flex items-center gap-1 hover:text-brand"
					>
						<ArrowLeft className="h-4 w-4" />
						{t("backToResults")}
					</Link>
				</div>
			</div>

			<div className="container mx-auto flex max-w-7xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
				<div className="w-full max-w-3xl rounded-3xl border border-line bg-surface p-8 shadow-sm sm:p-10">
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft">
						<AlertTriangle className="h-8 w-8 text-brand" />
					</div>
					<div className="mt-6 text-center">
						<h1 className="font-bold text-3xl text-ink">
							{t("notFoundTitle")}
						</h1>
						<p className="mx-auto mt-3 max-w-2xl text-ink-muted">
							{t("notFoundDescription")}
						</p>
					</div>

					<div className="mt-8 rounded-2xl bg-canvas p-5">
						<h2 className="font-semibold text-ink text-sm uppercase tracking-wide">
							{t("notFoundReasonsTitle")}
						</h2>
						<ul className="mt-4 space-y-3 text-ink-mid text-sm leading-6">
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
							className="rounded-xl bg-brand-fill hover:bg-brand-strong"
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
