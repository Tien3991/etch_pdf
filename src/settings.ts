import {
	App,
	Menu,
	Platform,
	PluginSettingTab,
	SettingDefinition,
	SettingDefinitionItem,
} from 'obsidian';
import { AppEditor } from './appEditor';
import {
	DEFAULT_SETTINGS,
	EtchSettings,
	addApp,
	moveApp,
	removeAppAt,
	updateApp,
} from './config';
import type EtchPlugin from './main';
import {
	APP_PRESETS,
	MAX_APPS,
	ShortcutApp,
	appName,
	appShortcut,
	findTarget,
	resolveTarget,
	targetOptions,
} from './targets';

export { DEFAULT_SETTINGS } from './config';
export type { EtchSettings } from './config';

export class EtchSettingTab extends PluginSettingTab {
	plugin: EtchPlugin;

	constructor(app: App, plugin: EtchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const { apps } = this.plugin.settings;
		return [
			{
				name: '',
				searchable: false,
				visible: !(Platform.isIosApp && Platform.isTablet),
				render: (setting) => {
					setting.settingEl.addClass('etch-platform-note');
					setting.setDesc(
						'Etch requires an iPad. It opens vault PDFs and images for Apple Pencil markup.',
					);
				},
			},
			{
				name: 'Default app',
				desc: createFragment((fragment) => {
					fragment.createDiv({
						text: 'The left half of the button on a PDF or image opens the file here. The right half lists every app, for a one-off choice.',
					});
					fragment.createDiv({
						text: 'Files viewer (default): opens the file in the Files viewer. Tap Markup, then the check mark to save before returning.',
					});
					fragment.createDiv({
						text: 'Preview: opens the file directly in Preview, which is smoother on small files. Large PDFs still open in the Files viewer, because Preview can lose markup on them.',
					});
					fragment.createDiv({
						text: 'An app from the list below: runs its shortcut, which opens the file in that app.',
					});
					fragment.createDiv({
						text: 'Other app (share sheet): shows the share sheet, where you pick the app each time.',
					});
				}),
				control: {
					type: 'dropdown',
					key: 'target',
					defaultValue: DEFAULT_SETTINGS.target,
					options: targetOptions(apps),
				},
			},
			{
				type: 'list',
				heading: 'Apps opened by a shortcut',
				emptyState: createFragment((fragment) => {
					fragment.createDiv({
						text: 'No apps yet. Add one to open files in an editor such as Xodo with one tap. Each app needs a shortcut, made once in the Shortcuts app.',
					});
				}),
				items: apps.map((app) => this.appRow(app)),
				...(apps.length < MAX_APPS
					? {
							addItem: {
								name: 'Add app',
								action: (el: HTMLElement) => {
									this.showAddMenu(el);
								},
							},
						}
					: {}),
				onDelete: (index) => {
					void this.commit(removeAppAt(this.plugin.settings, index));
				},
				onReorder: (from, to) => {
					void this.commit(moveApp(this.plugin.settings, from, to));
				},
			},
			{
				name: 'Debug logging',
				desc: 'Write a verbose log to the plugin folder and enable the Verify last handoff command. When off, errors go to the console only.',
				control: {
					type: 'toggle',
					key: 'debugLogging',
					defaultValue: DEFAULT_SETTINGS.debugLogging,
				},
			},
		];
	}

	/**
	 * One app in the list: its name, its shortcut, and a way into the editor.
	 * A row without a shortcut says so, since that app cannot be opened yet.
	 *
	 * The row is not a page of the tab. A page is identified by its name, and
	 * renaming an app from inside its own page left that page blank.
	 */
	private appRow(app: ShortcutApp): SettingDefinition {
		return {
			name: appName(app),
			render: (setting) => {
				const shortcut = appShortcut(app);
				setting.setName(appName(app));
				setting.setDesc(
					shortcut.length > 0
						? `Shortcut: ${shortcut}`
						: 'No shortcut yet, so this app cannot be opened.',
				);
				if (shortcut.length === 0) {
					setting.settingEl.addClass('etch-app-incomplete');
				}
				setting.addButton((button) =>
					button.setButtonText('Edit').onClick(() => {
						this.editApp(app.id);
					}),
				);
			},
		};
	}

	/** The presets are only names to start from; "Other app" starts empty. */
	private showAddMenu(anchor: HTMLElement): void {
		const menu = new Menu();
		for (const preset of APP_PRESETS) {
			menu.addItem((item) =>
				item.setTitle(preset.name).onClick(() => {
					void this.commit(addApp(this.plugin.settings, preset));
				}),
			);
		}
		menu.addItem((item) =>
			item.setTitle('Other app').onClick(() => {
				void this.addAndEdit();
			}),
		);
		const rect = anchor.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom }, anchor.doc);
	}

	/** An app that starts empty goes straight to the editor to be filled in. */
	private async addAndEdit(): Promise<void> {
		const before = this.plugin.settings;
		const next = addApp(before, { name: '', shortcut: '' });
		if (next === before) return;
		await this.commit(next);
		const added = next.apps[next.apps.length - 1];
		if (added) this.editApp(added.id);
	}

	private editApp(id: string): void {
		const entry = this.plugin.settings.apps.find((app) => app.id === id);
		if (!entry) return;
		new AppEditor(this.app, entry, {
			onSave: (name, shortcut) => {
				const renamed = updateApp(this.plugin.settings, id, 'name', name);
				void this.commit(updateApp(renamed, id, 'shortcut', shortcut));
			},
			onRemove: () => {
				// Looked up again by id: the list can have changed while the
				// editor was open.
				const current = this.plugin.settings;
				const index = current.apps.findIndex((app) => app.id === id);
				if (index !== -1) void this.commit(removeAppAt(current, index));
			},
		}).open();
	}

	/**
	 * A change to the list: store it, then rebuild the definitions, since
	 * the rows and the default-app options are both made from it.
	 */
	private async commit(next: EtchSettings): Promise<void> {
		if (next === this.plugin.settings) return;
		this.plugin.settings = next;
		await this.plugin.saveSettings();
		this.update();
	}

	getControlValue(key: string): unknown {
		const { settings } = this.plugin;
		if (key === 'target') {
			// Show what a handoff would actually use, so a default whose app
			// is gone reads as the Files viewer instead of as nothing.
			return resolveTarget(settings.target, settings.apps).target.id;
		}
		if (key === 'debugLogging') return settings.debugLogging;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const { settings } = this.plugin;
		if (key === 'target') {
			if (findTarget(value, settings.apps) === null) return;
			this.plugin.settings = { ...settings, target: value as string };
		} else if (key === 'debugLogging') {
			const enabled = value === true;
			this.plugin.settings = { ...settings, debugLogging: enabled };
			this.plugin.log.setEnabled(enabled);
		} else {
			// An unknown key means nothing changed; do not write data.json.
			return;
		}
		await this.plugin.saveSettings();
	}
}
