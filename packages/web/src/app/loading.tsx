import { LogoLoader } from "~/components/ui/logo-loader";

export default function Loading() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<LogoLoader size="lg" text="Loading..." />
		</div>
	);
}
