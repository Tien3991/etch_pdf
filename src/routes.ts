import { App, Notice, TFile } from 'obsidian';
import { EtchLog } from './log';
import { resolveAbsolutePath } from './resolve';
import { armWitnessRecord, WitnessRecord } from './witness';

/**
 * The two handoff routes, both plain web navigation. Selection is a setting,
 * nothing is retried after a failure, and a handoff fires exactly one
 * navigation. The single automatic behavior is the size override below, which
 * picks a route before anything is attempted rather than after something
 * failed.
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
 * At or above this size, a handoff uses the Files viewer even when the
 * setting says Preview.
 *
 * Preview wrote nothing on two several-hundred-page PDFs across nine handoffs
 * in the wave 3 session, 2026-08-11: an 18 MB file and a 243 MB file, one
 * window 34 minutes long. The Files viewer wrote both, every attempt, within
 * seconds. A 1 MB PDF and four images round-tripped through Preview in the
 * same session, so small files are unaffected.
 *
 * Bytes are a proxy. The failure tracks document weight, and page count
 * tracks that better, but page objects live in compressed object streams in
 * any modern PDF, so counting them needs a parser this plugin has no business
 * carrying. The threshold sits far below the smallest file known to fail
 * because the costs are lopsided: sending a small file through the Files
 * viewer costs two taps, and sending a heavy one to Preview costs the user's
 * handwriting. A small file with many pages is the known hole (ETCH.md, the
 * open question on where the boundary sits).
 *
 * 4,194,304 bytes. User-facing copy rounds it to 4 MB.
 */
export const LARGE_FILE_BYTES = 4 * 1024 * 1024;

export interface RouteDecision {
	route: RouteId;
	/** True when the size override moved this handoff off the chosen route. */
	overridden: boolean;
}

/**
 * Picks the route before anything is attempted. Not a fallback: nothing is
 * retried, nothing is chained, and one navigation fires per gesture
 * (engineering rule 6).
 *
 * The size comes from Obsidian's cached file stat, which is what makes it
 * free, and which means it can lag the file on disk. Only a size known to be
 * small keeps the Preview route, so a stat that is missing, unreadable, or
 * nonsense sends the handoff to the viewer that does not lose ink. The
 * asymmetry is deliberate: guessing wrong toward the Files viewer costs two
 * taps, and guessing wrong toward Preview costs the markup.
 */
export function chooseRoute(selected: RouteId, sizeBytes: number): RouteDecision {
	const knownSmall =
		Number.isFinite(sizeBytes) &&
		sizeBytes >= 0 &&
		sizeBytes < LARGE_FILE_BYTES;
	if (selected === 'file' && !knownSmall) {
		return { route: 'shareddocuments', overridden: true };
	}
	return { route: selected, overridden: false };
}

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

/**
 * How the page shown in Obsidian is added to the handoff URL.
 *
 * This is an experiment, and `off` is the only proven value: neither the
 * Files viewer nor Preview documents a page parameter, and no device session
 * has shown one honoured. The two candidates are the forms a URL can carry a
 * page in at all, the PDF open-parameter fragment and a plain query.
 *
 * The other way to name a start page is inside the file, as the catalog's
 * OpenAction. That one is ruled out on evidence as well as on principle:
 * macOS 26.5.1 PDFKit opened a six-page test document on page 1 with the
 * OpenAction pointing at page 5, in three forms, and this plugin does not
 * write to the user's files in any case.
 */
export const PAGE_LINK_STYLES = ['off', 'fragment', 'query'] as const;

export type PageLinkStyle = (typeof PAGE_LINK_STYLES)[number];

/** Dropdown labels, in display order with the default first. */
export const PAGE_LINK_LABELS: Record<PageLinkStyle, string> = {
	off: 'Off (default)',
	fragment: '#page=N',
	query: '?page=N',
};

/** The same data boundary as the route: data.json is hand-editable. */
export function isPageLinkStyle(value: unknown): value is PageLinkStyle {
	return (
		typeof value === 'string' &&
		(PAGE_LINK_STYLES as readonly string[]).includes(value)
	);
}

/**
 * What is appended to the URL, or nothing. Only a real page produces a
 * suffix: an unknown page, an image, or a number that is not a whole page
 * leaves the URL exactly as it was before this experiment existed.
 *
 * The suffix goes after the encoded path, and `encodePathSegments` escapes
 * every `#` and `?` a filename can contain, so the one appended here is the
 * only unescaped one in the URL and cannot be confused with the path.
 */
export function pageSuffix(style: PageLinkStyle, page: number | null): string {
	if (style === 'off' || page === null) return '';
	if (!Number.isSafeInteger(page) || page < 1) return '';
	return style === 'fragment' ? `#page=${page}` : `?page=${page}`;
}

export interface HandoffContext {
	app: App;
	log: EtchLog;
	/** What the setting says. The size override can move a handoff off it. */
	route: RouteId;
	/** How the page is added to the URL; `off` leaves the URL untouched. */
	pageLink: PageLinkStyle;
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
 *
 * The suffix is the page experiment's, built by `pageSuffix`. It defaults to
 * nothing, which is every handoff outside that experiment.
 */
export function buildHandoffTarget(
	route: RouteId,
	encodedPath: string,
	suffix = '',
): HandoffTarget {
	if (route === 'file') {
		const url = `file://${encodedPath}${suffix}`;
		return { url, kind: 'open', description: `window.open("${url}")` };
	}
	const url = `shareddocuments://${encodedPath}${suffix}`;
	return {
		url,
		kind: 'assign',
		description: `window.location.href = "${url}"`,
	};
}

/**
 * Shown when the size override redirects a handoff. It has to explain a
 * viewer the user did not choose, and tell them how to save once they are
 * there, because the Files viewer needs a check-mark tap and Preview does not.
 */
export const LARGE_FILE_NOTICE =
	'Etch used the Files viewer for this large file, because Preview can lose markup on large PDFs. Tap Markup, then the check mark to save.';

export async function performHandoff(
	context: HandoffContext,
	file: TFile,
	/** The page shown in Obsidian at tap time, when one could be read. */
	page: number | null = null,
): Promise<void> {
	const { app, log } = context;

	const decision = chooseRoute(context.route, file.stat.size);
	const suffix = pageSuffix(context.pageLink, page);
	const plan = await buildPlan(context, file, decision.route, suffix);
	if (!plan) return;

	if (context.pageLink !== 'off') {
		await log.line(
			`page link ${context.pageLink}: page ${page ?? 'unknown'}, suffix "${suffix}"`,
		);
	}

	if (decision.overridden) {
		new Notice(LARGE_FILE_NOTICE, 15000);
		await log.line(
			`size override: ${file.path} is ${file.stat.size} bytes, using ${decision.route} instead of ${context.route}`,
		);
	}

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
	await log.line(`route ${decision.route}: ${plan.description}`);

	plan.navigate();
}

/**
 * The chosen route is passed in rather than read from the context, so the
 * only route in scope here is the effective one.
 */
async function buildPlan(
	context: Omit<HandoffContext, 'route' | 'pageLink'>,
	file: TFile,
	route: RouteId,
	suffix: string,
): Promise<HandoffPlan | null> {
	const { app, log } = context;

	const resolved = resolveAbsolutePath(app, file);
	if (!resolved.ok) {
		new Notice(resolved.message);
		await log.error(
			`path resolution failed (${resolved.failure}) for ${file.path}`,
		);
		return null;
	}
	await log.line(`resolved ${file.path} -> ${resolved.absolutePath}`);

	const target = buildHandoffTarget(
		route,
		encodePathSegments(resolved.absolutePath),
		suffix,
	);
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
