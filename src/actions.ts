import { App, FileView, TFile } from 'obsidian';
import { isMarkupFile } from './formats';

/**
 * The view header control, installed per open view that holds a file Etch
 * can hand off. Kept out of main.ts so that file stays lifecycle and
 * registration.
 *
 * It is a split button. The left half hands the file to the default app and
 * names that app; the right half opens the list of apps for a one-off
 * choice. Both halves are ordinary header actions, made through the public
 * `addAction`, and then moved into one wrapper so they read as one control
 * whatever gap the header puts between its own buttons.
 */

/**
 * Obsidian's own view types for the two file kinds this plugin acts on.
 * Neither id is exported by the API, so both are strings this plugin asserts:
 * `pdf` carried the action through the wave 1 and wave 2 device sessions, and
 * `image` is unverified until the wave 3 session. A wrong id costs the header
 * action in that view and nothing else, since every other tap point is
 * independent of it.
 */
export const MARKUP_VIEW_TYPES = ['pdf', 'image'] as const;

const VIEW_ACTION_CLASS = 'etch-view-action';
const SPLIT_CLASS = 'etch-split';
const SPLIT_MAIN_CLASS = 'etch-split-main';
const SPLIT_MENU_CLASS = 'etch-split-menu';
const SPLIT_LABEL_CLASS = 'etch-split-label';
const MENU_ICON = 'chevron-down';

export interface SplitButton {
	icon: string;
	/** The left half's accessible name, before the app's name is added. */
	title: string;
	/** The right half's accessible name. */
	menuTitle: string;
	/** The default app's short name, read whenever a button is built or refreshed. */
	label: () => string;
	onMain: (file: TFile, view: FileView) => void;
	/** The anchor is the whole button, so the menu can hang under it. */
	onMenu: (file: TFile, view: FileView, anchor: HTMLElement) => void;
}

interface Installed {
	wrap: HTMLElement;
	main: HTMLElement;
	label: HTMLElement;
}

export class ViewActions {
	/**
	 * The elements this plugin created, keyed by the view holding each one.
	 * Presence is this map rather than a DOM query, and cleanup walks the
	 * elements in it rather than re-deriving them from a view type: a control
	 * installed in a view type a later build stops walking still comes out on
	 * unload. A control whose header was rebuilt reads as absent, since a
	 * detached element is no longer connected, so the next sync reinstalls it.
	 */
	private readonly installed = new Map<FileView, Installed>();

	constructor(
		private readonly app: App,
		private readonly button: SplitButton,
	) {}

	/**
	 * Brings the installed set in line with what is open. Cheap enough for a
	 * workspace event: it walks open leaves of two view types and touches the
	 * DOM only where something is missing or orphaned.
	 */
	sync(): void {
		const wanted = new Set<FileView>();
		for (const type of MARKUP_VIEW_TYPES) {
			for (const leaf of this.app.workspace.getLeavesOfType(type)) {
				const view = leaf.view;
				// The file is checked here, not at install time only, because
				// one image view is reused for the next image opened in it,
				// and Obsidian's image view opens formats Etch does not claim.
				if (view instanceof FileView && view.file && isMarkupFile(view.file)) {
					wanted.add(view);
				}
			}
		}

		for (const [view, control] of this.installed) {
			if (wanted.has(view) && control.wrap.isConnected) continue;
			control.wrap.remove();
			this.installed.delete(view);
		}
		for (const view of wanted) {
			if (this.installed.has(view)) continue;
			this.installed.set(view, this.install(view));
		}
	}

	/** Re-reads the default app's name, after the setting changed. */
	refresh(): void {
		for (const control of this.installed.values()) this.applyLabel(control);
	}

	dispose(): void {
		for (const control of this.installed.values()) control.wrap.remove();
		this.installed.clear();
	}

	/**
	 * The click closures hold their view and read `view.file` when they fire,
	 * so a file swap inside the same view acts on the file on screen. The
	 * elements die with the view, so the lifetimes match.
	 */
	private install(view: FileView): Installed {
		const fileOf = (): TFile | null => {
			const file = view.file;
			return file && isMarkupFile(file) ? file : null;
		};
		const main = view.addAction(this.button.icon, this.button.title, () => {
			const file = fileOf();
			if (file) this.button.onMain(file, view);
		});
		// The wrapper takes the main half's place in the header and then
		// holds both halves, in reading order whatever order the header
		// inserted them in.
		const wrap = main.doc.createElement('div');
		const menu = view.addAction(MENU_ICON, this.button.menuTitle, () => {
			const file = fileOf();
			if (file) this.button.onMenu(file, view, wrap);
		});
		wrap.addClass(SPLIT_CLASS);
		main.before(wrap);
		wrap.append(main, menu);

		main.addClasses([VIEW_ACTION_CLASS, SPLIT_MAIN_CLASS]);
		menu.addClasses([VIEW_ACTION_CLASS, SPLIT_MENU_CLASS]);
		// Obsidian labels its own header actions; setting it here makes the
		// accessible name this plugin's responsibility rather than an
		// assumption about Obsidian's internals (engineering rule 10).
		menu.setAttribute('aria-label', this.button.menuTitle);

		const control: Installed = {
			wrap,
			main,
			label: main.createSpan({ cls: SPLIT_LABEL_CLASS }),
		};
		this.applyLabel(control);
		return control;
	}

	private applyLabel(control: Installed): void {
		const label = this.button.label();
		control.label.setText(label);
		control.main.setAttribute('aria-label', `${this.button.title}: ${label}`);
	}
}
