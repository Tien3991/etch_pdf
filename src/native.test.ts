import { describe, expect, it } from 'vitest';
import { hasShareSheet, openShareSheet } from './native';

type AppArg = Parameters<typeof openShareSheet>[0];

describe('openShareSheet', () => {
	it('calls Obsidian with the vault path, the way its own Share item does', async () => {
		const calls: unknown[][] = [];
		const app = {
			openWithDefaultApp: (...args: unknown[]) => {
				calls.push(args);
				return Promise.resolve();
			},
		} as unknown as AppArg;
		expect(await openShareSheet(app, 'Books/Real Analysis.pdf')).toBe(true);
		expect(calls).toEqual([['Books/Real Analysis.pdf', true]]);
	});

	it('keeps the app as the receiver of the call', async () => {
		// Obsidian's method reads `this.vault`; a detached call would throw.
		const app = {
			vault: 'the vault',
			seen: null as unknown,
			openWithDefaultApp(this: { vault: string; seen: unknown }) {
				this.seen = this.vault;
			},
		};
		await openShareSheet(app as unknown as AppArg, 'a.pdf');
		expect(app.seen).toBe('the vault');
	});

	it('resolves false, without calling anything, when the function is absent', async () => {
		for (const app of [{}, { openWithDefaultApp: undefined }, { openWithDefaultApp: 'yes' }]) {
			expect(await openShareSheet(app as unknown as AppArg, 'a.pdf')).toBe(false);
		}
	});

	it('waits for the sheet call to settle', async () => {
		let settled = false;
		const app = {
			openWithDefaultApp: async () => {
				// A few turns of the microtask queue stand in for the native call.
				await Promise.resolve();
				await Promise.resolve();
				settled = true;
			},
		} as unknown as AppArg;
		await openShareSheet(app, 'a.pdf');
		expect(settled).toBe(true);
	});
});

describe('hasShareSheet', () => {
	it('reports whether the function is there', () => {
		expect(hasShareSheet({ openWithDefaultApp: () => {} } as unknown as AppArg)).toBe(true);
		expect(hasShareSheet({} as unknown as AppArg)).toBe(false);
		expect(hasShareSheet({ openWithDefaultApp: 1 } as unknown as AppArg)).toBe(false);
	});
});
