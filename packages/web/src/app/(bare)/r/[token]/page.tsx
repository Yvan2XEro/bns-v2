import { RiderClient } from "./rider-client";

export default async function RiderPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return <RiderClient token={token} />;
}
