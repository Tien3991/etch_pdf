import type { RouteId } from './routes';

/**
 * Where a handoff can go.
 *
 * Upstream has two destinations, both plain web navigation: the Files viewer
 * and Preview. Those stay exactly as they are, routes and size override
 * included. This file adds the two ways to reach an editor that is neither:
 *
 *   - the share sheet, where iPadOS lists the apps and the user picks one;
 *   - a named app, opened by a shortcut the user makes once in the Shortcuts
 *     app. The plugin runs that shortcut by its documented URL and hands it
 *     the file's vault path.
 *
 * Neither is a link to the editor itself, because none of the editors
 * checked offers one that can open a file living in another app: PDF Expert
 * documents a scheme for its own storage only, and Xodo and PDF Viewer
 * document none. iPadOS gives a webview nothing else to name an app with.
 *
 * Everything here is pure, so the tests can pin it without Obsidian.
 */

/** The two upstream routes, in menu order. A test holds this to ROUTE_IDS. */
export const ROUTE_TARGET_IDS: readonly RouteId[] = ['shareddocuments', 'file'];

export const SHARE_TARGET_ID = 'share';

/** What a new install hands off to, and what an unusable setting falls back to. */
export const DEFAULT_TARGET_ID: RouteId = 'shareddocuments';

const APP_PREFIX = 'app:';

/** An editor reached through a shortcut. */
export interface ShortcutApp {
	/** Stable for the life of the entry; the default-app setting points at it. */
	id: string;
	/** What the user calls the app. Shown on the button and in the menu. */
	name: string;
	/** The shortcut's name in the Shortcuts app. It has to match exactly. */
	shortcut: string;
}

export type Target =
	| { kind: 'route'; id: RouteId; route: RouteId }
	| { kind: 'share'; id: typeof SHARE_TARGET_ID }
	| { kind: 'shortcut'; id: string; app: ShortcutApp };

/**
 * Bounds on what data.json may carry. The file is hand-editable and syncs
 * between devices, and these strings end up in a menu, on a button, and in a
 * URL, so they are cut to size on the way in.
 */
export const MAX_APPS = 12;
export const MAX_APP_NAME = 40;
export const MAX_SHORTCUT_NAME = 100;

const APP_ID = /^[a-z0-9]{1,16}$/;

/** Starting points offered when adding an app. The shortcut is the user's to make. */
export const APP_PRESETS: readonly { name: string; shortcut: string }[] = [
	{ name: 'Xodo', shortcut: 'Open in Xodo' },
	{ name: 'PDF Viewer', shortcut: 'Open in PDF Viewer' },
];

export function appTargetId(app: Pick<ShortcutApp, 'id'>): string {
	return `${APP_PREFIX}${app.id}`;
}

/** Collapses runs of whitespace, trims, and cuts to length. */
export function cleanText(value: string, maxLength: number): string {
	return value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
}

/**
 * The apps a settings file carries, with everything unusable dropped rather
 * than repaired: an entry without a usable id cannot be pointed at, and a
 * second entry with the same id would make the setting ambiguous.
 */
export function parseApps(value: unknown): ShortcutApp[] {
	if (!Array.isArray(value)) return [];
	const apps: ShortcutApp[] = [];
	const seen = new Set<string>();
	for (const entry of value as unknown[]) {
		if (apps.length >= MAX_APPS) break;
		if (typeof entry !== 'object' || entry === null) continue;
		const record = entry as Record<string, unknown>;
		const { id, name, shortcut } = record;
		if (typeof id !== 'string' || !APP_ID.test(id) || seen.has(id)) continue;
		seen.add(id);
		apps.push({
			id,
			name: typeof name === 'string' ? cleanText(name, MAX_APP_NAME) : '',
			shortcut:
				typeof shortcut === 'string'
					? cleanText(shortcut, MAX_SHORTCUT_NAME)
					: '',
		});
	}
	return apps;
}

/**
 * A fresh id. The random source is a parameter so the tests can drive the
 * collision path, which six base-36 characters make unreachable by chance.
 */
export function newAppId(
	existing: readonly Pick<ShortcutApp, 'id'>[],
	random: () => number = Math.random,
): string {
	const taken = new Set(existing.map((app) => app.id));
	for (let attempt = 0; attempt < 50; attempt++) {
		const id = Math.floor(random() * 36 ** 6)
			.toString(36)
			.padStart(6, '0');
		if (APP_ID.test(id) && !taken.has(id)) return id;
	}
	// Fifty collisions in a row means the random source is stuck. Count
	// upward instead, which always terminates.
	for (let n = existing.length; ; n++) {
		const id = `n${n}`;
		if (!taken.has(id)) return id;
	}
}

/** Every destination, in the order the menu and the setting list them. */
export function listTargets(apps: readonly ShortcutApp[]): Target[] {
	return [
		...ROUTE_TARGET_IDS.map(
			(route): Target => ({ kind: 'route', id: route, route }),
		),
		...apps.map(
			(app): Target => ({ kind: 'shortcut', id: appTargetId(app), app }),
		),
		{ kind: 'share', id: SHARE_TARGET_ID },
	];
}

export function findTarget(
	id: unknown,
	apps: readonly ShortcutApp[],
): Target | null {
	if (typeof id !== 'string') return null;
	return listTargets(apps).find((target) => target.id === id) ?? null;
}

/**
 * The target a setting names, or the default when it names none: an app that
 * was deleted on another device, a value typed by hand, or an id from a
 * newer build. The fallback is the Files viewer, the route with the most
 * evidence behind it.
 */
export function resolveTarget(
	id: unknown,
	apps: readonly ShortcutApp[],
): { target: Target; fellBack: boolean } {
	const found = findTarget(id, apps);
	if (found) return { target: found, fellBack: false };
	return {
		target: { kind: 'route', id: DEFAULT_TARGET_ID, route: DEFAULT_TARGET_ID },
		fellBack: true,
	};
}

const UNNAMED_APP = 'Unnamed app';

/**
 * An app's name and shortcut as they are used. The settings tab stores what
 * is typed, a keystroke at a time, so stray whitespace is dealt with here,
 * at the point of use, and an empty name still gets something to show.
 */
export function appName(app: Pick<ShortcutApp, 'name'>): string {
	return cleanText(app.name, MAX_APP_NAME) || UNNAMED_APP;
}

export function appShortcut(app: Pick<ShortcutApp, 'shortcut'>): string {
	return cleanText(app.shortcut, MAX_SHORTCUT_NAME);
}

/** The full name, for the menu and the setting. */
export function targetTitle(target: Target): string {
	if (target.kind === 'share') return 'Other app (share sheet)';
	if (target.kind === 'shortcut') return appName(target.app);
	return target.route === 'file' ? 'Preview' : 'Files viewer';
}

/** The short name, for the button, where every character costs header room. */
export function targetShortLabel(target: Target): string {
	if (target.kind === 'share') return 'Share';
	if (target.kind === 'shortcut') return appName(target.app);
	return target.route === 'file' ? 'Preview' : 'Files';
}

export function targetIcon(target: Target): string {
	if (target.kind === 'share') return 'share';
	if (target.kind === 'shortcut') return 'app-window';
	return target.route === 'file' ? 'eye' : 'folder-open';
}

/**
 * The setting's options, default first, as the dropdown wants them. Object
 * keys keep insertion order, and none of these ids is an integer, so the
 * order here is the order shown.
 */
export function targetOptions(
	apps: readonly ShortcutApp[],
): Record<string, string> {
	const options: Record<string, string> = {};
	for (const target of listTargets(apps)) {
		options[target.id] =
			target.id === DEFAULT_TARGET_ID
				? `${targetTitle(target)} (default)`
				: targetTitle(target);
	}
	return options;
}

/** Why an app cannot be opened yet, in words for a notice; null when it can. */
export function shortcutProblem(app: ShortcutApp): string | null {
	if (appShortcut(app).length === 0) {
		return `${appName(app)} has no shortcut name yet. Set it in the Etch settings.`;
	}
	return null;
}

/**
 * The documented Shortcuts URL for running a shortcut with text input. The
 * text is the vault-relative path: the shortcut's "Get File from Folder"
 * step is pointed at the vault folder once, when the shortcut is made, and
 * resolves this path inside it. No absolute path is involved, so nothing
 * here depends on the container path the two upstream routes need.
 */
export function buildShortcutUrl(shortcut: string, vaultPath: string): string {
	return `shortcuts://run-shortcut?name=${encodeURIComponent(shortcut)}&input=text&text=${encodeURIComponent(vaultPath)}`;
}
