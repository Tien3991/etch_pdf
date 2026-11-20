import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	EtchSettings,
	addApp,
	moveApp,
	parseSettings,
	removeAppAt,
	updateApp,
} from './config';
import { MAX_APPS, MAX_APP_NAME, MAX_SHORTCUT_NAME } from './targets';

const xodo = { id: 'k3j2x9', name: 'Xodo', shortcut: 'Open in Xodo' };
const viewer = { id: 'a1b2c3', name: 'PDF Viewer', shortcut: 'Open in PDF Viewer' };

function settings(overrides: Partial<EtchSettings> = {}): EtchSettings {
	return { ...DEFAULT_SETTINGS, apps: [xodo, viewer], ...overrides };
}

describe('DEFAULT_SETTINGS', () => {
	it('is the upstream behavior: Files viewer, no apps, no logging', () => {
		expect(DEFAULT_SETTINGS).toEqual({
			target: 'shareddocuments',
			apps: [],
			debugLogging: false,
		});
	});
});

describe('parseSettings', () => {
	it('gives the defaults for a first run', () => {
		for (const stored of [undefined, null, {}, 'nonsense', 4]) {
			expect(parseSettings(stored)).toEqual({
				settings: DEFAULT_SETTINGS,
				rejectedTarget: null,
			});
		}
	});

	it('reads a complete settings object', () => {
		expect(
			parseSettings({ target: 'app:k3j2x9', apps: [xodo, viewer], debugLogging: true }),
		).toEqual({
			settings: { target: 'app:k3j2x9', apps: [xodo, viewer], debugLogging: true },
			rejectedTarget: null,
		});
	});

	it('reads the default from the old route key', () => {
		// Upstream and the 0.3 builds stored it there; a choice of Preview
		// has to survive the update.
		expect(parseSettings({ route: 'file', debugLogging: false }).settings.target).toBe(
			'file',
		);
	});

	it('prefers target over route when both are present', () => {
		expect(parseSettings({ target: 'share', route: 'file' }).settings.target).toBe(
			'share',
		);
	});

	it('falls back, and says so, when the default names nothing', () => {
		expect(parseSettings({ target: 'app:gone', apps: [xodo] })).toEqual({
			settings: { target: 'shareddocuments', apps: [xodo], debugLogging: false },
			rejectedTarget: '"app:gone"',
		});
		expect(parseSettings({ route: 'share-sheet' }).rejectedTarget).toBe(
			'"share-sheet"',
		);
		expect(parseSettings({ target: 7 }).rejectedTarget).toBe('7');
	});

	it('treats a logging value that is not true as off', () => {
		for (const debugLogging of ['true', 1, {}, null]) {
			expect(parseSettings({ debugLogging }).settings.debugLogging).toBe(false);
		}
	});

	it('drops malformed apps and keeps the rest', () => {
		expect(parseSettings({ apps: [xodo, { name: 'no id' }, viewer] }).settings.apps).toEqual([
			xodo,
			viewer,
		]);
	});

	it('survives a round trip through JSON', () => {
		const stored = settings({ target: 'app:a1b2c3', debugLogging: true });
		expect(parseSettings(JSON.parse(JSON.stringify(stored))).settings).toEqual(stored);
	});
});

describe('addApp', () => {
	it('appends an app with a fresh id', () => {
		const next = addApp(settings({ apps: [xodo] }), { name: 'PDF Viewer', shortcut: 'Open' }, () => 0);
		expect(next.apps).toEqual([
			xodo,
			{ id: '000000', name: 'PDF Viewer', shortcut: 'Open' },
		]);
	});

	it('leaves the original settings untouched', () => {
		const before = settings({ apps: [xodo] });
		addApp(before, { name: 'A', shortcut: 'b' });
		expect(before.apps).toEqual([xodo]);
	});

	it('returns the same object when the list is full', () => {
		const full = settings({
			apps: Array.from({ length: MAX_APPS }, (_, index) => ({
				id: `a${index}`,
				name: 'A',
				shortcut: 'b',
			})),
		});
		expect(addApp(full, { name: 'One more', shortcut: 'x' })).toBe(full);
	});

	it('never reuses an id', () => {
		let current = settings({ apps: [] });
		for (let index = 0; index < MAX_APPS; index++) {
			current = addApp(current, { name: `App ${index}`, shortcut: 'x' });
		}
		expect(new Set(current.apps.map((app) => app.id)).size).toBe(MAX_APPS);
	});
});

describe('removeAppAt', () => {
	it('removes the app at the index', () => {
		expect(removeAppAt(settings(), 0).apps).toEqual([viewer]);
	});

	it('sends the default back to the Files viewer when its app goes', () => {
		const next = removeAppAt(settings({ target: 'app:k3j2x9' }), 0);
		expect(next.target).toBe('shareddocuments');
	});

	it('leaves the default alone when another app goes', () => {
		const next = removeAppAt(settings({ target: 'app:k3j2x9' }), 1);
		expect(next.target).toBe('app:k3j2x9');
		expect(next.apps).toEqual([xodo]);
	});

	it('returns the same object for an index with no app', () => {
		const before = settings();
		expect(removeAppAt(before, 5)).toBe(before);
		expect(removeAppAt(before, -1)).toBe(before);
	});
});

describe('moveApp', () => {
	it('moves an app to a new place', () => {
		expect(moveApp(settings(), 0, 1).apps).toEqual([viewer, xodo]);
		expect(moveApp(settings(), 1, 0).apps).toEqual([viewer, xodo]);
	});

	it('returns the same object for a move that changes nothing', () => {
		const before = settings();
		expect(moveApp(before, 0, 0)).toBe(before);
		expect(moveApp(before, 0, 2)).toBe(before);
		expect(moveApp(before, 3, 0)).toBe(before);
		expect(moveApp(before, 0, -1)).toBe(before);
	});
});

describe('updateApp', () => {
	it('changes one field of one app', () => {
		expect(updateApp(settings(), 'k3j2x9', 'shortcut', 'Annotate in Xodo').apps).toEqual([
			{ ...xodo, shortcut: 'Annotate in Xodo' },
			viewer,
		]);
	});

	it('keeps whitespace as typed', () => {
		// Cleaning happens where the value is used, so the editor shows
		// what was typed when it is opened again.
		expect(updateApp(settings(), 'k3j2x9', 'name', 'PDF ').apps[0]?.name).toBe('PDF ');
	});

	it('cuts each field to its limit', () => {
		const long = 'x'.repeat(500);
		expect(updateApp(settings(), 'k3j2x9', 'name', long).apps[0]?.name).toHaveLength(
			MAX_APP_NAME,
		);
		expect(
			updateApp(settings(), 'k3j2x9', 'shortcut', long).apps[0]?.shortcut,
		).toHaveLength(MAX_SHORTCUT_NAME);
	});

	it('changes nothing for an id that is not in the list', () => {
		expect(updateApp(settings(), 'gone', 'name', 'X').apps).toEqual([xodo, viewer]);
	});
});
