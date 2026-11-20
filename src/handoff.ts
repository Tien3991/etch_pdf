import { Notice, TFile } from 'obsidian';
import { openShareSheet } from './native';
import {
	HandoffContext,
	armWitness,
	navigateInWebview,
	performHandoff,
} from './routes';
import {
	Target,
	appName,
	appShortcut,
	buildShortcutUrl,
	shortcutProblem,
} from './targets';

/**
 * One handoff to one destination.
 *
 * The two upstream routes go to `performHandoff` untouched: same path
 * resolution, same size override, same single navigation. The two added
 * destinations are handled here. Like the routes, each one arms the witness,
 * writes what it is about to do to the debug log, and then does exactly one
 * thing: nothing is retried and nothing is chained.
 *
 * Neither added destination resolves the absolute container path. The share
 * sheet takes the vault-relative path, and so does a shortcut, so the
 * fragile parse the routes depend on is not on their path at all.
 */

export interface TargetContext extends Omit<HandoffContext, 'route'> {
	/**
	 * Raises the share sheet; resolves false when it is not available.
	 * Defaults to Obsidian's own, through `native.ts`.
	 */
	share?: (vaultPath: string) => Promise<boolean>;
}

export const SHARE_UNAVAILABLE_NOTICE =
	'The share sheet is not available in this version of Obsidian. Choose another app in the Etch settings.';

export async function handOffTo(
	context: TargetContext,
	file: TFile,
	target: Target,
): Promise<void> {
	const { app, log } = context;

	if (target.kind === 'route') {
		await performHandoff({ ...context, route: target.route }, file);
		return;
	}

	if (target.kind === 'share') {
		await armWitness(context, file);
		await log.line(`target share: app.openWithDefaultApp("${file.path}")`);
		const share =
			context.share ?? ((vaultPath: string) => openShareSheet(app, vaultPath));
		const shown = await share(file.path);
		if (!shown) {
			new Notice(SHARE_UNAVAILABLE_NOTICE, 10000);
			await log.error(
				'share sheet unavailable: app.openWithDefaultApp is not a function',
			);
		}
		return;
	}

	// A shortcut with no name cannot be run, and a URL built from an empty
	// name would open the Shortcuts app on an error instead of an editor.
	const problem = shortcutProblem(target.app);
	if (problem !== null) {
		new Notice(problem, 10000);
		await log.error(`shortcut target ${target.id} is not usable: ${problem}`);
		return;
	}

	const url = buildShortcutUrl(appShortcut(target.app), file.path);
	const description = `window.location.href = "${url}"`;
	await armWitness(context, file);
	await log.line(`target shortcut "${appName(target.app)}": ${description}`);
	const navigate = context.navigate ?? navigateInWebview;
	navigate({ url, kind: 'assign', description });
}
