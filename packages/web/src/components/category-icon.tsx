import {
	Accessibility,
	Activity,
	Armchair,
	Baby,
	Backpack,
	Bandage,
	Bath,
	BatteryCharging,
	Bed,
	BedDouble,
	Beef,
	Bike,
	Bird,
	Bone,
	BookOpen,
	BrickWall,
	Briefcase,
	BriefcaseBusiness,
	Brush,
	Building,
	CalendarDays,
	Camera,
	Car,
	CarFront,
	Carrot,
	Cctv,
	ChefHat,
	Circle,
	Construction,
	Cookie,
	CookingPot,
	Cpu,
	Dog,
	DoorOpen,
	Drill,
	Droplet,
	Droplets,
	Dumbbell,
	Factory,
	Fence,
	Files,
	Fish,
	FlaskConical,
	Flower,
	Footprints,
	Forklift,
	Gamepad2,
	GitBranch,
	GraduationCap,
	Hammer,
	HardDrive,
	Headphones,
	Heart,
	HeartPulse,
	House,
	Keyboard,
	KeyRound,
	Lamp,
	LampDesk,
	Laptop,
	Layers,
	LibraryBig,
	type LucideIcon,
	Monitor,
	Mountain,
	Music,
	Music2,
	NotebookPen,
	Package,
	Paintbrush,
	Palette,
	PanelsTopLeft,
	PartyPopper,
	PawPrint,
	Plane,
	Plug,
	Printer,
	Projector,
	Puzzle,
	Rabbit,
	Refrigerator,
	Router,
	Satellite,
	Scale,
	ScanBarcode,
	Scissors,
	Shield,
	ShieldCheck,
	Shirt,
	Smartphone,
	Snowflake,
	Sofa,
	Sparkles,
	Speaker,
	SprayCan,
	Sprout,
	Store,
	Sun,
	Tent,
	Tractor,
	TreePalm,
	Truck,
	UserRound,
	Wallet,
	Warehouse,
	Watch,
	Waves,
	Wheat,
	Wifi,
	Wrench,
	Zap,
} from "lucide-react";
import type { Category, Media } from "~/types";

/**
 * Categories store a Lucide icon name (`packages/api/src/seed`); each one the
 * seed and the category catch-up use is mapped here, so the picker never
 * prints the bare name and the bundle carries only these icons.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
	accessibility: Accessibility,
	activity: Activity,
	armchair: Armchair,
	baby: Baby,
	backpack: Backpack,
	bandage: Bandage,
	bath: Bath,
	"battery-charging": BatteryCharging,
	bed: Bed,
	"bed-double": BedDouble,
	beef: Beef,
	bike: Bike,
	bird: Bird,
	bone: Bone,
	"book-open": BookOpen,
	"brick-wall": BrickWall,
	briefcase: Briefcase,
	"briefcase-business": BriefcaseBusiness,
	brush: Brush,
	building: Building,
	"calendar-days": CalendarDays,
	camera: Camera,
	car: Car,
	"car-front": CarFront,
	carrot: Carrot,
	cctv: Cctv,
	"chef-hat": ChefHat,
	circle: Circle,
	construction: Construction,
	cookie: Cookie,
	"cooking-pot": CookingPot,
	cpu: Cpu,
	dog: Dog,
	"door-open": DoorOpen,
	drill: Drill,
	droplet: Droplet,
	droplets: Droplets,
	dumbbell: Dumbbell,
	factory: Factory,
	fence: Fence,
	files: Files,
	fish: Fish,
	"flask-conical": FlaskConical,
	flower: Flower,
	footprints: Footprints,
	forklift: Forklift,
	"gamepad-2": Gamepad2,
	"git-branch": GitBranch,
	"graduation-cap": GraduationCap,
	hammer: Hammer,
	"hard-drive": HardDrive,
	headphones: Headphones,
	heart: Heart,
	"heart-pulse": HeartPulse,
	home: House,
	house: House,
	"key-round": KeyRound,
	keyboard: Keyboard,
	lamp: Lamp,
	"lamp-desk": LampDesk,
	laptop: Laptop,
	layers: Layers,
	"library-big": LibraryBig,
	monitor: Monitor,
	mountain: Mountain,
	music: Music,
	"music-2": Music2,
	"notebook-pen": NotebookPen,
	package: Package,
	paintbrush: Paintbrush,
	palette: Palette,
	"panels-top-left": PanelsTopLeft,
	"party-popper": PartyPopper,
	"paw-print": PawPrint,
	plane: Plane,
	plug: Plug,
	printer: Printer,
	projector: Projector,
	puzzle: Puzzle,
	rabbit: Rabbit,
	refrigerator: Refrigerator,
	router: Router,
	satellite: Satellite,
	scale: Scale,
	"scan-barcode": ScanBarcode,
	scissors: Scissors,
	shield: Shield,
	"shield-check": ShieldCheck,
	shirt: Shirt,
	smartphone: Smartphone,
	snowflake: Snowflake,
	sofa: Sofa,
	sparkles: Sparkles,
	speaker: Speaker,
	"spray-can": SprayCan,
	sprout: Sprout,
	store: Store,
	sun: Sun,
	tent: Tent,
	tractor: Tractor,
	"tree-palm": TreePalm,
	truck: Truck,
	"user-round": UserRound,
	wallet: Wallet,
	warehouse: Warehouse,
	watch: Watch,
	waves: Waves,
	wheat: Wheat,
	wifi: Wifi,
	wrench: Wrench,
	zap: Zap,
};

/** The Lucide names a category's `icon` may hold and this site draws. */
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

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
