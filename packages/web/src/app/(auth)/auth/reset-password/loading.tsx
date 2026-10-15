import { AuthCardSkeleton } from "~/components/auth/auth-card";

export default function Loading() {
	return <AuthCardSkeleton fields={2} footer={false} />;
}
