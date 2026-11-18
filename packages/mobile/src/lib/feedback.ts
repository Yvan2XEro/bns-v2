import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

/**
 * The app's micro-feedback: a haptic, and a short balafon strike when the
 * user has interface sounds on. One call per meaningful moment — a saved
 * favourite, a sent message, a published listing — never per tap.
 *
 * Sounds respect the iOS silent switch, mix with whatever else is playing,
 * and fail silent: a build without the audio module still gets its haptics.
 */
export type FeedbackKind =
	| "tap"
	| "pop"
	| "send"
	| "receive"
	| "success"
	| "error"
	| "notice";

export const SOUNDS_STORAGE_KEY = "app_ui_sounds";

const SOURCES = {
	pop: require("@/assets/sounds/pop.wav"),
	send: require("@/assets/sounds/send.wav"),
	receive: require("@/assets/sounds/receive.wav"),
	success: require("@/assets/sounds/success.wav"),
	error: require("@/assets/sounds/error.wav"),
	notice: require("@/assets/sounds/notice.wav"),
} as const;

type SoundKind = keyof typeof SOURCES;

interface Player {
	seekTo: (seconds: number) => unknown;
	play: () => void;
	volume: number;
}

let soundsEnabled = true;
let audio: {
	createAudioPlayer: (source: number) => Player;
	setAudioModeAsync: (mode: Record<string, unknown>) => Promise<void>;
} | null = null;
let audioReady: Promise<boolean> | null = null;
const players = new Map<SoundKind, Player>();

/** Loads the stored preference; called once at startup. */
export async function loadFeedbackPreferences(): Promise<boolean> {
	try {
		const stored = await AsyncStorage.getItem(SOUNDS_STORAGE_KEY);
		soundsEnabled = stored !== "off";
	} catch {
		soundsEnabled = true;
	}
	return soundsEnabled;
}

export function areSoundsEnabled(): boolean {
	return soundsEnabled;
}

export async function setSoundsEnabled(on: boolean): Promise<void> {
	soundsEnabled = on;
	await AsyncStorage.setItem(SOUNDS_STORAGE_KEY, on ? "on" : "off");
	if (on) play("pop");
}

function prepareAudio(): Promise<boolean> {
	if (audioReady) return audioReady;
	audioReady = (async () => {
		try {
			// Required lazily: a dev client built before expo-audio was added has
			// no native module, and a top-level import would crash it at launch.
			audio = require("expo-audio");
			await audio?.setAudioModeAsync({
				playsInSilentMode: false,
				interruptionMode: "mixWithOthers",
				shouldPlayInBackground: false,
			});
			return true;
		} catch {
			audio = null;
			return false;
		}
	})();
	return audioReady;
}

async function play(kind: SoundKind) {
	if (!soundsEnabled) return;
	if (!(await prepareAudio()) || !audio) return;
	try {
		let player = players.get(kind);
		if (!player) {
			player = audio.createAudioPlayer(SOURCES[kind]);
			player.volume = 0.6;
			players.set(kind, player);
		}
		player.seekTo(0);
		player.play();
	} catch {
		// A sound is a courtesy; never let it break the action it decorates.
	}
}

function haptic(kind: FeedbackKind) {
	const run = () => {
		switch (kind) {
			case "tap":
				return Haptics.selectionAsync();
			case "pop":
			case "send":
				return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			case "receive":
				return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
			case "success":
				return Haptics.notificationAsync(
					Haptics.NotificationFeedbackType.Success,
				);
			case "error":
				return Haptics.notificationAsync(
					Haptics.NotificationFeedbackType.Error,
				);
			case "notice":
				return Haptics.notificationAsync(
					Haptics.NotificationFeedbackType.Warning,
				);
		}
	};
	run()?.catch(() => {});
}

/** Plays the haptic, and the sound when there is one for this moment. */
export function feedback(kind: FeedbackKind, { sound = true } = {}) {
	haptic(kind);
	if (sound && kind !== "tap") void play(kind);
}
