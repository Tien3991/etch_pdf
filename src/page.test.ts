import { describe, expect, it, vi } from 'vitest';

// The obsidian package ships type definitions only. page.ts uses FileView as
// a runtime value, for the instanceof check that tells a loaded view from a
// deferred one.
vi.mock('obsidian', () => ({
	FileView: class {},
}));

import { FileView } from 'obsidian';
import {
	Box,
	PDF_VIEW_TYPE,
	PageBox,
	chooseReading,
	describeReading,
	findPdfView,
	mostVisiblePage,
	pageForLabel,
	parsePageCount,
	parsePageInput,
	readPage,
	readPageFor,
	toPageNumber,
} from './page';

type AppArg = Parameters<typeof findPdfView>[0];
type FileArg = Parameters<typeof findPdfView>[1];

describe('toPageNumber', () => {
	it('accepts a whole page inside the document', () => {
		expect(toPageNumber(1, 12)).toBe(1);
		expect(toPageNumber(12, 12)).toBe(12);
	});

	it('accepts any whole page when the count is unknown', () => {
		expect(toPageNumber(4000, null)).toBe(4000);
	});

	it('rejects what is not a page', () => {
		for (const value of [0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(toPageNumber(value, null)).toBeNull();
		}
	});

	it('rejects a number past the last page', () => {
		expect(toPageNumber(13, 12)).toBeNull();
	});
});

describe('parsePageCount', () => {
	it('reads the max the toolbar box carries', () => {
		expect(parsePageCount('412')).toBe(412);
	});

	it('answers null when there is none', () => {
		for (const max of ['', '0', 'many', '-1', '1.5']) {
			expect(parsePageCount(max)).toBeNull();
		}
	});
});

describe('parsePageInput', () => {
	it('reads the number input', () => {
		expect(parsePageInput('number', '137', 412)).toBe(137);
		expect(parsePageInput('number', ' 5 ', 12)).toBe(5);
	});

	it('never reads a text input as a number', () => {
		// With page labels the box is a text input holding the label, and a
		// label can be digits: "12" printed on the thirtieth page.
		expect(parsePageInput('text', '12', 412)).toBeNull();
		expect(parsePageInput('text', 'iv', 412)).toBeNull();
	});

	it('rejects a value that is not a whole page', () => {
		for (const value of ['', '0', '-1', '3.5', '1e3', 'iv', '12abc']) {
			expect(parsePageInput('number', value, 412)).toBeNull();
		}
	});

	it('rejects a number past the page count', () => {
		expect(parsePageInput('number', '413', 412)).toBeNull();
		expect(parsePageInput('number', '413', null)).toBe(413);
	});
});

describe('pageForLabel', () => {
	const pages = [
		{ page: 1, label: 'i' },
		{ page: 2, label: 'ii' },
		{ page: 3, label: '1' },
		{ page: 4, label: '2' },
		{ page: 5, label: null },
	];

	it('finds the one page carrying the label', () => {
		expect(pageForLabel('ii', pages)).toBe(2);
		// The label "2" is the fourth page, not the second.
		expect(pageForLabel('2', pages)).toBe(4);
	});

	it('answers null for a label no page carries', () => {
		expect(pageForLabel('xii', pages)).toBeNull();
		expect(pageForLabel('', pages)).toBeNull();
	});

	it('answers null when the label repeats', () => {
		// A cover and a chapter both numbered "1" name no single page.
		expect(
			pageForLabel('1', [
				{ page: 1, label: '1' },
				{ page: 2, label: 'i' },
				{ page: 3, label: '1' },
			]),
		).toBeNull();
	});
});

describe('mostVisiblePage', () => {
	const viewport: Box = { top: 100, bottom: 900, left: 0, right: 600 };
	const page = (number: number, top: number, bottom: number): PageBox => ({
		page: number,
		top,
		bottom,
		left: 0,
		right: 600,
	});

	it('picks the page that fills the viewport', () => {
		expect(
			mostVisiblePage(
				[page(4, -700, 90), page(5, 100, 900), page(6, 910, 1710)],
				viewport,
			),
		).toBe(5);
	});

	it('picks the larger share when two pages show', () => {
		// 30% of page 5 and 70% of page 6.
		expect(
			mostVisiblePage([page(5, -460, 340), page(6, 350, 1150)], viewport),
		).toBe(6);
	});

	it('takes the lower number on a tie, in either order', () => {
		const upper = page(5, -300, 500);
		const lower = page(6, 500, 1300);
		expect(mostVisiblePage([upper, lower], viewport)).toBe(5);
		expect(mostVisiblePage([lower, upper], viewport)).toBe(5);
	});

	it('handles a page taller than the viewport', () => {
		// Zoomed in: page 5 covers the whole viewport, page 6 shows a sliver.
		expect(
			mostVisiblePage([page(5, -500, 880), page(6, 890, 2270)], viewport),
		).toBe(5);
	});

	it('counts only what is inside the viewport sideways too', () => {
		const half: PageBox = { page: 2, top: 100, bottom: 900, left: 300, right: 900 };
		const full: PageBox = { page: 3, top: 100, bottom: 900, left: 0, right: 300 };
		expect(mostVisiblePage([half, full], viewport)).toBe(3);
	});

	it('answers null when nothing is on screen', () => {
		expect(mostVisiblePage([page(1, 1000, 1800)], viewport)).toBeNull();
		expect(mostVisiblePage([], viewport)).toBeNull();
	});

	it('answers null for a view that is not laid out', () => {
		// A background tab: every box is empty.
		const empty: Box = { top: 0, bottom: 0, left: 0, right: 0 };
		expect(
			mostVisiblePage(
				[
					{ page: 1, ...empty },
					{ page: 2, ...empty },
				],
				empty,
			),
		).toBeNull();
	});
});

describe('chooseReading', () => {
	it('trusts the toolbar first, then the label, then geometry', () => {
		expect(chooseReading(7, 8, 9, 12)).toMatchObject({
			page: 7,
			source: 'toolbar',
		});
		expect(chooseReading(null, 8, 9, 12)).toMatchObject({
			page: 8,
			source: 'label',
		});
		expect(chooseReading(null, null, 9, 12)).toMatchObject({
			page: 9,
			source: 'visible',
		});
	});

	it('answers no page when no reader does', () => {
		expect(chooseReading(null, null, null, null)).toEqual({
			page: null,
			source: 'none',
			toolbar: null,
			label: null,
			visible: null,
			pageCount: null,
		});
	});

	it('keeps every reader visible beside the answer', () => {
		expect(chooseReading(7, null, 9, 12)).toEqual({
			page: 7,
			source: 'toolbar',
			toolbar: 7,
			label: null,
			visible: 9,
			pageCount: 12,
		});
	});
});

describe('describeReading', () => {
	it('names the answer, its source, and each reader', () => {
		expect(describeReading(chooseReading(7, null, 9, 12))).toBe(
			'page 7 (toolbar; toolbar 7, label -, visible 9, of 12)',
		);
		expect(describeReading(chooseReading(null, null, null, null))).toBe(
			'page - (none; toolbar -, label -, visible -, of -)',
		);
	});
});

/**
 * Stand-ins for the handful of DOM members readPage touches. The test
 * environment has no DOM, and these keep the adapter honest about how little
 * it asks of one.
 */
interface StubPage {
	number: string;
	label?: string;
	box: Box;
}

function stubRoot(
	pages: StubPage[],
	input: { type: string; value: string; max?: string } | null,
	scroller: Box,
): HTMLElement {
	const scrollerEl = { getBoundingClientRect: () => scroller };
	const pageEls = pages.map((page) => ({
		getAttribute: (name: string) =>
			name === 'data-page-number'
				? page.number
				: name === 'data-page-label'
					? (page.label ?? null)
					: null,
		getBoundingClientRect: () => page.box,
		closest: () => scrollerEl,
	}));
	return {
		querySelectorAll: () => pageEls,
		querySelector: () => (input ? { max: '', ...input } : null),
		getBoundingClientRect: () => scroller,
	} as unknown as HTMLElement;
}

describe('readPage', () => {
	const scroller: Box = { top: 100, bottom: 900, left: 0, right: 600 };
	const column = (count: number, firstTop: number, labels?: string[]) =>
		Array.from({ length: count }, (_, index) => ({
			number: String(index + 1),
			label: labels?.[index],
			box: {
				top: firstTop + index * 810,
				bottom: firstTop + index * 810 + 800,
				left: 0,
				right: 600,
			},
		}));

	it('reads the toolbar number and cross-checks it against geometry', () => {
		// Scrolled so that page 3 fills the viewport.
		const reading = readPage(
			stubRoot(column(6, 100 - 2 * 810), { type: 'number', value: '3' }, scroller),
		);
		expect(reading).toEqual({
			page: 3,
			source: 'toolbar',
			toolbar: 3,
			label: null,
			visible: 3,
			pageCount: 6,
		});
	});

	it('maps a label back to its page', () => {
		const labels = ['i', 'ii', '1', '2', '3', '4'];
		const reading = readPage(
			stubRoot(
				column(6, 100 - 3 * 810, labels),
				{ type: 'text', value: '2' },
				scroller,
			),
		);
		// The label "2" is the fourth page, which is also the one on screen.
		expect(reading).toMatchObject({
			page: 4,
			source: 'label',
			toolbar: null,
			label: 4,
			visible: 4,
		});
	});

	it('falls back to geometry when the label repeats', () => {
		const labels = ['1', 'i', '1', '2', '3', '4'];
		const reading = readPage(
			stubRoot(
				column(6, 100 - 2 * 810, labels),
				{ type: 'text', value: '1' },
				scroller,
			),
		);
		expect(reading).toMatchObject({ page: 3, source: 'visible', label: null });
	});

	it('falls back to geometry when there is no toolbar box', () => {
		const reading = readPage(stubRoot(column(6, 100 - 4 * 810), null, scroller));
		expect(reading).toMatchObject({ page: 5, source: 'visible', pageCount: 6 });
	});

	it('keeps the toolbar number for a view that is not laid out', () => {
		const empty: Box = { top: 0, bottom: 0, left: 0, right: 0 };
		const pages = Array.from({ length: 6 }, (_, index) => ({
			number: String(index + 1),
			box: empty,
		}));
		const reading = readPage(
			stubRoot(pages, { type: 'number', value: '5' }, empty),
		);
		expect(reading).toMatchObject({ page: 5, source: 'toolbar', visible: null });
	});

	it('rejects a toolbar number past the last page', () => {
		const reading = readPage(
			stubRoot(column(6, 100), { type: 'number', value: '40' }, scroller),
		);
		expect(reading).toMatchObject({ page: 1, source: 'visible', toolbar: null });
	});

	it('uses the box max as the count when no page element is found', () => {
		const reading = readPage(
			stubRoot([], { type: 'number', value: '9', max: '12' }, scroller),
		);
		expect(reading).toMatchObject({ page: 9, source: 'toolbar', pageCount: 12 });
		expect(
			readPage(stubRoot([], { type: 'number', value: '13', max: '12' }, scroller))
				.page,
		).toBeNull();
	});

	it('ignores a page element with an unusable number', () => {
		const pages = [
			{ number: 'x', box: { top: 100, bottom: 900, left: 0, right: 600 } },
			{ number: '2', box: { top: 910, bottom: 1710, left: 0, right: 600 } },
		];
		expect(readPage(stubRoot(pages, null, scroller)).page).toBeNull();
	});

	it('answers no page instead of throwing', () => {
		const broken = {
			querySelectorAll: () => {
				throw new Error('no such thing');
			},
		} as unknown as HTMLElement;
		expect(readPage(broken)).toMatchObject({ page: null, source: 'none' });
	});
});

/** A loaded view: an instance of the mocked FileView, as Obsidian's are. */
function stubView(path: string, type = PDF_VIEW_TYPE): FileView {
	const view = new (FileView as unknown as new () => FileView)();
	return Object.assign(view, {
		file: { path },
		getViewType: () => type,
		containerEl: {},
	});
}

/** A tab Obsidian has not loaded: its view is not a FileView at all. */
function deferredView(path: string): unknown {
	return { file: { path }, getViewType: () => PDF_VIEW_TYPE };
}

function stubApp(options: {
	active?: unknown;
	leaves?: { view: unknown }[];
	recent?: { view: unknown } | null;
}): AppArg {
	return {
		workspace: {
			getActiveViewOfType: () => options.active ?? null,
			getLeavesOfType: () => options.leaves ?? [],
			getMostRecentLeaf: () => options.recent ?? null,
		},
	} as unknown as AppArg;
}

const pdf = { path: 'Books/Analysis.pdf', extension: 'pdf' } as FileArg;

describe('findPdfView', () => {
	it('uses the view the pencil belongs to', () => {
		const tapped = stubView(pdf.path);
		const other = stubView(pdf.path);
		expect(findPdfView(stubApp({ active: other }), pdf, { view: tapped })).toBe(
			tapped,
		);
	});

	it('uses the leaf a menu was opened on', () => {
		const onLeaf = stubView(pdf.path);
		const hint = { leaf: { view: onLeaf } } as unknown as Parameters<
			typeof findPdfView
		>[2];
		expect(findPdfView(stubApp({ active: stubView(pdf.path) }), pdf, hint)).toBe(
			onLeaf,
		);
	});

	it('falls back to the active view', () => {
		const active = stubView(pdf.path);
		expect(findPdfView(stubApp({ active }), pdf)).toBe(active);
	});

	it('falls back to the only open tab for the file', () => {
		const open = stubView(pdf.path);
		const app = stubApp({
			active: stubView('Notes/Other.pdf'),
			leaves: [{ view: stubView('Notes/Other.pdf') }, { view: open }],
		});
		expect(findPdfView(app, pdf)).toBe(open);
	});

	it('picks the most recent tab when the file is open twice', () => {
		const first = { view: stubView(pdf.path) };
		const second = { view: stubView(pdf.path) };
		expect(
			findPdfView(stubApp({ leaves: [first, second], recent: second }), pdf),
		).toBe(second.view);
	});

	it('answers null when the file is open twice and neither is recent', () => {
		const first = { view: stubView(pdf.path) };
		const second = { view: stubView(pdf.path) };
		const elsewhere = { view: stubView('Notes/Other.pdf') };
		expect(
			findPdfView(stubApp({ leaves: [first, second], recent: elsewhere }), pdf),
		).toBeNull();
	});

	it('ignores a view showing another file', () => {
		const other = stubView('Notes/Other.pdf');
		expect(findPdfView(stubApp({ active: other }), pdf, { view: other })).toBeNull();
	});

	it('ignores a view of another type', () => {
		const image = stubView(pdf.path, 'image');
		expect(findPdfView(stubApp({ active: image }), pdf, { view: image })).toBeNull();
	});

	it('ignores a tab Obsidian has not loaded', () => {
		const app = stubApp({ leaves: [{ view: deferredView(pdf.path) }] });
		expect(findPdfView(app, pdf)).toBeNull();
	});
});

describe('readPageFor', () => {
	it('has no page for an image', () => {
		const image = { path: 'Sheet.png', extension: 'png' } as FileArg;
		const app = stubApp({ active: stubView(image.path) });
		expect(readPageFor(app, image)).toMatchObject({ page: null, source: 'none' });
	});

	it('has no page for a PDF no view is showing', () => {
		expect(readPageFor(stubApp({}), pdf)).toMatchObject({
			page: null,
			source: 'none',
		});
	});

	it('folds the extension case', () => {
		const upper = { path: 'SCAN.PDF', extension: 'PDF' } as FileArg;
		const view = stubView(upper.path);
		Object.assign(view, {
			containerEl: stubRoot(
				[{ number: '1', box: { top: 0, bottom: 800, left: 0, right: 600 } }],
				{ type: 'number', value: '1' },
				{ top: 0, bottom: 800, left: 0, right: 600 },
			),
		});
		expect(readPageFor(stubApp({ active: view }), upper)).toMatchObject({
			page: 1,
			source: 'toolbar',
		});
	});
});
