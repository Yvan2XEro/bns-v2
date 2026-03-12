import { LogoLoader } from "~/components/ui/logo-loader";

export default function ListingLoading() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<LogoLoader text="Loading listing..." />
		</div>
	);
}
