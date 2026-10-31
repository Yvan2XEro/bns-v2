"use client";

import {
	Check,
	Download,
	ImageOff,
	Link2,
	LoaderCircle,
	Share2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createCallable } from "react-call";
import { CLOSE_ANIMATION_MS } from "~/components/callable/callable";
import { WhatsAppIcon } from "~/components/icons/whatsapp-icon";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { type CardSubject, cardPath } from "~/lib/share-card/formats";
import { cardFileName, networkShareUrl, webShareLink } from "~/lib/share-links";

export type ShareDialogProps = CardSubject & { title: string };

const ROW =
	"flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left text-sm hover:bg-subtle disabled:opacity-50";

/** Facebook, X and LinkedIn marks, drawn: lucide carries no brand logos. */
function Mark({ letter, color }: { letter: string; color: string }) {
	return (
		<span
			aria-hidden="true"
			className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-sm text-white"
			style={{ backgroundColor: color }}
		>
			{letter}
		</span>
	);
}

function Icon({ children }: { children: ReactNode }) {
	return (
		<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-mid">
			{children}
		</span>
	);
}

/**
 * The story card, generated on demand (a second or two the first time): a
 * spinner until it has loaded, never its alt text in an empty frame.
 */
function CardPreview({ src, alt }: { src: string; alt: string }) {
	const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
	const ref = useRef<HTMLImageElement>(null);
	// A card already cached can finish before React attaches onLoad.
	useEffect(() => {
		if (ref.current?.complete && ref.current.naturalWidth > 0)
			setState("ready");
	}, []);

	return (
		<div className="relative h-48 w-[108px] shrink-0 overflow-hidden rounded-lg bg-subtle">
			{/* biome-ignore lint/performance/noImgElement: the card is a generated JPEG served by this site */}
			<img
				ref={ref}
				src={src}
				alt={alt}
				width={108}
				height={192}
				onLoad={() => setState("ready")}
				onError={() => setState("failed")}
				className={`h-full w-full object-cover transition-opacity duration-200 ${state === "ready" ? "opacity-100" : "opacity-0"}`}
			/>
			{state !== "ready" && (
				<div
					aria-hidden="true"
					className="absolute inset-0 flex items-center justify-center text-ink-faint"
				>
					{state === "loading" ? (
						<LoaderCircle className="h-6 w-6 animate-spin" />
					) : (
						<ImageOff className="h-6 w-6" />
					)}
				</div>
			)}
		</div>
	);
}

/**
 * The website's share dialog for a listing or a shop, behind the share
 * cards switch: on a phone the card goes to the system share sheet as a
 * picture (WhatsApp Status, a story, any app); WhatsApp, Facebook, X and
 * LinkedIn open their own share page with the link (previewed by its card);
 * the story and square cards download for a post made by hand; the link
 * copies. Every link says where it was shared.
 */
export const ShareDialog = createCallable<ShareDialogProps, void>(
	({ call, title, ...subject }) => {
		const t = useTranslations("ShareDialog");
		const locale = useLocale();
		const lang = locale === "en" ? "en" : "fr";
		const [origin, setOrigin] = useState("");
		const [canShareFiles, setCanShareFiles] = useState(false);
		const [busy, setBusy] = useState(false);
		const [copied, setCopied] = useState(false);
		const card = (format: "story" | "square") =>
			`${cardPath(subject, format)}?lang=${lang}`;

		useEffect(() => {
			setOrigin(window.location.origin);
			const probe = new File([""], "probe.jpg", { type: "image/jpeg" });
			setCanShareFiles(
				typeof navigator.canShare === "function" &&
					navigator.canShare({ files: [probe] }),
			);
		}, []);

		// The card as a file to the system share sheet: what puts it in a
		// WhatsApp Status or a story from a phone's browser.
		const shareCard = async () => {
			setBusy(true);
			try {
				const response = await fetch(card("story"));
				if (!response.ok) throw new Error(String(response.status));
				const file = new File(
					[await response.blob()],
					cardFileName(subject, "story"),
					{ type: "image/jpeg" },
				);
				const link = webShareLink(origin, subject, "files");
				await navigator.share({
					files: [file],
					title,
					text: `${title}\n${link}`,
				});
				call.end();
			} catch (error) {
				// Closing the sheet is a choice; anything else falls back to the link.
				if (!(error instanceof DOMException && error.name === "AbortError")) {
					await navigator
						.share({ title, url: webShareLink(origin, subject, "files") })
						.catch(() => {});
				}
			} finally {
				setBusy(false);
			}
		};

		const open = (network: "whatsapp" | "facebook" | "x" | "linkedin") => {
			window.open(
				networkShareUrl(network, webShareLink(origin, subject, network), title),
				"_blank",
				"noopener,noreferrer",
			);
		};

		const copy = async () => {
			try {
				await navigator.clipboard.writeText(
					webShareLink(origin, subject, "copy"),
				);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			} catch {
				window.prompt(t("copyPrompt"), webShareLink(origin, subject, "copy"));
			}
		};

		return (
			<Dialog
				open={!call.ended}
				onOpenChange={(next) => {
					if (!next) call.end();
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>{t("title")}</DialogTitle>
						<DialogDescription className="line-clamp-2">
							{title}
						</DialogDescription>
					</DialogHeader>
					<div className="flex gap-4">
						<CardPreview src={card("story")} alt={t("previewAlt")} />
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							{canShareFiles && (
								<button
									type="button"
									onClick={() => void shareCard()}
									disabled={busy || !origin}
									className={ROW}
								>
									<Icon>
										<Share2 className="h-4 w-4" />
									</Icon>
									<span>
										<span className="block font-semibold text-ink">
											{t("shareCard")}
										</span>
										<span className="block text-ink-muted text-xs">
											{t("shareCardHint")}
										</span>
									</span>
								</button>
							)}
							<a
								href={card("story")}
								download={cardFileName(subject, "story")}
								className={ROW}
							>
								<Icon>
									<Download className="h-4 w-4" />
								</Icon>
								<span>
									<span className="block font-semibold text-ink">
										{t("downloadStory")}
									</span>
									<span className="block text-ink-muted text-xs">
										{t("downloadStoryHint")}
									</span>
								</span>
							</a>
							<a
								href={card("square")}
								download={cardFileName(subject, "square")}
								className={ROW}
							>
								<Icon>
									<Download className="h-4 w-4" />
								</Icon>
								<span>
									<span className="block font-semibold text-ink">
										{t("downloadSquare")}
									</span>
									<span className="block text-ink-muted text-xs">
										{t("downloadSquareHint")}
									</span>
								</span>
							</a>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							onClick={() => open("whatsapp")}
							className={ROW}
						>
							<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/10">
								<WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
							</span>
							WhatsApp
						</button>
						<button
							type="button"
							onClick={() => open("facebook")}
							className={ROW}
						>
							<Mark letter="f" color="#1877F2" />
							Facebook
						</button>
						<button type="button" onClick={() => open("x")} className={ROW}>
							<Mark letter="X" color="#0f172a" />X
						</button>
						<button
							type="button"
							onClick={() => open("linkedin")}
							className={ROW}
						>
							<Mark letter="in" color="#0A66C2" />
							LinkedIn
						</button>
					</div>
					<button type="button" onClick={() => void copy()} className={ROW}>
						<Icon>
							{copied ? (
								<Check className="h-4 w-4 text-emerald-500" />
							) : (
								<Link2 className="h-4 w-4" />
							)}
						</Icon>
						<span className="font-semibold text-ink">
							{copied ? t("copied") : t("copyLink")}
						</span>
					</button>
				</DialogContent>
			</Dialog>
		);
	},
	CLOSE_ANIMATION_MS,
);
