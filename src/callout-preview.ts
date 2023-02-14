import { getIcon } from 'obsidian';

import { CalloutID, CalloutProperties } from '../api';

export type CalloutPreview = {
	calloutEl: HTMLElement;
	properties: CalloutProperties;
};

interface CalloutPreviewOptions {
	title?: string;
	contents?: string | ((container: HTMLDivElement) => void);

	overrideColor?: string;
	overrideIcon?: string;
}

/**
 * Creates a callout preview using the current page's styles.
 *
 * The container element must be attached to the window's DOM for this to work properly.
 *
 * @param targetEl The container element. This will be replaced.
 * @param id The ID of the callout.
 * @param options The preview options.
 *
 * @returns The callout preview.
 */
export function createCalloutPreview(
	targetEl: HTMLElement,
	id: CalloutID,
	options?: CalloutPreviewOptions,
): CalloutPreview {
	const title = options?.title ?? `Preview: ${id}`;

	// Clear the target element and set its CSS classes.
	const calloutEl = targetEl;
	calloutEl.empty();
	calloutEl.classList.value = 'callout callout-manager-preview';

	// Configure the callout.
	calloutEl.classList.add('callout');
	calloutEl.setAttribute('data-callout', id);

	if (options?.overrideColor != null) {
		calloutEl.style.setProperty('--color-color', options.overrideColor);
	}

	if (options?.overrideIcon != null) {
		calloutEl.style.setProperty('--color-color', options.overrideIcon);
	}

	// Fetch the custom properties from the callout.
	const calloutElStyle = window.getComputedStyle(calloutEl);
	const icon = calloutElStyle.getPropertyValue('--callout-icon').trim();
	const color = calloutElStyle.getPropertyValue('--callout-color').trim();

	// Get the icon SVG contents.
	const iconSvg = getIcon(options?.overrideIcon ?? icon) ?? getIcon('lucide-pencil');

	// Build the callout title.
	const titleEl = calloutEl.createDiv({ cls: 'callout-title' });
	const titleIconEl = titleEl.createDiv({ cls: 'callout-icon' });
	titleEl.createDiv({ cls: 'callout-title-inner', text: title });
	if (iconSvg != null) {
		titleIconEl.appendChild(iconSvg);
	}

	// Build the callout contents.
	if (options?.contents != null) {
		const contentEl = calloutEl.createDiv({ cls: 'callout-content' });
		if (typeof options.contents === 'function') {
			options.contents(contentEl);
		} else {
			contentEl.createEl('p', { text: options?.contents ?? 'Lorem ipsum...' });
		}
	}

	// Return the callout element and its properties.
	return {
		calloutEl,
		properties: {
			id,
			color,
			icon,
		},
	};
}

/**
 * Creates an isolated callout preview.
 * This uses the Shadow DOM to create a full DOM for the callout, and allows for custom styles to be used.
 * The target element must be attached to the window's DOM for this to work properly.
 *
 * @param targetEl The target element. This will be replaced.
 * @param id The ID of the callout.
 * @param options The preview options.
 *
 * @returns The callout preview.
 */
export function createIsolatedCalloutPreview(
	targetEl: HTMLElement,
	id: CalloutID,
	options?: CalloutPreviewOptions & {
		styleElements?: HTMLElement[];
		focused?: boolean;
		viewType?: 'source' | 'reading';

		theme?: 'dark' | 'light';
	},
): CalloutPreview {
	if (!window.document.contains(targetEl)) {
		throw new Error('Callout previews can only be created on a container that is attached to DOM.');
	}

	const dom = targetEl.attachShadow({ delegatesFocus: false, mode: 'closed' });
	const focused = options?.focused ?? false;
	const theme = options?.theme ?? window.document.body.hasClass('theme-dark') ? 'dark' : 'light';
	const readingView = (options?.viewType ?? 'reading') === 'reading';

	// Copy the stylesheets into the Shadow DOM.
	//   If options.styleElements is provided, use those.
	//   Otherwise, use everything we can find in the <head> element.
	const styleElements =
		options?.styleElements ??
		(() => {
			const els = [];
			let node = window.document.head.firstElementChild;
			for (; node?.nextElementSibling != null; node = node.nextElementSibling) {
				const nodeTag = node.tagName;
				if (
					nodeTag === 'STYLE' ||
					(nodeTag === 'LINK' && node.getAttribute('rel')?.toLowerCase() === 'stylesheet')
				) {
					els.push(node);
				}
			}
			return els;
		})();

	for (const style of styleElements) {
		dom.appendChild(style.cloneNode(true));
	}

	// Add styles to reset all properties on everything above the callout.
	//
	// This is so we can keep the selectors consistent between real Obsidian and our fake one, without
	// having those elements affect the display of the callout itself.
	dom.createEl('style', { text: SHADOW_DOM_RESET_STYLES });

	// Create a fake DOM tree to host the callout.
	const viewContentEl = dom
		.createEl('body', { cls: `theme-${theme} obsidian-app` })
		.createDiv({ cls: 'app-container' })
		.createDiv({ cls: 'horizontal-main-container' })
		.createDiv({ cls: 'workspace' })
		.createDiv({ cls: 'workspace-split mod-root' })
		.createDiv({ cls: `workspace-tabs ${focused ? 'mod-active' : ''}` })
		.createDiv({ cls: 'workspace-tab-container' })
		.createDiv({ cls: `workspace-leaf ${focused ? 'mod-active' : ''}` })
		.createDiv({ cls: 'workspace-leaf-content' })
		.createDiv({ cls: 'view-content' });

	const calloutParentEl = readingView
		? createReadingViewCalloutElementTree(viewContentEl)
		: createLiveViewCalloutElementTree(viewContentEl);

	// Create the callout inside the fake DOM.
	return createCalloutPreview(calloutParentEl.createDiv(), id, options);
}

function createReadingViewCalloutElementTree(viewContentEl: HTMLDivElement): HTMLDivElement {
	// div.markdown-reading-view div.markdown-preview-vie.markdown-rendered .markdown-preview-section
	// div div.callout[data-callout]
	return viewContentEl
		.createDiv({ cls: 'markdown-reading-view' })
		.createDiv({ cls: 'markdown-preview-view markdown-rendered' })
		.createDiv({ cls: 'markdown-preview-section' })
		.createDiv();
}

function createLiveViewCalloutElementTree(viewContentEl: HTMLDivElement): HTMLDivElement {
	// div.markdown-source-view.cm-s-obsidian.mod-cm6.is-live-preview div.cm-editor.ͼ1.ͼ2.ͼq div.cm-scroller
	// div.cm-sizer div.cm-contentContainer div.cm-content div.cm-embed-block.markdown-rendered.cm-callout
	return viewContentEl
		.createDiv({ cls: 'markdown-source-view cm-s-obsidian mod-cm6 is-live-preview' })
		.createDiv({ cls: 'cm-editor ͼ1 ͼ2 ͼq' })
		.createDiv({ cls: 'cm-scroller' })
		.createDiv({ cls: 'cm-sizer' })
		.createDiv({ cls: 'cm-contentContainer' })
		.createDiv({ cls: 'cm-content' })
		.createDiv({ cls: 'cm-embed-block markdown-rendered cm-callout' });
}

const SHADOW_DOM_RESET_STYLES = `
/* Reset layout and stylings for all properties up to the callout. */
.app-container,
.horizontal-main-container,
.workspace,
.workspace-split,
.workspace-tabs,
.workspace-tab-container,
.workspace-leaf,
.workspace-leaf-content,
.view-content,
.markdown-reading-view,
.markdown-source-view,
.cm-editor.ͼ1.ͼ2.ͼq,
.cm-editor.ͼ1.ͼ2.ͼq > .cm-scroller,
.cm-sizer,
.cm-contentContainer,
.cm-content,
.markdown-preview-view {
	all: initial !important;
	display: block !important;
}

/* Set the text color of the container for the callout. */
.markdown-preview-section,
.cm-callout {
	color: var(--text-normal) !important;
}

/* Override margin on callout to keep the preview as small as possible. */
.markdown-preview-section > div > .callout,
.cm-callout > .callout,
.callout {
	margin: 0 !important;
}

/* Set the font properties of the callout. */
.cm-callout,
.callout {
	font-size: var(--font-text-size) !important;
	font-family: var(--font-text) !important;
	line-height: var(--line-height-normal) !important;
}

/* Use transparent background color. */
body {
	background-color: transparent !important;
}
`;
