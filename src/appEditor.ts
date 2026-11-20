import { App, Modal, Setting } from 'obsidian';
import { ShortcutApp } from './targets';

/**
 * The editor for one app: its name, the name of its shortcut, and the steps
 * for making that shortcut.
 *
 * It is a dialog rather than a page of the settings tab on purpose. The
 * settings tab identifies a page by its name, so renaming an app while its
 * own page is open leaves that page blank (seen in Obsidian 1.15.1). A dialog
 * holds its fields itself and reports once, when it is saved.
 */

export interface AppEditorHandlers {
	onSave: (name: string, shortcut: string) => void;
	onRemove: () => void;
}

export class AppEditor extends Modal {
	private name: string;
	private shortcut: string;

	constructor(
		app: App,
		entry: ShortcutApp,
		private readonly handlers: AppEditorHandlers,
	) {
		super(app);
		this.name = entry.name;
		this.shortcut = entry.shortcut;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('etch-app-editor');
		this.setTitle('App opened by a shortcut');

		new Setting(contentEl)
			.setName('App name')
			.setDesc('Shown on the button and in the list of apps.')
			.addText((text) =>
				text
					.setPlaceholder('Xodo')
					.setValue(this.name)
					.onChange((value) => {
						this.name = value;
					}),
			);

		new Setting(contentEl)
			.setName('Shortcut name')
			.setDesc(
				createFragment((fragment) => {
					fragment.createDiv({
						text: 'The name of the shortcut that opens a file in this app. It has to match the name in the Shortcuts app exactly.',
					});
				}),
			)
			.addText((text) =>
				text
					.setPlaceholder('Open in Xodo')
					.setValue(this.shortcut)
					.onChange((value) => {
						this.shortcut = value;
					}),
			);

		const steps = contentEl.createDiv({ cls: 'etch-app-steps' });
		steps.createDiv({
			text: 'Make the shortcut once, in the Shortcuts app on this iPad:',
		});
		const list = steps.createEl('ol');
		list.createEl('li', {
			text: 'Create a shortcut and give it the name entered above.',
		});
		list.createEl('li', {
			text: 'Add the action "Get File from Folder". Set its folder to this vault (On My iPad, Obsidian, then the vault) and its file path to Shortcut Input.',
		});
		list.createEl('li', {
			text: 'Add the action "Open File" and set its app to the editor.',
		});
		steps.createDiv({
			text: 'Etch runs the shortcut and passes it the path of the file inside the vault.',
		});

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText('Remove app')
					.setDestructive()
					.onClick(() => {
						this.close();
						this.handlers.onRemove();
					}),
			)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => {
					this.close();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText('Save')
					.setCta()
					.onClick(() => {
						this.close();
						this.handlers.onSave(this.name, this.shortcut);
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
