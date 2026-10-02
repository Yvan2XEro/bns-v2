export type LaunchCityKey = "douala" | "yaounde";

export interface LaunchCity {
	key: LaunchCityKey;
	label: string;
	defaultDeliveryFee: number;
	/** District slugs, without the city prefix. P7 reuses them for zones. */
	districts: readonly string[];
}

const DOUALA_DISTRICTS = [
	"akwa",
	"bonanjo",
	"bonapriso",
	"bali",
	"deido",
	"bonaberi",
	"bepanda",
	"makepe",
	"bonamoussadi",
	"kotto",
	"logbessou",
	"logpom",
	"ndokoti",
	"new-bell",
	"nyalla",
	"pk8-pk14",
	"yassa",
	"village",
	"japoma",
	"bonadibong",
] as const;

const YAOUNDE_DISTRICTS = [
	"bastos",
	"centre-ville",
	"mvog-mbi",
	"essos",
	"mokolo",
	"biyem-assi",
	"mendong",
	"nkolbisson",
	"ngousso",
	"omnisport",
	"emana",
	"etoudi",
	"nsimeyong",
	"odza",
	"mimboman",
	"ekounou",
	"melen",
	"nlongkak",
	"mvan",
	"efoulan",
] as const;

/** Display labels, accents included; the slug is what is stored. */
const DISTRICT_LABELS: Record<string, string> = {
	"douala.akwa": "Akwa",
	"douala.bonanjo": "Bonanjo",
	"douala.bonapriso": "Bonapriso",
	"douala.bali": "Bali",
	"douala.deido": "Deïdo",
	"douala.bonaberi": "Bonabéri",
	"douala.bepanda": "Bépanda",
	"douala.makepe": "Makepe",
	"douala.bonamoussadi": "Bonamoussadi",
	"douala.kotto": "Kotto",
	"douala.logbessou": "Logbessou",
	"douala.logpom": "Logpom",
	"douala.ndokoti": "Ndokoti",
	"douala.new-bell": "New Bell",
	"douala.nyalla": "Nyalla",
	"douala.pk8-pk14": "PK8–PK14",
	"douala.yassa": "Yassa",
	"douala.village": "Village",
	"douala.japoma": "Japoma",
	"douala.bonadibong": "Bonadibong",
	"yaounde.bastos": "Bastos",
	"yaounde.centre-ville": "Centre-ville",
	"yaounde.mvog-mbi": "Mvog-Mbi",
	"yaounde.essos": "Essos",
	"yaounde.mokolo": "Mokolo",
	"yaounde.biyem-assi": "Biyem-Assi",
	"yaounde.mendong": "Mendong",
	"yaounde.nkolbisson": "Nkolbisson",
	"yaounde.ngousso": "Ngousso",
	"yaounde.omnisport": "Omnisport",
	"yaounde.emana": "Emana",
	"yaounde.etoudi": "Etoudi",
	"yaounde.nsimeyong": "Nsimeyong",
	"yaounde.odza": "Odza",
	"yaounde.mimboman": "Mimboman",
	"yaounde.ekounou": "Ekounou",
	"yaounde.melen": "Melen",
	"yaounde.nlongkak": "Nlongkak",
	"yaounde.mvan": "Mvan",
	"yaounde.efoulan": "Efoulan",
};

export const LAUNCH_CITIES: Record<LaunchCityKey, LaunchCity> = {
	douala: {
		key: "douala",
		label: "Douala",
		defaultDeliveryFee: 2000,
		districts: DOUALA_DISTRICTS,
	},
	yaounde: {
		key: "yaounde",
		label: "Yaoundé",
		defaultDeliveryFee: 3500,
		districts: YAOUNDE_DISTRICTS,
	},
};

export const LAUNCH_CITY_KEYS: readonly LaunchCityKey[] = ["douala", "yaounde"];

export function isLaunchCityKey(value: unknown): value is LaunchCityKey {
	return typeof value === "string" && value in LAUNCH_CITIES;
}

export function districtKeysOf(city: LaunchCityKey): readonly string[] {
	return LAUNCH_CITIES[city].districts.map((slug) => `${city}.${slug}`);
}

/** `{city}.other` is always accepted; it carries a free-text `districtOther`. */
export function isDistrictKey(city: LaunchCityKey, key: string): boolean {
	return key === `${city}.other` || districtKeysOf(city).includes(key);
}

export function districtLabel(key: string): string | null {
	if (key.endsWith(".other")) {
		const [city] = key.split(".");
		return isLaunchCityKey(city) ? "Autre" : null;
	}
	return DISTRICT_LABELS[key] ?? null;
}
