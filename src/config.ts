import {
	DEFAULT_TARGET_ID,
	MAX_APPS,
	MAX_APP_NAME,
	MAX_SHORTCUT_NAME,
	ShortcutApp,
	appTargetId,
	findTarget,
	newAppId,
	parseApps,
} from './targets';

/**
 * The settings as data: their shape, how they are read out of data.json, and
 * the few edits the settings tab makes to them. Kept apart from the tab so
 * every rule here can be tested without Obsidian.
 */

export interface EtchSettings {
	/**
	 * The default destination, the one the left half of the button opens: a
	 * route id, `share`, or `app:<id>`. Read it through `resolveTarget`,
	 * since the app it names can be gone.
	 */
	target: string;
	/** Editors reached through a shortcut, in the order the menu lists them. */
	apps: ShortcutApp[];
	debugLogging: boolean;
}

export const DEFAULT_SETTINGS: EtchSettings = {
	target: DEFAULT_TARGET_ID,
	apps: [],
	debugLogging: false,
};

export interface ParsedSettings {
	settings: EtchSettings;
	/** A stored default that names nothing usable, kept for the debug log. */
	rejectedTarget: string | null;
}

function describe(value: unknown): string {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/**
 * data.json is hand-editable, syncs between devices, and can come from a
 * newer or older build, so every field is rebuilt from it rather than spread
 * over the defaults. Upstream and the 0.3 builds stored the default under
 * `route`; it is read when `target` is absent, so an existing choice of
 * Preview survives the update.
 */
export function parseSettings(stored: unknown): ParsedSettings {
	const record = (
		typeof stored === 'object' && stored !== null ? stored : {}
	) as Record<string, unknown>;
	const apps = parseApps(record.apps);
	const storedTarget = record.target ?? record.route;
	const known = findTarget(storedTarget, apps) !== null;
	return {
		settings: {
			target: known ? (storedTarget as string) : DEFAULT_TARGET_ID,
			apps,
			debugLogging: record.debugLogging === true,
		},
		rejectedTarget:
			storedTarget !== undefined && !known ? describe(storedTarget) : null,
	};
}

/** Adds an app at the end of the list. A full list is returned unchanged. */
export function addApp(
	settings: EtchSettings,
	preset: { name: string; shortcut: string },
	random?: () => number,
): EtchSettings {
	if (settings.apps.length >= MAX_APPS) return settings;
	const app: ShortcutApp = {
		id: newAppId(settings.apps, random),
		name: preset.name.slice(0, MAX_APP_NAME),
		shortcut: preset.shortcut.slice(0, MAX_SHORTCUT_NAME),
	};
	return { ...settings, apps: [...settings.apps, app] };
}

/**
 * Removes an app. If it was the default, the default goes back to the Files
 * viewer, so the button never points at something that is no longer there.
 */
export function removeAppAt(settings: EtchSettings, index: number): EtchSettings {
	const removed = settings.apps[index];
	if (!removed) return settings;
	return {
		...settings,
		apps: settings.apps.filter((_, at) => at !== index),
		target:
			settings.target === appTargetId(removed)
				? DEFAULT_TARGET_ID
				: settings.target,
	};
}

export function moveApp(
	settings: EtchSettings,
	from: number,
	to: number,
): EtchSettings {
	const moved = settings.apps[from];
	if (!moved || from === to || to < 0 || to >= settings.apps.length) {
		return settings;
	}
	const apps = settings.apps.filter((_, at) => at !== from);
	apps.splice(to, 0, moved);
	return { ...settings, apps };
}

export type AppField = 'name' | 'shortcut';

/**
 * Changes one field of one app. The value is only cut to length here;
 * whitespace is cleaned where the value is used and on the next load, so
 * what the user typed is what the editor shows when it is opened again.
 */
export function updateApp(
	settings: EtchSettings,
	id: string,
	field: AppField,
	value: string,
): EtchSettings {
	const limit = field === 'name' ? MAX_APP_NAME : MAX_SHORTCUT_NAME;
	return {
		...settings,
		apps: settings.apps.map((app) =>
			app.id === id ? { ...app, [field]: value.slice(0, limit) } : app,
		),
	};
}
