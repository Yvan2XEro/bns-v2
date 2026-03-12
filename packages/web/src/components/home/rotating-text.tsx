"use client";

import { useEffect, useState } from "react";

const words = [
	"a phone",
	"a car",
	"furniture",
	"electronics",
	"fashion",
	"a deal",
];

export function RotatingText() {
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
	}, [displayed, isDeleting, index]);

	return (
		<>
			What are you looking for?
			<span className="block mt-1 text-[#F59E0B]">
				{displayed}
				<span className="inline-block w-[3px] h-[0.9em] ml-0.5 align-middle bg-[#F59E0B] animate-blink" />
			</span>
		</>
	);
}
