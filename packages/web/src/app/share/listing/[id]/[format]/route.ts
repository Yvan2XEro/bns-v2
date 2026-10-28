import { listingCard } from "~/lib/share-card/load";
import { cardResponse } from "~/lib/share-card/render";

/** A listing's share image: /share/listing/:id/(og|story|square). */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string; format: string }> },
) {
	const { id, format } = await params;
	return cardResponse(
		request,
		format,
		(shape, locale) => listingCard(id, shape, locale),
		86_400,
	);
}
