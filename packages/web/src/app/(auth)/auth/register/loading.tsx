import { AuthCardSkeleton } from "~/components/auth/auth-card";

export default function Loading() {
	return <AuthCardSkeleton fields={4} social formExtra />;
}
