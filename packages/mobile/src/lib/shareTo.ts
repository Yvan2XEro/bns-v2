import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import Share, { Social } from "react-native-share";
import {
	CHANNEL_CARD,
	cardImageUrl,
	type ShareChannel,
	type ShareSubject,
	shareLink,
	shareMessage,
} from "./shareTargets";

export type ShareOutcome = "shared" | "copied" | "cancelled" | "notInstalled";

/** The card, saved in the cache under a stable name so a second share reuses it. */
async function downloadCard(url: string, name: string): Promise<string> {
	const file = new File(Paths.cache, `${name.replace(/[^\w.-]/g, "_")}.jpg`);
	if (file.exists) file.delete();
	const saved = await File.downloadFileAsync(url, file);
	return saved.uri;
}

/** A dismissed share or an app that is not there, told apart from a failure. */
function outcomeOf(error: unknown): ShareOutcome | null {
	const message = error instanceof Error ? error.message : String(error);
	if (/did not share|cancel/i.test(message)) return "cancelled";
	if (/not installed|no activity|not found|cannot open/i.test(message))
		return "notInstalled";
	return null;
}

/**
 * Shares a listing or a shop to one destination:
 *
 * - WhatsApp Status: the 9:16 card with the title and link as its caption —
 *   WhatsApp opens its picker, "My status" first;
 * - WhatsApp chat: the link alone, whose preview is the generated card;
 * - Instagram and Facebook stories: the card as the story's background,
 *   with the link as its attribution (where the app allows one);
 * - copy the link; or any app through the system sheet, with the card.
 */
export async function shareTo(
	channel: ShareChannel,
	subject: ShareSubject,
	options: { webUrl: string; lang: "fr" | "en"; facebookAppId: string | null },
): Promise<ShareOutcome> {
	const link = shareLink(options.webUrl, subject, channel);
	const message = shareMessage(subject, link);

	if (channel === "copyLink") {
		await Clipboard.setStringAsync(link);
		return "copied";
	}

	try {
		if (channel === "whatsappChat") {
			await Share.shareSingle({ social: Social.Whatsapp, message });
			return "shared";
		}

		const format = CHANNEL_CARD[channel] ?? "square";
		const card = await downloadCard(
			cardImageUrl(options.webUrl, subject, format, options.lang),
			`bns-${subject.kind}-${subject.kind === "listing" ? subject.id : subject.handle}-${format}`,
		);

		if (channel === "whatsappStatus") {
			await Share.shareSingle({
				social: Social.Whatsapp,
				url: card,
				type: "image/jpeg",
				message,
			});
		} else if (
			(channel === "instagramStory" || channel === "facebookStory") &&
			options.facebookAppId
		) {
			await Share.shareSingle({
				social:
					channel === "instagramStory"
						? Social.InstagramStories
						: Social.FacebookStories,
				appId: options.facebookAppId,
				backgroundImage: card,
				attributionURL: link,
			});
		} else {
			await Share.open({
				url: card,
				type: "image/jpeg",
				message,
				failOnCancel: true,
			});
		}
		return "shared";
	} catch (error) {
		const outcome = outcomeOf(error);
		if (outcome) return outcome;
		throw error;
	}
}
