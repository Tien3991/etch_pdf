import { describe, expect, it, vi } from 'vitest';

// routes.ts is imported for ROUTE_IDS, and it imports Notice as a value.
vi.mock('obsidian', () => ({
	Notice: class {},
}));

import { ROUTE_IDS } from './routes';
import {
	APP_PRESETS,
	DEFAULT_TARGET_ID,
	MAX_APPS,
	MAX_APP_NAME,
	MAX_SHORTCUT_NAME,
	ROUTE_TARGET_IDS,
	SHARE_TARGET_ID,
	ShortcutApp,
	appName,
	appShortcut,
	appTargetId,
	buildShortcutUrl,
	cleanText,
	findTarget,
	listTargets,
	newAppId,
	parseApps,
	resolveTarget,
	shortcutProblem,
	targetIcon,
	targetOptions,
	targetShortLabel,
	targetTitle,
} from './targets';

const xodo: ShortcutApp = { id: 'k3j2x9', name: 'Xodo', shortcut: 'Open in Xodo' };
const viewer: ShortcutApp = {
	id: 'a1b2c3',
	name: 'PDF Viewer',
	shortcut: 'Open in PDF Viewer',
};

describe('ROUTE_TARGET_IDS', () => {
	it('lists exactly the upstream routes', () => {
		// targets.ts restates the ids so it need not import routes.ts at
		// runtime; this is what keeps the two lists the same list.
		expect([...ROUTE_TARGET_IDS]).toEqual([...ROUTE_IDS]);
	});

	it('defaults to the Files viewer, the route with the evidence', () => {
		expect(DEFAULT_TARGET_ID).toBe('shareddocuments');
	});
});

describe('cleanText', () => {
	it('trims and collapses whitespace', () => {
		expect(cleanText('  Open   in\tXodo \n', 100)).toBe('Open in Xodo');
	});

	it('cuts to length without leaving a trailing space', () => {
		expect(cleanText('PDF Viewer by Nutrient', 11)).toBe('PDF Viewer');
	});
});

describe('parseApps', () => {
	it('reads well-formed entries in order', () => {
		expect(parseApps([xodo, viewer])).toEqual([xodo, viewer]);
	});

	it('answers an empty list for anything that is not a list', () => {
		for (const value of [undefined, null, 'apps', 3, {}, true]) {
			expect(parseApps(value)).toEqual([]);
		}
	});

	it('drops entries it cannot point at', () => {
		expect(
			parseApps([
				null,
				'Xodo',
				{ name: 'No id', shortcut: 'x' },
				{ id: '', name: 'Empty id', shortcut: 'x' },
				{ id: 'Has Caps', name: 'Bad id', shortcut: 'x' },
				{ id: 'app:x', name: 'Bad id', shortcut: 'x' },
				{ id: 5, name: 'Numeric id', shortcut: 'x' },
				xodo,
			]),
		).toEqual([xodo]);
	});

	it('keeps the first of two entries sharing an id', () => {
		expect(parseApps([xodo, { ...viewer, id: xodo.id }])).toEqual([xodo]);
	});

	it('cleans and bounds the two strings', () => {
		const [app] = parseApps([
			{ id: 'x1', name: `  ${'N'.repeat(80)} `, shortcut: `\t${'S'.repeat(300)}` },
		]);
		expect(app?.name).toBe('N'.repeat(MAX_APP_NAME));
		expect(app?.shortcut).toBe('S'.repeat(MAX_SHORTCUT_NAME));
	});

	it('keeps an entry whose strings are missing, as empty strings', () => {
		// It can still be opened in settings and filled in.
		expect(parseApps([{ id: 'x1' }, { id: 'x2', name: 7, shortcut: null }])).toEqual([
			{ id: 'x1', name: '', shortcut: '' },
			{ id: 'x2', name: '', shortcut: '' },
		]);
	});

	it('stops at the limit', () => {
		const many = Array.from({ length: MAX_APPS + 5 }, (_, index) => ({
			id: `a${index}`,
			name: `App ${index}`,
			shortcut: 'x',
		}));
		expect(parseApps(many)).toHaveLength(MAX_APPS);
	});
});

describe('newAppId', () => {
	it('makes an id parseApps accepts', () => {
		const id = newAppId([]);
		expect(parseApps([{ id, name: 'A', shortcut: 'b' }])).toHaveLength(1);
	});

	it('pads a small random value to six characters', () => {
		expect(newAppId([], () => 0)).toBe('000000');
	});

	it('tries again when the id is taken', () => {
		const values = [0, 0, 0.5];
		const id = newAppId([{ id: '000000' }], () => values.shift() ?? 0.5);
		expect(id).not.toBe('000000');
		expect(id).toHaveLength(6);
	});

	it('still terminates when the random source is stuck', () => {
		expect(newAppId([{ id: '000000' }], () => 0)).toBe('n1');
		expect(newAppId([{ id: '000000' }, { id: 'n2' }], () => 0)).toBe('n3');
	});
});

describe('listTargets', () => {
	it('lists the routes, then the apps, then the share sheet', () => {
		expect(listTargets([xodo, viewer]).map((target) => target.id)).toEqual([
			'shareddocuments',
			'file',
			'app:k3j2x9',
			'app:a1b2c3',
			'share',
		]);
	});

	it('lists the two routes and the share sheet when there are no apps', () => {
		expect(listTargets([]).map((target) => target.kind)).toEqual([
			'route',
			'route',
			'share',
		]);
	});
});

describe('findTarget', () => {
	it('finds each kind by id', () => {
		expect(findTarget('file', [])).toEqual({ kind: 'route', id: 'file', route: 'file' });
		expect(findTarget(SHARE_TARGET_ID, [])).toEqual({ kind: 'share', id: 'share' });
		expect(findTarget(appTargetId(xodo), [xodo])).toEqual({
			kind: 'shortcut',
			id: 'app:k3j2x9',
			app: xodo,
		});
	});

	it('answers null for an id that names nothing', () => {
		for (const id of ['app:gone', 'k3j2x9', 'File', '', 'preview', 3, null, undefined, {}]) {
			expect(findTarget(id, [xodo])).toBeNull();
		}
	});

	it('rejects the pre-0.1.0 share-sheet id', () => {
		// The current id is `share`. The old one must not resolve to it by
		// accident, since that build's share route was a different thing.
		expect(findTarget('share-sheet', [])).toBeNull();
	});
});

describe('resolveTarget', () => {
	it('returns the target the setting names', () => {
		expect(resolveTarget('app:k3j2x9', [xodo])).toEqual({
			target: { kind: 'shortcut', id: 'app:k3j2x9', app: xodo },
			fellBack: false,
		});
	});

	it('falls back to the Files viewer when the app is gone', () => {
		expect(resolveTarget('app:k3j2x9', [])).toEqual({
			target: { kind: 'route', id: 'shareddocuments', route: 'shareddocuments' },
			fellBack: true,
		});
	});

	it('falls back for a value that is not an id at all', () => {
		for (const value of [undefined, null, 7, {}]) {
			expect(resolveTarget(value, [xodo]).fellBack).toBe(true);
		}
	});
});

describe('target names', () => {
	const [files, preview, app, share] = listTargets([xodo]);

	it('gives each target a title for the menu', () => {
		expect([files, preview, app, share].map((t) => t && targetTitle(t))).toEqual([
			'Files viewer',
			'Preview',
			'Xodo',
			'Other app (share sheet)',
		]);
	});

	it('gives each target a short label for the button', () => {
		expect([files, preview, app, share].map((t) => t && targetShortLabel(t))).toEqual([
			'Files',
			'Preview',
			'Xodo',
			'Share',
		]);
	});

	it('gives each kind its own icon', () => {
		const icons = [files, preview, app, share].map((t) => t && targetIcon(t));
		expect(new Set(icons).size).toBe(4);
	});

	it('names an app that has no name yet', () => {
		const unnamed = listTargets([{ id: 'x1', name: '  ', shortcut: '' }])[2];
		expect(unnamed && targetTitle(unnamed)).toBe('Unnamed app');
		expect(unnamed && targetShortLabel(unnamed)).toBe('Unnamed app');
	});
});

describe('appName and appShortcut', () => {
	it('clean what was stored a keystroke at a time', () => {
		expect(appName({ name: ' PDF  Viewer ' })).toBe('PDF Viewer');
		expect(appShortcut({ shortcut: ' Open in Xodo ' })).toBe('Open in Xodo');
	});

	it('leave an empty shortcut empty', () => {
		expect(appShortcut({ shortcut: '   ' })).toBe('');
	});
});

describe('targetOptions', () => {
	it('lists every target, default first and marked', () => {
		expect(Object.entries(targetOptions([xodo]))).toEqual([
			['shareddocuments', 'Files viewer (default)'],
			['file', 'Preview'],
			['app:k3j2x9', 'Xodo'],
			['share', 'Other app (share sheet)'],
		]);
	});

	it('starts with the option the settings default selects', () => {
		const [first] = Object.keys(targetOptions([]));
		expect(first).toBe(DEFAULT_TARGET_ID);
	});
});

describe('shortcutProblem', () => {
	it('has nothing to say about an app with a shortcut', () => {
		expect(shortcutProblem(xodo)).toBeNull();
	});

	it('names the app whose shortcut is missing', () => {
		expect(shortcutProblem({ ...xodo, shortcut: '  ' })).toBe(
			'Xodo has no shortcut name yet. Set it in the Etch settings.',
		);
	});
});

describe('buildShortcutUrl', () => {
	it('builds the documented run-shortcut URL with text input', () => {
		expect(buildShortcutUrl('Open in Xodo', 'Books/Analysis.pdf')).toBe(
			'shortcuts://run-shortcut?name=Open%20in%20Xodo&input=text&text=Books%2FAnalysis.pdf',
		);
	});

	it('escapes everything a name or a path can hold', () => {
		const url = buildShortcutUrl('A&B = C?', 'Año 1/what? sheet#1 & 50%.pdf');
		// One name parameter, one input parameter, one text parameter: no
		// character from either string may start a fourth.
		expect(url.split('&')).toHaveLength(3);
		expect(url.split('?')).toHaveLength(2);
		expect(url).not.toContain('#');
		const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
		expect(params.get('name')).toBe('A&B = C?');
		expect(params.get('input')).toBe('text');
		expect(params.get('text')).toBe('Año 1/what? sheet#1 & 50%.pdf');
	});
});

describe('APP_PRESETS', () => {
	it('offers names that survive parsing unchanged', () => {
		const parsed = parseApps(
			APP_PRESETS.map((preset, index) => ({ id: `p${index}`, ...preset })),
		);
		expect(parsed.map(({ name, shortcut }) => ({ name, shortcut }))).toEqual([
			...APP_PRESETS,
		]);
	});
});
