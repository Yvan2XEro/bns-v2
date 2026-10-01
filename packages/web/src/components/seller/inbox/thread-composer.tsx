"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useChatClient } from "~/hooks/use-chat-client";

const composerSchema = z.object({
	content: z.string().trim().min(1).max(4000),
});

type ComposerValues = z.infer<typeof composerSchema>;

export function ThreadComposer({ conversationId }: { conversationId: string }) {
	const t = useTranslations("Inbox");
	const { chatClient } = useChatClient();
	const { register, handleSubmit, reset, formState, setError } =
		useForm<ComposerValues>({
			resolver: zodResolver(composerSchema),
			defaultValues: { content: "" },
		});

	const onSubmit = handleSubmit((values) => {
		if (!chatClient) {
			setError("root", { message: t("composerPlaceholder") });
			return;
		}
		try {
			chatClient.sendMessage({ conversationId, content: values.content });
			reset();
		} catch {
			setError("root", { message: t("composerPlaceholder") });
		}
	});

	return (
		<form
			onSubmit={onSubmit}
			className="flex items-center gap-2 border-[#E2E8F0] border-t p-3"
		>
			<Input
				{...register("content")}
				placeholder={t("composerPlaceholder")}
				aria-label={t("composerPlaceholder")}
				autoComplete="off"
			/>
			<Button type="submit" size="icon" disabled={formState.isSubmitting}>
				<Send className="h-4 w-4" />
				<span className="sr-only">{t("send")}</span>
			</Button>
		</form>
	);
}
