import { App, FileView, TFile, WorkspaceLeaf } from 'obsidian';

/**
 * The page a PDF view is showing, read at tap time.
 *
 * Obsidian's public API carries no page for a PDF view: the view's ephemeral
 * state holds none (checked against the 1.15.1 bundle). What is on screen is
 * the bundled pdf.js viewer, so the page is read from its DOM instead, reached
 * through the view's public `containerEl` and nothing else:
 *
 *   - the toolbar's page box, `input.pdf-page-input`. It is a number input
 *     holding the 1-based page index, except when the PDF defines page labels
 *     ("iv", "A-3"): then it is a text input holding the label;
 *   - the page elements, `div.page[data-page-number]`, which also carry
 *     `data-page-label` when labels exist. Sidebar thumbnails carry the same
 *     two attributes on `div.thumbnail`, which is why every selector here
 *     names `div.page`.
 *
 * None of this is contract. Every reader returns null rather than a guess,
 * and a null page changes nothing about the handoff.
 */

const PAGE_SELECTOR = 'div.page[data-page-number]';
const PAGE_INPUT_SELECTOR = 'input.pdf-page-input';
/** The element that scrolls the pages, so what it clips is what is hidden. */
const SCROLLER_SELECTOR = '.pdf-viewer-container';

/**
 * Obsidian's view type for PDFs. The API does not export it, so it is a
 * string this plugin asserts, the same one `actions.ts` walks.
 */
export const PDF_VIEW_TYPE = 'pdf';

const DIGITS = /^[0-9]+$/;

/**
 * A usable page is a whole number from 1 to the page count. The count is
 * optional because a reader may know the page without knowing how many there
 * are; when it is known, a number past it is a misread and not a page.
 */
export function toPageNumber(
	value: number,
	pageCount: number | null,
): number | null {
	if (!Number.isSafeInteger(value) || value < 1) return null;
	if (pageCount !== null && value > pageCount) return null;
	return value;
}

/** The page count the toolbar box advertises in its `max`, when it has one. */
export function parsePageCount(max: string): number | null {
	const text = max.trim();
	if (!DIGITS.test(text)) return null;
	return toPageNumber(Number(text), null);
}

/**
 * The toolbar box, when it is the number input. A text input holds a label,
 * and a label that happens to be digits ("12" printed on the thirtieth page)
 * is exactly the misread this guards against, so the input type decides and
 * the value alone never does.
 */
export function parsePageInput(
	type: string,
	value: string,
	pageCount: number | null,
): number | null {
	if (type !== 'number') return null;
	const text = value.trim();
	if (!DIGITS.test(text)) return null;
	return toPageNumber(Number(text), pageCount);
}

export interface LabelledPage {
	page: number;
	label: string | null;
}

/**
 * The page a label names, when exactly one page carries it. Labels can
 * repeat (a cover and a chapter both numbered "1"), and a repeated label
 * names no single page, so it answers null and the next reader takes over.
 */
export function pageForLabel(
	label: string,
	pages: readonly LabelledPage[],
): number | null {
	if (label.length === 0) return null;
	let found: number | null = null;
	for (const candidate of pages) {
		if (candidate.label !== label) continue;
		if (found !== null) return null;
		found = candidate.page;
	}
	return found;
}

export interface Box {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export interface PageBox extends Box {
	page: number;
}

/**
 * The page with the largest share of itself inside the viewport, lowest
 * number on a tie. That is pdf.js's own rule for the number it shows in the
 * toolbar, so the two agree whenever both can be read. A view that is not
 * laid out (a background tab) has empty boxes and answers null.
 */
export function mostVisiblePage(
	pages: readonly PageBox[],
	viewport: Box,
): number | null {
	let best: number | null = null;
	let bestShare = 0;
	for (const box of pages) {
		const area = (box.bottom - box.top) * (box.right - box.left);
		if (!(area > 0)) continue;
		const height =
			Math.min(box.bottom, viewport.bottom) - Math.max(box.top, viewport.top);
		const width =
			Math.min(box.right, viewport.right) - Math.max(box.left, viewport.left);
		if (!(height > 0) || !(width > 0)) continue;
		const share = (height * width) / area;
		const better =
			share > bestShare ||
			(share === bestShare && best !== null && box.page < best);
		if (better) {
			best = box.page;
			bestShare = share;
		}
	}
	return best;
}

/** Which reader answered, for the debug log and the detected-page notice. */
export type PageSource = 'toolbar' | 'label' | 'visible' | 'none';

export interface PageReading {
	/** The answer: the first reader below that produced one. */
	page: number | null;
	source: PageSource;
	/** What each reader said on its own, so a disagreement shows up. */
	toolbar: number | null;
	label: number | null;
	visible: number | null;
	pageCount: number | null;
}

const NO_READING: PageReading = {
	page: null,
	source: 'none',
	toolbar: null,
	label: null,
	visible: null,
	pageCount: null,
};

/**
 * The order of trust. The toolbar number is the page Obsidian itself says it
 * is on, and it holds in a background tab. A unique label is the same number
 * reached through the label the toolbar shows instead. Geometry comes last
 * because it needs the view laid out, and it is the only reader left when
 * the toolbar is missing or the label is ambiguous.
 */
export function chooseReading(
	toolbar: number | null,
	label: number | null,
	visible: number | null,
	pageCount: number | null,
): PageReading {
	const base = { toolbar, label, visible, pageCount };
	if (toolbar !== null) return { page: toolbar, source: 'toolbar', ...base };
	if (label !== null) return { page: label, source: 'label', ...base };
	if (visible !== null) return { page: visible, source: 'visible', ...base };
	return { page: null, source: 'none', ...base };
}

/** One line for the debug log and the notice. */
export function describeReading(reading: PageReading): string {
	const show = (value: number | null) => (value === null ? '-' : String(value));
	return `page ${show(reading.page)} (${reading.source}; toolbar ${show(reading.toolbar)}, label ${show(reading.label)}, visible ${show(reading.visible)}, of ${show(reading.pageCount)})`;
}

/**
 * The DOM half, kept thin: it collects what the pure readers above need and
 * decides nothing itself. It reads and never writes, and it runs inside the
 * tap, before any await, so the page is the one on screen when the user
 * tapped. Anything unexpected reads as "no page".
 */
export function readPage(root: HTMLElement): PageReading {
	try {
		return collectReading(root);
	} catch {
		return NO_READING;
	}
}

function collectReading(root: HTMLElement): PageReading {
	const pageEls = Array.from(root.querySelectorAll<HTMLElement>(PAGE_SELECTOR));
	const input = root.querySelector<HTMLInputElement>(PAGE_INPUT_SELECTOR);
	const pageCount =
		pageEls.length > 0
			? pageEls.length
			: input
				? parsePageCount(input.max)
				: null;

	const numbered: { el: HTMLElement; page: number }[] = [];
	for (const el of pageEls) {
		const page = parsePageInput(
			'number',
			el.getAttribute('data-page-number') ?? '',
			pageCount,
		);
		if (page !== null) numbered.push({ el, page });
	}

	const toolbar = input
		? parsePageInput(input.type, input.value, pageCount)
		: null;

	// Only a text input holds a label; a number input was answered above.
	const label =
		input && input.type !== 'number'
			? pageForLabel(
					input.value,
					numbered.map(({ el, page }) => ({
						page,
						label: el.getAttribute('data-page-label'),
					})),
				)
			: null;

	const scroller =
		numbered[0]?.el.closest<HTMLElement>(SCROLLER_SELECTOR) ?? root;
	const visible = mostVisiblePage(
		numbered.map(({ el, page }) => {
			const rect = el.getBoundingClientRect();
			return {
				page,
				top: rect.top,
				bottom: rect.bottom,
				left: rect.left,
				right: rect.right,
			};
		}),
		scroller.getBoundingClientRect(),
	);

	return chooseReading(toolbar, label, visible, pageCount);
}

function isPdf(file: TFile): boolean {
	return file.extension.toLowerCase() === 'pdf';
}

/** The view, if it is a loaded PDF view showing this file. */
function pdfViewOf(view: unknown, file: TFile): FileView | null {
	if (!(view instanceof FileView)) return null;
	if (view.getViewType() !== PDF_VIEW_TYPE) return null;
	return view.file?.path === file.path ? view : null;
}

/**
 * Where the page is read from, per tap point. The header pencil hands over
 * its own view. A menu hands over the leaf it was opened on, when it was
 * opened on one. The command palette has neither, so the active view is
 * next. Last comes an open tab for the file: the only one, or the most
 * recent when there are several. A file that is open nowhere has no page,
 * and so has a tab Obsidian has not loaded yet.
 */
export function findPdfView(
	app: App,
	file: TFile,
	hint: PageHint = {},
): FileView | null {
	const hinted =
		pdfViewOf(hint.view, file) ?? pdfViewOf(hint.leaf?.view, file);
	if (hinted) return hinted;

	const active = pdfViewOf(app.workspace.getActiveViewOfType(FileView), file);
	if (active) return active;

	const open: { leaf: WorkspaceLeaf; view: FileView }[] = [];
	for (const leaf of app.workspace.getLeavesOfType(PDF_VIEW_TYPE)) {
		const view = pdfViewOf(leaf.view, file);
		if (view) open.push({ leaf, view });
	}
	const [only] = open;
	if (open.length === 1 && only) return only.view;
	if (open.length > 1) {
		const recent = app.workspace.getMostRecentLeaf();
		const match = open.find(({ leaf }) => leaf === recent);
		if (match) return match.view;
	}
	return null;
}

export interface PageHint {
	view?: FileView | null;
	leaf?: WorkspaceLeaf | null;
}

/**
 * The reading for a file at tap time. Images have no pages, and a PDF that
 * no view is showing has none to read; both answer the empty reading.
 */
export function readPageFor(
	app: App,
	file: TFile,
	hint: PageHint = {},
): PageReading {
	if (!isPdf(file)) return NO_READING;
	const view = findPdfView(app, file, hint);
	return view ? readPage(view.containerEl) : NO_READING;
}
