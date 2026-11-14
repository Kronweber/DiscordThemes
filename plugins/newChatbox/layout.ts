/*
 * NewChatbox — Vencord userplugin by Kronweber
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Builds the chatbox layout CSS at runtime from Discord's *current* class names.
 *
 * Discord's CSS-module classes look like `inner_2x8-Qn`: a readable name plus a hash that changes between
 * Discord builds, and the module keys are mangled. So each module is located by the readable names of a few
 * of its classes ("find"), and every class the CSS needs ("use") is then read from that module.
 * Modules that aren't loaded yet (e.g. the profile bio editor) fall back to prefix selectors such as
 * [class^="bioTextArea_"], and the CSS is rebuilt as soon as they load.
 */

import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import { Logger } from "@utils/Logger";
import { cache, filters, makeClassNameRegex, waitFor, waitForSubscriptions } from "@webpack";
import { PopoutWindowStore } from "@webpack/common";

const logger = new Logger("NewChatbox");

const MODULES = {
    chat: { find: ["chat", "chatContent", "form", "channelTextArea"], use: ["channelTextArea"] },
    textArea: {
        find: ["scrollableContainer", "inner", "textArea", "buttons"],
        use: ["channelTextArea", "scrollableContainer", "inner", "innerVoiceRecording", "textArea", "buttons", "hiddenAppLauncherAnchor", "charCountShowing"]
    },
    attach: { find: ["attachWrapper", "uploadInput"], use: ["attachWrapper", "uploadInput", "attachButton"] },
    forward: { find: ["messageInput", "threadSubLabel"], use: ["messageInput"] },
    bio: { find: ["bioTextArea", "bioTextAreaContainer"], use: ["bioTextArea", "bioTextAreaContainer"] },
    editor: { find: ["editor", "placeholder"], use: ["placeholder"] },
    attachmentArea: { find: ["channelAttachmentArea"], use: ["channelAttachmentArea"] },
    stickerPreviews: { find: ["stickerPreviews", "stickerPreview"], use: ["stickerPreviews"] },
    charCount: { find: ["characterCount", "upsell"], use: ["characterCount"] },
    buttonWrapper: { find: ["buttonWrapper", "notificationDot"], use: ["buttonWrapper"] }
} as const;

type ModuleName = keyof typeof MODULES;
export type Selectors = { [K in ModuleName]: Record<(typeof MODULES)[K]["use"][number], string>; };

const fallback = (name: string) => `:is([class^="${name}_"], [class*=" ${name}_"])`;

function classValues(exports: unknown): string[] {
    if (exports == null || typeof exports !== "object" || Array.isArray(exports)) return [];
    try {
        return Object.values(exports).filter((v): v is string => typeof v === "string");
    } catch {
        return []; // uninitialised export (circular import)
    }
}

/** Modules handed to us by waitFor() after they loaded lazily */
const lateModules: Partial<Record<ModuleName, string[]>> = {};

/** One pass over the webpack cache; for each module group keep the smallest matching module (most specific). */
function scanModules() {
    const groups = Object.entries(MODULES).map(([key, { find }]) => ({ key: key as ModuleName, tests: find.map(makeClassNameRegex) }));
    const found: Partial<Record<ModuleName, string[]>> = { ...lateModules };

    for (const id in cache) {
        const values = classValues(cache[id]?.exports);
        if (!values.length) continue;

        for (const { key, tests } of groups) {
            if ((found[key]?.length ?? Infinity) <= values.length) continue;
            if (tests.every(re => values.some(v => re.test(v)))) found[key] = values;
        }
    }

    return found;
}

function resolveSelectors() {
    const found = scanModules();
    const missing: ModuleName[] = [];
    const selectors = {} as Record<ModuleName, Record<string, string>>;

    for (const [key, { use }] of Object.entries(MODULES) as [ModuleName, (typeof MODULES)[ModuleName]][]) {
        const values = found[key];
        if (!values) missing.push(key);

        selectors[key] = {};
        for (const name of use) {
            const re = makeClassNameRegex(name);
            const token = values?.map(v => v.match(re)?.[0]).find(Boolean);
            selectors[key][name] = token ? "." + CSS.escape(token) : fallback(name);
        }
    }

    return { selectors: selectors as Selectors, missing };
}

export function layoutCss(s: Selectors) {
    const box = `:is(${s.chat.channelTextArea} > ${s.textArea.scrollableContainer}, ${s.forward.messageInput}, ${s.bio.bioTextArea})`;
    const inner = `${box} > ${s.textArea.inner}:not(${s.textArea.innerVoiceRecording})`;
    const toolbarCounterHost = `:is(${s.bio.bioTextAreaContainer}, ${s.textArea.channelTextArea}:has(> ${s.forward.messageInput}))`;
    const counterHost = `:is(${s.chat.channelTextArea}, ${toolbarCounterHost})`;
    const counter = `:is(.vc-charCounter-counter, ${s.charCount.characterCount})`;

    return `
:root {
    --nc-toolbar-height: 44px;
    --nc-text-height: 44px;
    --nc-text-min-with-previews: 110px;
    --nc-gutter: 12px;
    --nc-separator: var(--border-subtle);
    --nc-forward-max-height: 30vh;
    --nc-counter-offset: 4px;
}

/* Layout */
${box} {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}
:is(${s.chat.channelTextArea} > ${s.textArea.scrollableContainer}, ${s.bio.bioTextArea}) {
    --custom-channel-textarea-text-area-height: var(--nc-text-height);
}
${box} > * {
    flex: 0 1 auto;
    min-height: 0;
}
${inner} {
    flex: 1 100000 auto;
    min-height: calc(var(--custom-channel-textarea-text-area-height, 44px) + var(--nc-toolbar-height));
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr) var(--nc-toolbar-height);
    grid-template-areas:
        "text   text text"
        "attach .    buttons";
    align-items: center;
    padding-inline-start: 0;
}
${inner}::before {
    content: "";
    grid-row: 2;
    grid-column: 1 / -1;
    align-self: stretch;
    border-top: 1px solid var(--nc-separator);
    pointer-events: none;
}

/* Minimum height */
@supports (flex-basis: content) {
    ${inner} {
        flex-basis: content;
        height: calc(var(--custom-channel-textarea-text-area-height, 44px) + var(--nc-toolbar-height));
        min-height: auto;
    }
    :is(${s.chat.channelTextArea} > ${s.textArea.scrollableContainer}):has(> ${s.attachmentArea.channelAttachmentArea}, > ${s.stickerPreviews.stickerPreviews}) > ${s.textArea.inner}:not(${s.textArea.innerVoiceRecording}) {
        height: calc(var(--nc-text-min-with-previews) + var(--nc-toolbar-height));
    }
}

/* Text */
${box} > ${s.textArea.inner} > ${s.textArea.textArea} {
    grid-area: text;
    align-self: stretch;
    height: auto !important;
    min-height: var(--custom-channel-textarea-text-area-height, 44px);
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding-inline: var(--nc-gutter) 0;
}
${box} > ${s.textArea.inner} > ${s.textArea.textArea} ${s.editor.placeholder} {
    inset-inline-start: var(--nc-gutter);
}
${box} > ${s.textArea.inner} > ${s.textArea.textArea}::-webkit-scrollbar {
    height: 12px;
    width: 12px;
}
${box} > ${s.textArea.inner} > ${s.textArea.textArea}::-webkit-scrollbar-thumb {
    background-color: hsl(var(--primary-800-hsl) / .6);
    border-radius: 8px;
}
${box} > ${s.textArea.inner} > ${s.textArea.textArea}::-webkit-scrollbar-thumb,
${box} > ${s.textArea.inner} > ${s.textArea.textArea}::-webkit-scrollbar-track {
    background-clip: padding-box;
    border: 4px solid transparent;
}

/* Toolbar */
${box} > ${s.textArea.inner} > :is(${s.attach.uploadInput}, ${s.attach.attachWrapper}) {
    grid-area: attach;
}
${box} > ${s.textArea.inner} > ${s.attach.attachWrapper} {
    position: static;
    align-self: center;
    display: flex;
    padding: 0 calc(var(--nc-gutter) - 6px);
}
${box} > ${s.textArea.inner} > ${s.attach.attachWrapper} > ${s.attach.attachButton} {
    position: static;
    margin-inline: 0;
}
${box} > ${s.textArea.inner} > ${s.textArea.buttons} {
    grid-area: buttons;
    position: static;
    height: auto;
    margin-inline-end: 0;
    padding-inline-end: calc(var(--nc-gutter) - 6px);
}
${box} > ${s.textArea.inner} > ${s.textArea.hiddenAppLauncherAnchor} {
    grid-area: buttons;
    justify-self: end;
}

/* Sticker strip */
${box} > ${s.textArea.inner} > ${s.textArea.buttons}:has(> .vc-nc-strip) {
    grid-column: 2 / -1;
    min-width: 0;
}

/* Character counter */
${counterHost} > ${counter} {
    flex-direction: row;
    align-items: center;
    gap: 4px;
    line-height: 16px;
    white-space: nowrap;
}
${s.chat.channelTextArea} > ${counter} {
    top: auto;
    bottom: calc(100% + var(--nc-counter-offset));
    inset-inline: auto var(--nc-gutter);
}
${toolbarCounterHost} > ${counter} {
    bottom: calc(var(--nc-toolbar-height) / 2);
    inset-inline: var(--nc-gutter) auto;
    transform: translateY(50%);
}
${toolbarCounterHost}:has(${s.attach.attachWrapper}) > ${counter} {
    inset-inline-start: calc(var(--nc-gutter) * 2 + 32px);
}
${counterHost}${s.textArea.charCountShowing} {
    --custom-channel-textarea-editor-min-height: initial;
}

/* Forward box */
${s.textArea.scrollableContainer}${s.forward.messageInput} {
    max-height: var(--nc-forward-max-height);
    padding-inline-start: 0;
}

${s.buttonWrapper.buttonWrapper} {
    overflow: hidden;
}
`;
}

let styleEl: HTMLStyleElement | null = null;
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
const pendingFilters = new Set<ReturnType<typeof filters.byClassNames>>();

function clearPending() {
    pendingFilters.forEach(f => waitForSubscriptions.delete(f));
    pendingFilters.clear();
}

function apply(enabled: boolean) {
    clearPending();

    const { selectors, missing } = resolveSelectors();

    styleEl ??= createAndAppendStyle("vc-newchatbox-layout", managedStyleRootNode);
    styleEl.textContent = enabled ? layoutCss(selectors) : "";
    syncPopouts();

    if (missing.length) logger.info("Not loaded yet, using prefix selectors for:", missing.join(", "));

    // Rebuild as soon as a missing module is loaded
    for (const key of missing) {
        const filter = filters.byClassNames(...MODULES[key].find);
        pendingFilters.add(filter);
        waitFor(filter, module => {
            pendingFilters.delete(filter);
            lateModules[key] = classValues(module);
            clearTimeout(rebuildTimer);
            rebuildTimer = setTimeout(() => apply(isEnabled()), 50);
        });
    }
}

// Vencord copies its style root into popout windows when they open; keep those copies current
function syncPopouts() {
    if (!PopoutWindowStore) return;
    for (const key of PopoutWindowStore.getWindowKeys()) {
        const copy = PopoutWindowStore.getWindow(key)?.document?.getElementById("vc-newchatbox-layout");
        if (copy) copy.textContent = styleEl?.textContent ?? "";
    }
}

let isEnabled = () => true;

export function startLayout(enabled: () => boolean) {
    isEnabled = enabled;
    apply(enabled());
}

export function refreshLayout() {
    if (styleEl) apply(isEnabled());
}

export function stopLayout() {
    clearTimeout(rebuildTimer);
    clearPending();
    if (styleEl) styleEl.textContent = "";
    syncPopouts();
    styleEl?.remove();
    styleEl = null;
}
