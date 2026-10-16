import {
	Armchair,
	Baby,
	Bike,
	BookOpen,
	Briefcase,
	Building,
	Car,
	CarFront,
	Cpu,
	Dumbbell,
	Flower,
	Gamepad2,
	House,
	Laptop,
	type LucideIcon,
	Monitor,
	Mountain,
	Package,
	Plane,
	Refrigerator,
	Shirt,
	Smartphone,
	Sofa,
	Store,
	Truck,
	Watch,
	Wrench,
} from "lucide-react";
import type { Category, Media } from "~/types";

/**
 * Categories store a Lucide icon name (`packages/api/src/seed`); each one the
 * seed and the category catch-up use is mapped here, so the picker never
 * prints the bare name and the bundle carries only these icons.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
	armchair: Armchair,
	baby: Baby,
	bike: Bike,
	"book-open": BookOpen,
	briefcase: Briefcase,
	building: Building,
	car: Car,
	"car-front": CarFront,
	cpu: Cpu,
	dumbbell: Dumbbell,
	flower: Flower,
	"gamepad-2": Gamepad2,
	home: House,
	house: House,
	laptop: Laptop,
	monitor: Monitor,
	mountain: Mountain,
	package: Package,
	plane: Plane,
	refrigerator: Refrigerator,
	shirt: Shirt,
	smartphone: Smartphone,
	sofa: Sofa,
	store: Store,
	truck: Truck,
	watch: Watch,
	wrench: Wrench,
};

interface CategoryIconProps {
	category: Pick<Category, "name" | "icon"> & { image?: Category["image"] };
	/** An image URL already resolved by the caller; wins over `category.image`. */
	imageUrl?: string | null;
	/** Beside the category's written name: hidden from assistive tech. */
	decorative?: boolean;
	size?: number;
	className?: string;
}

function getCategoryImage(
	category: CategoryIconProps["category"],
): string | null {
	if (!category.image) return null;
	if (typeof category.image === "string") return null;
	return (category.image as Media).url ?? null;
}

export function CategoryIcon({
	category,
	imageUrl: resolved,
	decorative = false,
	size = 48,
	className,
}: CategoryIconProps) {
	const imageUrl = resolved ?? getCategoryImage(category);

	if (imageUrl) {
		return (
			<div
				className={`overflow-hidden rounded-full ${className ?? ""}`}
				style={{ width: size, height: size }}
			>
				{/* biome-ignore lint/performance/noImgElement: simple category thumbnail */}
				<img
					src={imageUrl}
					alt={decorative ? "" : category.name}
					width={size}
					height={size}
					className="h-full w-full object-cover"
				/>
			</div>
		);
	}

	const Icon = category.icon ? CATEGORY_ICONS[category.icon] : undefined;
	// Admin-entered icons that are not one of ours: an emoji still reads as
	// one; anything else (a name we do not map) falls back to the package.
	const emoji =
		!Icon && category.icon && !/^[a-z0-9-]+$/.test(category.icon)
			? category.icon
			: null;
	const Glyph = Icon ?? Package;

	return (
		<div
			className={`flex items-center justify-center rounded-full bg-brand-soft text-brand ${className ?? ""}`}
			style={{ width: size, height: size }}
			{...(decorative
				? { "aria-hidden": true }
				: { role: "img", "aria-label": category.name })}
		>
			{emoji ? (
				<span style={{ fontSize: size * 0.5 }}>{emoji}</span>
			) : (
				<Glyph size={Math.round(size * 0.46)} strokeWidth={1.75} aria-hidden />
			)}
		</div>
	);
}
