import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The obsidian package ships type definitions only. routes.ts imports Notice
// as a runtime value, and settings.ts, pulled in here to pin the default route
// against the dropdown order, extends PluginSettingTab at module scope.
// Notices are recorded, since "no notice" is part of what a handoff that
// follows the setting has to show.
const { notices } = vi.hoisted(() => ({ notices: [] as string[] }));
vi.mock('obsidian', () => ({
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
	PluginSettingTab: class {},
}));

import {
	HandoffContext,
	ROUTE_LABELS,
	RouteId,
	buildHandoffTarget,
	encodePathSegments,
	isRouteId,
	performHandoff,
} from './routes';
import { parseResourcePath } from './resolve';
import { DEFAULT_SETTINGS } from './settings';

describe('encodePathSegments', () => {
	it('encodes spaces and keeps separators', () => {
		expect(encodePathSegments('/a b/c d.pdf')).toBe('/a%20b/c%20d.pdf');
	});

	it('encodes # and %', () => {
		expect(encodePathSegments('/v/sheet#1.pdf')).toBe('/v/sheet%231.pdf');
		expect(encodePathSegments('/v/sheet50%.pdf')).toBe('/v/sheet50%25.pdf');
	});

	it('preserves the leading slash', () => {
		expect(encodePathSegments('/var/mobile')).toBe('/var/mobile');
	});

	it('inverts the parser for hostile names', () => {
		const container =
			'/var/mobile/Containers/Data/Application/AAAA/Documents/vault';
		for (const name of [
			'a b.pdf',
			'sheet#1.pdf',
			'sheet50%.pdf',
			// Image names, since wave 3 hands off images as well. The last two
			// are a Mac-created decomposed accent and an emoji; the deeper
			// filename matrix is wave 7 work, these two are here because the
			// encoding is shared with the refresh path.
			'a+b.png',
			'a&b=c.jpg',
			'SHEET.JPEG',
			'cafe\u0301.png',
			'🎲 sheet.jpg',
		]) {
			const path = `${container}/${name}`;
			const resourcePath = `capacitor://localhost/_capacitor_file_${encodePathSegments(path)}`;
			expect(parseResourcePath(resourcePath, name)).toEqual({
				ok: true,
				absolutePath: path,
			});
		}
	});
});

describe('isRouteId', () => {
	it('accepts the two routes', () => {
		expect(isRouteId('file')).toBe(true);
		expect(isRouteId('shareddocuments')).toBe(true);
	});

	it('rejects the removed share-sheet route', () => {
		// A pre-0.1.0 data.json can still carry it; the guard is what makes
		// it fall back to the default instead of navigating.
		expect(isRouteId('share-sheet')).toBe(false);
	});

	it('rejects anything else', () => {
		for (const value of ['File', '', 'preview', 3, null, undefined, {}]) {
			expect(isRouteId(value)).toBe(false);
		}
	});
});

describe('buildHandoffTarget', () => {
	const encoded = '/var/mobile/Documents/v/Kal-Arath%20Sheet.pdf';

	it('builds the file scheme and opens it', () => {
		expect(buildHandoffTarget('file', encoded)).toEqual({
			url: `file://${encoded}`,
			kind: 'open',
			description: `window.open("file://${encoded}")`,
		});
	});

	it('builds the shareddocuments scheme and assigns it', () => {
		expect(buildHandoffTarget('shareddocuments', encoded)).toEqual({
			url: `shareddocuments://${encoded}`,
			kind: 'assign',
			description: `window.location.href = "shareddocuments://${encoded}"`,
		});
	});

	it('gives both schemes three slashes before an absolute path', () => {
		// file:///var/... not file://var/...: the empty authority matters.
		expect(buildHandoffTarget('file', '/var/x.pdf').url).toBe(
			'file:///var/x.pdf',
		);
		expect(buildHandoffTarget('shareddocuments', '/var/x.pdf').url).toBe(
			'shareddocuments:///var/x.pdf',
		);
	});

	it('passes the encoded path through untouched', () => {
		const hostile = encodePathSegments('/v/sheet#1 50%.pdf');
		for (const route of ['file', 'shareddocuments'] as const) {
			expect(buildHandoffTarget(route, hostile).url).toContain(
				'sheet%231%2050%25.pdf',
			);
		}
	});
});

describe('ROUTE_LABELS', () => {
	it('labels both routes with the default first', () => {
		expect(Object.entries(ROUTE_LABELS)).toEqual([
			['shareddocuments', 'Files viewer (default)'],
			['file', 'Preview'],
		]);
	});

	it('names the same route the settings default selects', () => {
		const [first] = Object.keys(ROUTE_LABELS);
		expect(first).toBe(DEFAULT_SETTINGS.route);
		expect(DEFAULT_SETTINGS.route).toBe('shareddocuments');
	});
});

/**
 * The setting is the whole decision. Upstream moved a file of 4 MiB or more
 * from Preview to the Files viewer; this fork does not look at the size, and
 * these tests are what keeps it from looking again.
 */
describe('performHandoff', () => {
	const CONTAINER = '/var/mobile/Containers/Data/Application/AAAA/Documents/vault';
	// The sizes upstream's rule turned on: under the old threshold, on it,
	// the two documents that failed on device, and what an unreadable stat
	// looks like.
	const SIZES = [0, 1016315, 4194304, 18335754, 254739264, Number.NaN, -1];

	let opened: string[];
	let assigned: string[];

	beforeEach(() => {
		notices.length = 0;
		opened = [];
		assigned = [];
		vi.stubGlobal('window', {
			open: (url: string) => {
				opened.push(url);
				return null;
			},
			location: {
				set href(url: string) {
					assigned.push(url);
				},
			},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function stubContext(route: RouteId): { context: HandoffContext; log: string[] } {
		const log: string[] = [];
		const context = {
			app: {
				vault: {
					getResourcePath: (file: { path: string }) =>
						`capacitor://localhost/_capacitor_file_${CONTAINER}/${encodePathSegments(file.path)}`,
					adapter: {
						stat: () => Promise.resolve({ size: 3, mtime: 1 }),
						readBinary: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
					},
				},
			},
			log: {
				line: (message: string) => {
					log.push(message);
					return Promise.resolve();
				},
				error: (message: string) => {
					log.push(`ERROR ${message}`);
					return Promise.resolve();
				},
			},
			route,
			arm: () => Promise.resolve(),
		} as unknown as HandoffContext;
		return { context, log };
	}

	type FileArg = Parameters<typeof performHandoff>[1];
	function stubFile(size: number, path = 'Books/Real Analysis.pdf'): FileArg {
		return { path, name: path.split('/').pop() ?? path, stat: { size } } as FileArg;
	}

	it('opens Preview when Preview is chosen, at every size', async () => {
		for (const size of SIZES) {
			opened.length = 0;
			assigned.length = 0;
			const { context } = stubContext('file');
			await performHandoff(context, stubFile(size));
			expect(opened).toEqual([`file://${CONTAINER}/Books/Real%20Analysis.pdf`]);
			expect(assigned).toEqual([]);
		}
	});

	it('opens the Files viewer when the Files viewer is chosen, at every size', async () => {
		for (const size of SIZES) {
			opened.length = 0;
			assigned.length = 0;
			const { context } = stubContext('shareddocuments');
			await performHandoff(context, stubFile(size));
			expect(assigned).toEqual([
				`shareddocuments://${CONTAINER}/Books/Real%20Analysis.pdf`,
			]);
			expect(opened).toEqual([]);
		}
	});

	it('says nothing about size, on screen or in the log', async () => {
		// Upstream's rule announced itself with a notice and a log line.
		const { context, log } = stubContext('file');
		await performHandoff(context, stubFile(254739264));
		expect(notices).toEqual([]);
		expect(log.some((line) => /size override/.test(line))).toBe(false);
		expect(log).toContain(
			`route file: window.open("file://${CONTAINER}/Books/Real%20Analysis.pdf")`,
		);
	});

	it('never reads the file stat', async () => {
		// The strongest form of "ignores file size": a stat that cannot be
		// read at all changes nothing.
		const file = { path: 'Big.pdf', name: 'Big.pdf' } as FileArg;
		Object.defineProperty(file, 'stat', {
			get() {
				throw new Error('the file stat was read');
			},
		});
		const { context } = stubContext('file');
		await performHandoff(context, file);
		expect(opened).toEqual([`file://${CONTAINER}/Big.pdf`]);
	});

	it('navigates exactly once', async () => {
		const { context } = stubContext('file');
		await performHandoff(context, stubFile(254739264));
		expect(opened.length + assigned.length).toBe(1);
	});

	it('still declines a file it cannot place, without navigating', async () => {
		// Removing the size rule must not loosen the path check.
		const { context } = stubContext('file');
		(context.app.vault as unknown as { getResourcePath: () => string }).getResourcePath =
			() => 'app://something-else/Big.pdf';
		await performHandoff(context, stubFile(254739264, 'Big.pdf'));
		expect(opened).toEqual([]);
		expect(assigned).toEqual([]);
		expect(notices).toHaveLength(1);
	});
});
