import { App, FuzzySuggestModal } from 'obsidian';
import { Target, targetTitle } from './targets';

/**
 * The list of apps for the tap points that have no button to hang a menu on:
 * the command palette and the file menu. The split button uses a menu
 * instead, opened where it was tapped.
 */
export class TargetPicker extends FuzzySuggestModal<Target> {
	constructor(
		app: App,
		private readonly targets: Target[],
		private readonly onPick: (target: Target) => void,
	) {
		super(app);
		this.setPlaceholder('Open with…');
	}

	getItems(): Target[] {
		return this.targets;
	}

	getItemText(target: Target): string {
		return targetTitle(target);
	}

	onChooseItem(target: Target): void {
		this.onPick(target);
	}
}
