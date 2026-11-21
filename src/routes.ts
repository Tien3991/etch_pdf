import { App, Notice, TFile } from 'obsidian';
import { EtchLog } from './log';
import { resolveAbsolutePath } from './resolve';
import { armWitnessRecord, WitnessRecord } from './witness';

/**
 * The two handoff routes, both plain web navigation. Selection is a setting,
 * nothing is retried after a failure, and a handoff fires exactly one
 * navigation. Nothing here is automatic: the route that fires is the one the
 * setting names, whatever the file.
 */
export const ROUTE_IDS = ['shareddocuments', 'file'] as const;

export type RouteId = (typeof ROUTE_IDS)[number];

/**
 * Dropdown labels, in display order with the default first. They live beside
 * the route ids so a third route cannot compile without its label.
 */
export const ROUTE_LABELS: Record<RouteId, string> = {
	shareddocuments: 'Files viewer (default)',
	file: 'Preview',
};

/**
 * Where this fork leaves upstream: the file's size plays no part.
 *
 * Upstream sends any file of 4 MiB or more to the Files viewer, even when the
 * setting says Preview. Here the setting is the whole decision, and the size
 * is never read, so a file opens where its owner said it should.
 *
 * What that rule guarded against is unchanged, and it is now the user's to
 * weigh. In upstream's wave 3 session, 2026-08-11 on iPadOS 26.5.2, Preview
 * wrote nothing on two several-hundred-page PDFs across nine handoffs: an
 * 18 MB file and a 243 MB file, one window 34 minutes long. The Files viewer
 * wrote both, every attempt, within seconds. A 1 MB PDF and four images
 * round-tripped through Preview in the same session. Choosing Preview for a
 * long PDF accepts that risk; the settings copy and the README say so, since
 * a rule that is gone can no longer say it at the moment of the tap.
 */

/**
 * The route value crosses a data boundary: data.json is hand-editable and
 * syncs between devices. Both readers of that file guard with this. A
 * `share-sheet` value from a pre-0.1.0 install falls back to the default
 * here, so no migration code is needed.
 */
export function isRouteId(value: unknown): value is RouteId {
	return (
		typeof value === 'string' &&
		(ROUTE_IDS as readonly string[]).includes(value)
	);
}

export interface HandoffContext {
	app: App;
	log: EtchLog;
	/** What the setting says, which is also what fires. */
	route: RouteId;
	/** Persist the armed witness record; resolves once the write completes. */
	arm: (record: WitnessRecord) => Promise<void>;
}

/** Percent-encode every path segment, keeping the separators. */
export function encodePathSegments(absolutePath: string): string {
	return absolutePath.split('/').map(encodeURIComponent).join('/');
}

interface HandoffPlan {
	/** What fires, recorded in the debug log before navigating. */
	description: string;
	navigate: () => void;
}

/** How the URL is handed to the OS. Route 1 opens, route 2 assigns. */
export type NavigationKind = 'open' | 'assign';

export interface HandoffTarget {
	url: string;
	kind: NavigationKind;
	/** Logged verbatim before navigating, so the log names what fired. */
	description: string;
}

/**
 * The two URLs are the product, so they are built by a pure function the
 * tests can pin. The description strings are the ones the device logs carry;
 * changing them breaks continuity with the archived session logs.
 */
export function buildHandoffTarget(
	route: RouteId,
	encodedPath: string,
): HandoffTarget {
	if (route === 'file') {
		const url = `file://${encodedPath}`;
		return { url, kind: 'open', description: `window.open("${url}")` };
	}
	const url = `shareddocuments://${encodedPath}`;
	return {
		url,
		kind: 'assign',
		description: `window.location.href = "${url}"`,
	};
}

export async function performHandoff(
	context: HandoffContext,
	file: TFile,
): Promise<void> {
	const { app, log } = context;

	const plan = await buildPlan(context, file);
	if (!plan) return;

	// Arm and persist the witness before the navigation fires; the webview
	// may not survive the trip. Verification is a debug aid, so failing to
	// arm it costs the check and not the handoff: the path is already
	// resolved and validated here, and hashing a very large file is the
	// likeliest way to fail. The user is told the check is unavailable.
	try {
		const record = await armWitnessRecord(app, file.path);
		await context.arm(record);
		await log.line(
			`witness armed: ${record.vaultPath} size=${record.size} mtime=${record.mtime} sha256=${record.sha256}`,
		);
	} catch (error) {
		new Notice('Handing off without verification.');
		await log.error(`witness arm failed for ${file.path}`, error);
	}
	await log.line(`route ${context.route}: ${plan.description}`);

	plan.navigate();
}

/**
 * The route is the context's, the one the setting names. There is no second
 * opinion to pass in beside it.
 */
async function buildPlan(
	context: HandoffContext,
	file: TFile,
): Promise<HandoffPlan | null> {
	const { app, log, route } = context;

	const resolved = resolveAbsolutePath(app, file);
	if (!resolved.ok) {
		new Notice(resolved.message);
		await log.error(
			`path resolution failed (${resolved.failure}) for ${file.path}`,
		);
		return null;
	}
	await log.line(`resolved ${file.path} -> ${resolved.absolutePath}`);

	const target = buildHandoffTarget(route, encodePathSegments(resolved.absolutePath));
	return {
		description: target.description,
		navigate: () => {
			if (target.kind === 'open') {
				window.open(target.url);
			} else {
				window.location.href = target.url;
			}
		},
	};
}
