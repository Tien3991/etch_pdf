import { Menu, Notice, Platform, Plugin, TFile, normalizePath } from 'obsidian';
import { ViewActions } from './actions';
import { EtchSettings, parseSettings } from './config';
import { isMarkupFile } from './formats';
import { handOffTo } from './handoff';
import { EtchLog } from './log';
import { TargetPicker } from './picker';
import { ImageRefresh } from './refresh';
import type { Navigate } from './routes';
import { EtchSettingTab } from './settings';
import {
	Target,
	listTargets,
	resolveTarget,
	targetIcon,
	targetShortLabel,
	targetTitle,
} from './targets';
import {
	WitnessRecord,
	WitnessReport,
	checkWitnessRecord,
	isWitnessRecord,
} from './witness';

interface EtchData {
	settings: EtchSettings;
	witness: WitnessRecord | null;
}

const MARK_UP_NAME = 'Mark up with Pencil';
const MARK_UP_ICON = 'pencil';
const CHOOSE_APP_NAME = 'Mark up with Pencil in another app';
const CHOOSE_APP_ICON = 'list';
const APP_MENU_NAME = 'Choose app';
const RECHECK_DELAY_MS = 3000;

function isIpad(): boolean {
	return Platform.isIosApp && Platform.isTablet;
}

export default class EtchPlugin extends Plugin {
	settings!: EtchSettings;
	log!: EtchLog;
	private viewActions!: ViewActions;
	private witnessRecord: WitnessRecord | null = null;
	private rejectedRoute: string | null = null;
	private rejectedWitness = false;
	private unloaded = false;
	/**
	 * How a handoff leaves the webview. Both stay undefined in use, which
	 * selects the real navigation and Obsidian's own share sheet; they are
	 * fields so a desk check can watch a handoff without one happening.
	 */
	private navigate: Navigate | undefined = undefined;
	private share: ((vaultPath: string) => Promise<boolean>) | undefined =
		undefined;
	/** Serializes plugin-data writes; saveData replaces the whole file. */
	private saveQueue: Promise<void> = Promise.resolve();

	async onload() {
		this.register(() => {
			this.unloaded = true;
		});
		await this.loadPluginData();

		const pluginDir =
			this.manifest.dir ??
			[this.app.vault.configDir, 'plugins', this.manifest.id].join('/');
		this.log = new EtchLog(
			this.app,
			normalizePath(`${pluginDir}/etch-debug.md`),
			() => {
				new Notice(
					'Etch could not write its debug log, so the log is incomplete.',
					10000,
				);
			},
		);
		this.log.setEnabled(this.settings.debugLogging);

		this.addSettingTab(new EtchSettingTab(this.app, this));

		this.addCommand({
			id: 'mark-up',
			name: MARK_UP_NAME,
			icon: MARK_UP_ICON,
			checkCallback: (checking) => {
				if (!isIpad()) return false;
				const file = this.activeMarkupFile();
				if (!file) return false;
				if (!checking) void this.markUp(file);
				return true;
			},
		});

		this.addCommand({
			id: 'mark-up-choose-app',
			name: CHOOSE_APP_NAME,
			icon: CHOOSE_APP_ICON,
			checkCallback: (checking) => {
				if (!isIpad()) return false;
				const file = this.activeMarkupFile();
				if (!file) return false;
				if (!checking) this.chooseApp(file);
				return true;
			},
		});

		this.addCommand({
			id: 'verify-last-handoff',
			name: 'Verify last handoff',
			checkCallback: (checking) => {
				if (!isIpad() || !this.settings.debugLogging) return false;
				if (!checking) void this.verifyLastHandoff('manual');
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!isIpad() || !(file instanceof TFile) || !isMarkupFile(file)) {
					return;
				}
				menu.addItem((item) =>
					item
						.setTitle(MARK_UP_NAME)
						.setIcon(MARK_UP_ICON)
						.setSection('open')
						.onClick(() => {
							void this.markUp(file);
						}),
				);
				menu.addItem((item) =>
					item
						.setTitle(CHOOSE_APP_NAME)
						.setIcon(CHOOSE_APP_ICON)
						.setSection('open')
						.onClick(() => {
							this.chooseApp(file);
						}),
				);
			}),
		);

		this.viewActions = new ViewActions(this.app, {
			icon: MARK_UP_ICON,
			title: MARK_UP_NAME,
			menuTitle: APP_MENU_NAME,
			label: () => targetShortLabel(this.defaultTarget()),
			onMain: (file) => {
				void this.markUp(file);
			},
			onMenu: (file, _view, anchor) => {
				this.showAppMenu(file, anchor);
			},
		});
		this.register(() => {
			this.viewActions.dispose();
		});
		const syncViewActions = () => {
			if (isIpad()) this.viewActions.sync();
		};
		this.registerEvent(this.app.workspace.on('layout-change', syncViewActions));
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', syncViewActions),
		);
		// An image view is reused for the next image opened in it, and a rename
		// can change a file's format, so the action has to be reconsidered when
		// the file changes, not only when the layout does.
		this.registerEvent(this.app.workspace.on('file-open', syncViewActions));
		this.registerEvent(this.app.vault.on('rename', syncViewActions));
		this.whenReady(syncViewActions);

		this.registerImageRefresh();

		// Deferred so onload does no I/O of its own (engineering rule 10).
		if (this.rejectedRoute !== null || this.rejectedWitness) {
			const rejectedRoute = this.rejectedRoute;
			const rejectedWitness = this.rejectedWitness;
			this.whenReady(() => {
				if (rejectedRoute !== null) {
					void this.log.line(
						`stored default app ${rejectedRoute} is not known; using ${this.settings.target}`,
					);
				}
				if (rejectedWitness) {
					void this.log.line(
						'stored witness record has an unexpected shape; discarded',
					);
				}
			});
		}

		// Webview-teardown recovery: if a handoff is still armed from a
		// previous session, check it once the workspace is ready.
		if (this.witnessRecord) {
			this.whenReady(() => {
				void this.verifyLastHandoff('automatic');
			});
		}
	}

	/**
	 * Deferred startup work, dropped if the plugin is gone by the time layout
	 * is ready. A plugin loads before that point and `onLayoutReady` is a
	 * workspace-owned queue with nothing to unsubscribe from, so a disable
	 * inside that window would otherwise run teardown first and this work
	 * second: buttons nothing will remove, and a log written by a plugin that
	 * is no longer loaded.
	 */
	private whenReady(work: () => void): void {
		this.app.workspace.onLayoutReady(() => {
			if (this.unloaded) return;
			work();
		});
	}

	/**
	 * PDF views refresh themselves after an external write; images do not, and
	 * the fix has to sit in the render paths rather than run once per handoff
	 * (spike session 6). Registration only: the mutation observer behind it
	 * starts with the first observed image change, so nothing here touches the
	 * DOM at startup.
	 */
	private registerImageRefresh(): void {
		if (!isIpad()) return;
		const refresh = new ImageRefresh(this.app, this.log);
		this.register(() => {
			refresh.dispose();
		});
		this.registerMarkdownPostProcessor((el) => {
			refresh.applyTo(el);
		});
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) refresh.fileModified(file);
			}),
		);
	}

	private activeMarkupFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file || !isMarkupFile(file)) return null;
		return file;
	}

	/**
	 * The one way a handoff starts, so the format check lives here as well as
	 * on the controls: a file can be renamed while a menu built for it is
	 * still open. The catch is for the unexpected only. Everything the handoff
	 * can be expected to fail at already reports for itself, so anything
	 * arriving here would otherwise be an unhandled rejection with nothing on
	 * screen and nothing in the log.
	 */
	private async markUp(file: TFile, chosen?: Target): Promise<void> {
		if (!isMarkupFile(file)) {
			await this.log.error(`${file.path} is not a format Etch hands off`);
			return;
		}
		// No choice means the default app: the left half of the button, the
		// command, and the file menu's first entry.
		const target = chosen ?? this.defaultTarget();
		try {
			await handOffTo(
				{
					app: this.app,
					log: this.log,
					arm: async (record) => {
						this.witnessRecord = record;
						await this.savePluginData();
					},
					navigate: this.navigate,
					share: this.share,
				},
				file,
				target,
			);
		} catch (error) {
			new Notice('Etch could not complete the handoff.');
			await this.log.error(`handoff failed for ${file.path}`, error);
		}
	}

	/**
	 * The destination the setting names, or the Files viewer when it names
	 * none. Resolved on every use: the app it points at can be deleted, on
	 * this device or on another one that syncs the same data.json.
	 */
	private defaultTarget(): Target {
		return resolveTarget(this.settings.target, this.settings.apps).target;
	}

	/**
	 * The right half of the button: every destination, the default one
	 * ticked. Choosing one hands off to it once and leaves the setting alone.
	 */
	private showAppMenu(file: TFile, anchor: HTMLElement): void {
		const fallback = this.defaultTarget();
		const menu = new Menu();
		for (const target of listTargets(this.settings.apps)) {
			menu.addItem((item) =>
				item
					.setTitle(targetTitle(target))
					.setIcon(targetIcon(target))
					.setChecked(target.id === fallback.id)
					.onClick(() => {
						void this.markUp(file, target);
					}),
			);
		}
		// Hung under the button and opening leftward from its right edge, so
		// the menu covers neither half and stays inside the view.
		const rect = anchor.getBoundingClientRect();
		menu.showAtPosition(
			{ x: rect.right, y: rect.bottom, left: true },
			anchor.doc,
		);
	}

	/** The same list for the tap points with no button: a picker. */
	private chooseApp(file: TFile): void {
		new TargetPicker(this.app, listTargets(this.settings.apps), (target) => {
			void this.markUp(file, target);
		}).open();
	}

	/**
	 * The manual command may be rerun freely and the latest result
	 * supersedes; it never clears the record. The automatic startup check
	 * reports at most once, absorbs Preview's save timing with one delayed
	 * re-read, and then clears the record, including when the check failed:
	 * a record that never cleared would repeat on every launch, and neither
	 * a missing file nor a check that throws can resolve itself. The one
	 * exception is an unload mid-recheck, which leaves the record armed so
	 * the next launch can try again.
	 */
	private async verifyLastHandoff(mode: 'manual' | 'automatic'): Promise<void> {
		const record = this.witnessRecord;
		if (!record) {
			if (mode === 'manual') new Notice('No armed handoff to verify.');
			return;
		}
		await this.logArmed(mode, record);
		try {
			let report = await checkWitnessRecord(this.app, record);
			let label = 'first read';
			if (mode === 'automatic' && report.outcome === 'unchanged') {
				// On the teardown-relaunch path the first read can precede
				// Preview's write by under a second.
				await this.logResult(mode, label, record, report);
				const recheck = await this.recheckAfterDelay(record);
				if (!recheck) {
					// Unloaded while waiting. Leave the record armed.
					await this.log.line(`verify (${mode}) recheck abandoned on unload`);
					return;
				}
				report = recheck;
				label = 'recheck';
			}
			await this.logResult(mode, label, record, report);
			if (mode === 'manual') {
				new Notice(report.summary, 10000);
				return;
			}
			if (report.outcome === 'changed') {
				new Notice(report.summary, 10000);
			}
			await this.clearWitness(record);
		} catch (error) {
			await this.log.error(`verify failed for ${record.vaultPath}`, error);
			if (mode === 'manual') {
				new Notice('Verify failed; see the console or debug log.');
			} else {
				// Nothing about this check can succeed on a later launch.
				await this.clearWitness(record);
			}
		}
	}

	/**
	 * Identity guard: a handoff armed while a check was in flight must not be
	 * wiped by that check.
	 */
	private async clearWitness(record: WitnessRecord): Promise<void> {
		if (this.witnessRecord !== record) return;
		this.witnessRecord = null;
		await this.savePluginData();
	}

	private logArmed(
		mode: 'manual' | 'automatic',
		record: WitnessRecord,
	): Promise<void> {
		return this.log.line(
			`verify (${mode}) ${record.vaultPath}: armed size=${record.size} mtime=${record.mtime} sha256=${record.sha256} armedAt=${new Date(record.armedAt).toISOString()}`,
		);
	}

	private async logResult(
		mode: 'manual' | 'automatic',
		label: string,
		record: WitnessRecord,
		report: WitnessReport,
	): Promise<void> {
		if (report.after) {
			await this.log.line(
				`verify (${mode}, ${label}) ${record.vaultPath}: current size=${report.after.size} mtime=${report.after.mtime} sha256=${report.after.sha256}`,
			);
		}
		await this.log.line(
			`verify (${mode}, ${label}) outcome: ${report.outcome}`,
		);
	}

	/**
	 * Resolves null if the plugin unloads before the delay elapses. Owning
	 * the timer here, rather than handing a timeout id to registerInterval,
	 * is what guarantees the promise always settles: a cancelled timer would
	 * otherwise leave the caller suspended for the life of the webview,
	 * holding this plugin instance with it.
	 */
	private recheckAfterDelay(
		record: WitnessRecord,
	): Promise<WitnessReport | null> {
		return new Promise((resolve, reject) => {
			let settled = false;
			const timer = window.setTimeout(() => {
				settled = true;
				checkWitnessRecord(this.app, record).then(resolve, reject);
			}, RECHECK_DELAY_MS);
			this.register(() => {
				if (settled) return;
				window.clearTimeout(timer);
				resolve(null);
			});
		});
	}

	async saveSettings(): Promise<void> {
		// The button names the default app, so it follows the setting.
		this.viewActions.refresh();
		await this.savePluginData();
	}

	/**
	 * data.json is hand-editable, syncs between devices, and can come from a
	 * newer or older build, so every field is rebuilt from it rather than
	 * spread over the defaults. A route this build does not know falls back
	 * to the default; a malformed witness record is dropped rather than
	 * carried into a check that would fail on every launch.
	 */
	private async loadPluginData(): Promise<void> {
		const raw = (await this.loadData()) as Partial<EtchData> | null;
		const parsed = parseSettings(raw?.settings);
		this.settings = parsed.settings;
		this.rejectedRoute = parsed.rejectedTarget;

		this.witnessRecord = isWitnessRecord(raw?.witness) ? raw.witness : null;
		if (raw?.witness != null && !this.witnessRecord) {
			this.rejectedWitness = true;
		}
	}

	/**
	 * saveData replaces the whole file, so concurrent callers could otherwise
	 * land out of order and persist a stale snapshot over a fresh one.
	 */
	private savePluginData(): Promise<void> {
		// The snapshot is taken when the write runs, not when it is queued,
		// so the file always ends up matching the latest in-memory state.
		const done = this.saveQueue.then(() => {
			const data: EtchData = {
				settings: this.settings,
				witness: this.witnessRecord,
			};
			return this.saveData(data);
		});
		// The chain survives a failed write; the caller still sees it, which
		// is what lets a failed arm fall back to a handoff without a witness.
		this.saveQueue = done.catch(() => {});
		return done;
	}
}
