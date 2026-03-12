import { LogoLoader } from "~/components/ui/logo-loader";

export default function MessagesLoading() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<LogoLoader text="Loading messages..." />
		</div>
	);
}
