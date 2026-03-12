import { LogoLoader } from "~/components/ui/logo-loader";

export default function ProfileLoading() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<LogoLoader text="Loading profile..." />
		</div>
	);
}
