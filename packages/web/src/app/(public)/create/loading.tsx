import { LogoLoader } from "~/components/ui/logo-loader";

export default function CreateLoading() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<LogoLoader text="Preparing..." />
		</div>
	);
}
