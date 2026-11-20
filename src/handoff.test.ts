import { beforeEach, describe, expect, it, vi } from 'vitest';

// Notices are how a handoff that cannot happen tells the user, so the
// stand-in records them.
const { notices } = vi.hoisted(() => ({ notices: [] as string[] }));
vi.mock('obsidian', () => ({
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
}));

import { SHARE_UNAVAILABLE_NOTICE, TargetContext, handOffTo } from './handoff';
import { LARGE_FILE_BYTES, LARGE_FILE_NOTICE } from './routes';
import { Target } from './targets';

type FileArg = Parameters<typeof handOffTo>[1];

const CONTAINER = '/var/mobile/Containers/Data/Application/AAAA/Documents/vault';

function stubFile(path = 'Books/Real Analysis.pdf', size = 1000): FileArg {
	return { path, name: path.split('/').pop() ?? path, stat: { size } } as FileArg;
}

/** Everything a handoff does, in the order it did it. */
interface Recorder {
	events: string[];
	urls: { url: string; kind: string }[];
	shared: string[];
	log: string[];
	errors: string[];
}

function stubContext(
	options: { share?: boolean | 'absent'; readable?: boolean } = {},
): { context: TargetContext; recorder: Recorder } {
	const recorder: Recorder = { events: [], urls: [], shared: [], log: [], errors: [] };
	const readable = options.readable ?? true;
	const app = {
		vault: {
			getResourcePath: (file: { path: string }) =>
				`capacitor://localhost/_capacitor_file_${CONTAINER}/${file.path
					.split('/')
					.map(encodeURIComponent)
					.join('/')}`,
			adapter: {
				stat: () => Promise.resolve(readable ? { size: 3, mtime: 1 } : null),
				readBinary: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
			},
		},
		...(options.share === 'absent'
			? {}
			: {
					openWithDefaultApp: (path: string) => {
						recorder.events.push('share');
						recorder.shared.push(path);
					},
				}),
	};
	const context = {
		app,
		log: {
			line: (message: string) => {
				recorder.log.push(message);
				return Promise.resolve();
			},
			error: (message: string) => {
				recorder.errors.push(message);
				return Promise.resolve();
			},
		},
		arm: () => {
			recorder.events.push('arm');
			return Promise.resolve();
		},
		navigate: (target: { url: string; kind: string }) => {
			recorder.events.push('navigate');
			recorder.urls.push({ url: target.url, kind: target.kind });
		},
	} as unknown as TargetContext;
	return { context, recorder };
}

const files: Target = { kind: 'route', id: 'shareddocuments', route: 'shareddocuments' };
const preview: Target = { kind: 'route', id: 'file', route: 'file' };
const share: Target = { kind: 'share', id: 'share' };
const xodo: Target = {
	kind: 'shortcut',
	id: 'app:k3j2x9',
	app: { id: 'k3j2x9', name: 'Xodo', shortcut: 'Open in Xodo' },
};

beforeEach(() => {
	notices.length = 0;
});

describe('handOffTo a route', () => {
	it('fires the Files viewer link, exactly as upstream builds it', async () => {
		const { context, recorder } = stubContext();
		await handOffTo(context, stubFile(), files);
		expect(recorder.urls).toEqual([
			{
				url: `shareddocuments://${CONTAINER}/Books/Real%20Analysis.pdf`,
				kind: 'assign',
			},
		]);
		expect(recorder.events).toEqual(['arm', 'navigate']);
		expect(notices).toEqual([]);
	});

	it('fires the Preview link for a small file', async () => {
		const { context, recorder } = stubContext();
		await handOffTo(context, stubFile(), preview);
		expect(recorder.urls).toEqual([
			{ url: `file://${CONTAINER}/Books/Real%20Analysis.pdf`, kind: 'open' },
		]);
	});

	it('still sends a large file to the Files viewer when Preview is chosen', async () => {
		const { context, recorder } = stubContext();
		await handOffTo(context, stubFile('Big.pdf', LARGE_FILE_BYTES), preview);
		expect(recorder.urls).toEqual([
			{ url: `shareddocuments://${CONTAINER}/Big.pdf`, kind: 'assign' },
		]);
		expect(notices).toEqual([LARGE_FILE_NOTICE]);
	});

	it('navigates once', async () => {
		const { context, recorder } = stubContext();
		await handOffTo(context, stubFile(), files);
		expect(recorder.events.filter((event) => event === 'navigate')).toHaveLength(1);
	});
});

describe('handOffTo the share sheet', () => {
	it('raises the sheet for the vault path, after arming the witness', async () => {
		const { context, recorder } = stubContext();
		await handOffTo(context, stubFile(), share);
		expect(recorder.shared).toEqual(['Books/Real Analysis.pdf']);
		expect(recorder.events).toEqual(['arm', 'share']);
		expect(recorder.urls).toEqual([]);
		expect(notices).toEqual([]);
	});

	it('logs what it is about to call', async () => {
		const { context, recorder } = stubContext();
		await handOffTo(context, stubFile(), share);
		expect(recorder.log).toContain(
			'target share: app.openWithDefaultApp("Books/Real Analysis.pdf")',
		);
	});

	it('says so, and stays put, when Obsidian has no share sheet', async () => {
		const { context, recorder } = stubContext({ share: 'absent' });
		await handOffTo(context, stubFile(), share);
		expect(notices).toEqual([SHARE_UNAVAILABLE_NOTICE]);
		expect(recorder.shared).toEqual([]);
		expect(recorder.urls).toEqual([]);
		expect(recorder.errors).toHaveLength(1);
	});

	it('uses an injected share function when one is given', async () => {
		const { context, recorder } = stubContext({ share: 'absent' });
		const seen: string[] = [];
		await handOffTo(
			{
				...context,
				share: (path) => {
					seen.push(path);
					return Promise.resolve(true);
				},
			},
			stubFile(),
			share,
		);
		expect(seen).toEqual(['Books/Real Analysis.pdf']);
		expect(notices).toEqual([]);
		expect(recorder.errors).toEqual([]);
	});

	it('does not need the absolute path', async () => {
		// A resource URL of an unknown shape stops a route; the share sheet
		// never asks for one.
		const { context, recorder } = stubContext();
		(context.app.vault as unknown as { getResourcePath: () => string }).getResourcePath =
			() => 'app://something-else/file.pdf';
		await handOffTo(context, stubFile(), share);
		expect(recorder.shared).toEqual(['Books/Real Analysis.pdf']);
		expect(notices).toEqual([]);
	});
});

describe('handOffTo an app with a shortcut', () => {
	it('runs the shortcut with the vault path, after arming the witness', async () => {
		const { context, recorder } = stubContext();
		await handOffTo(context, stubFile(), xodo);
		expect(recorder.urls).toEqual([
			{
				url: 'shortcuts://run-shortcut?name=Open%20in%20Xodo&input=text&text=Books%2FReal%20Analysis.pdf',
				kind: 'assign',
			},
		]);
		expect(recorder.events).toEqual(['arm', 'navigate']);
		expect(notices).toEqual([]);
	});

	it('logs the app and the exact link', async () => {
		const { context, recorder } = stubContext();
		await handOffTo(context, stubFile(), xodo);
		expect(recorder.log).toContain(
			'target shortcut "Xodo": window.location.href = "shortcuts://run-shortcut?name=Open%20in%20Xodo&input=text&text=Books%2FReal%20Analysis.pdf"',
		);
	});

	it('trims a shortcut name that was stored with stray spaces', async () => {
		const { context, recorder } = stubContext();
		const padded: Target = {
			kind: 'shortcut',
			id: 'app:x1',
			app: { id: 'x1', name: ' Xodo ', shortcut: '  Open in Xodo ' },
		};
		await handOffTo(context, stubFile(), padded);
		expect(recorder.urls[0]?.url).toContain('name=Open%20in%20Xodo&');
	});

	it('does nothing but explain when the shortcut has no name', async () => {
		const { context, recorder } = stubContext();
		const unnamed: Target = {
			kind: 'shortcut',
			id: 'app:x1',
			app: { id: 'x1', name: 'Xodo', shortcut: ' ' },
		};
		await handOffTo(context, stubFile(), unnamed);
		expect(notices).toEqual([
			'Xodo has no shortcut name yet. Set it in the Etch settings.',
		]);
		// Nothing was armed and nothing left the webview.
		expect(recorder.events).toEqual([]);
		expect(recorder.errors).toHaveLength(1);
	});

	it('still hands off when the witness cannot be armed', async () => {
		const { context, recorder } = stubContext({ readable: false });
		await handOffTo(context, stubFile(), xodo);
		expect(notices).toEqual(['Handing off without verification.']);
		expect(recorder.events).toEqual(['navigate']);
	});
});
