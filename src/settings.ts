import {
	App,
	Platform,
	PluginSettingTab,
	SettingDefinitionItem,
} from 'obsidian';
import type EtchPlugin from './main';
import {
	PAGE_LINK_LABELS,
	PageLinkStyle,
	ROUTE_LABELS,
	RouteId,
	isPageLinkStyle,
	isRouteId,
} from './routes';

export interface EtchSettings {
	route: RouteId;
	debugLogging: boolean;
	/** The page experiment. Read through `effectivePageLink`, never directly. */
	pageLink: PageLinkStyle;
}

export const DEFAULT_SETTINGS: EtchSettings = {
	route: 'shareddocuments',
	debugLogging: false,
	pageLink: 'off',
};

/**
 * The page experiment rides on the debug toggle. Its control is only shown
 * while debug logging is on, so a value left behind by a test session must
 * not keep changing handoffs once the control that set it is out of sight:
 * with debug logging off, a handoff builds the same URL it always has.
 */
export function effectivePageLink(
	settings: Pick<EtchSettings, 'debugLogging' | 'pageLink'>,
): PageLinkStyle {
	return settings.debugLogging ? settings.pageLink : 'off';
}

export class EtchSettingTab extends PluginSettingTab {
	plugin: EtchPlugin;

	constructor(app: App, plugin: EtchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
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
				name: 'Handoff route',
				desc: createFragment((fragment) => {
					fragment.createDiv({
						text: 'Files viewer (default): opens the file in the Files viewer. Tap Markup, then the check mark to save before returning.',
					});
					fragment.createDiv({
						text: 'Preview: opens the file directly in Preview, which is smoother on small files. Large PDFs still open in the Files viewer, because Preview can lose markup on them.',
					});
				}),
				control: {
					type: 'dropdown',
					key: 'route',
					defaultValue: DEFAULT_SETTINGS.route,
					options: ROUTE_LABELS,
				},
			},
			{
				name: 'Debug logging',
				desc: 'Write a verbose log to the plugin folder, and enable the Verify last handoff command, the detected page command, and the page experiment below. When off, errors go to the console only.',
				control: {
					type: 'toggle',
					key: 'debugLogging',
					defaultValue: DEFAULT_SETTINGS.debugLogging,
				},
			},
			{
				name: 'Page in link (experiment)',
				desc: 'Adds the page shown in the PDF view to the handoff link, to test whether the viewer opens on it. Unproven: the viewer may ignore it, or fail to open the file. Set it back to off if a handoff stops working.',
				visible: () => this.plugin.settings.debugLogging,
				control: {
					type: 'dropdown',
					key: 'pageLink',
					defaultValue: DEFAULT_SETTINGS.pageLink,
					options: PAGE_LINK_LABELS,
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof EtchSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'route') {
			if (!isRouteId(value)) return;
			this.plugin.settings.route = value;
		} else if (key === 'debugLogging') {
			const enabled = value === true;
			this.plugin.settings.debugLogging = enabled;
			this.plugin.log.setEnabled(enabled);
			// The page experiment's row is shown only while this is on, and
			// visibility is re-evaluated when the definitions are stored again.
			this.update();
		} else if (key === 'pageLink') {
			if (!isPageLinkStyle(value)) return;
			this.plugin.settings.pageLink = value;
		} else {
			// An unknown key means nothing changed; do not write data.json.
			return;
		}
		await this.plugin.saveSettings();
	}
}
