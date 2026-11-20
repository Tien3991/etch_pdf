import type { App } from 'obsidian';

/**
 * The one internal Obsidian call this plugin makes, kept in a file of its
 * own so the claim stays checkable.
 *
 * `app.openWithDefaultApp(path)` is absent from the public types. On iOS it
 * is what Obsidian's own "Share" menu item and command call: it raises the
 * native share sheet for a vault file. Upstream's spike measured it
 * (docs/spike/FINDINGS.md, experiments e4 and e1d): the app chosen in the
 * sheet received the vault file in place, hash-witnessed with Preview.
 *
 * It is the only way to reach an app that offers no link of its own, which
 * is every third-party editor checked so far: iPadOS gives a webview no
 * other means of saying "open this file in that app".
 *
 * Because it is internal, it is looked up at call time and its absence is an
 * answer rather than an error: the caller tells the user and stays put.
 */
interface AppWithShare {
	openWithDefaultApp?: (path: string, external?: boolean) => unknown;
}

export function hasShareSheet(app: App): boolean {
	return typeof (app as unknown as AppWithShare).openWithDefaultApp === 'function';
}

/**
 * Raises the share sheet for a vault-relative path. Resolves false when the
 * function is not there. The second argument mirrors Obsidian's own call
 * from its file menu; it matters on desktop only.
 */
export async function openShareSheet(
	app: App,
	vaultPath: string,
): Promise<boolean> {
	const owner = app as unknown as AppWithShare;
	if (typeof owner.openWithDefaultApp !== 'function') return false;
	await owner.openWithDefaultApp(vaultPath, true);
	return true;
}
