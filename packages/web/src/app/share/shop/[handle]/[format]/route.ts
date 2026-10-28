import { shopCard } from "~/lib/share-card/load";
import { cardResponse } from "~/lib/share-card/render";

/** A shop's share image: /share/shop/:handle/(og|story|square). */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ handle: string; format: string }> },
) {
	const { handle, format } = await params;
	return cardResponse(
		request,
		format,
		(shape, locale) => shopCard(handle, shape, locale),
		3_600,
	);
}
