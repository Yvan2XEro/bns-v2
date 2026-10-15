"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

export function RotatingText() {
	const t = useTranslations("Home");
	const list = t("rotatingWords");
	const words = useMemo(() => list.split("|"), [list]);
	const [index, setIndex] = useState(0);
	const [displayed, setDisplayed] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);

	useEffect(() => {
		const word = words[index];

		if (!isDeleting && displayed === word) {
			const timeout = setTimeout(() => setIsDeleting(true), 2000);
			return () => clearTimeout(timeout);
		}

		if (isDeleting && displayed === "") {
			setIsDeleting(false);
			setIndex((prev) => (prev + 1) % words.length);
			return;
		}

		const speed = isDeleting ? 50 : 100;
		const timeout = setTimeout(() => {
			setDisplayed(
				isDeleting
					? word.slice(0, displayed.length - 1)
					: word.slice(0, displayed.length + 1),
			);
		}, speed);

		return () => clearTimeout(timeout);
	}, [displayed, isDeleting, index, words]);

	return (
		<>
			{t("whatLookingFor")}
			<span className="mt-1 block text-[#F59E0B]">
				{displayed}
				<span className="ml-0.5 inline-block h-[0.9em] w-[3px] animate-blink bg-[#F59E0B] align-middle" />
			</span>
		</>
	);
}
