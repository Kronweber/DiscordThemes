/*
 * NewChatbox — Vencord userplugin by Kronweber
 * The NewChatbox theme as a plugin: chatbox layout built from Discord's live class names,
 * plus a one-click strip of favourite / frequently used stickers in the toolbar row.
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Layout variables can be overridden in QuickCSS, e.g. :root { --nc-toolbar-height: 40px; }
 * (--nc-text-height, --nc-text-min-with-previews, --nc-gutter, --nc-separator,
 *  --nc-forward-max-height, --nc-counter-spacing).
 */

import definePlugin, { IconComponent } from "@utils/types";

import { startLayout, stopLayout } from "./layout";
import { settings } from "./settings";
import { StickerStrip } from "./StickerStrip";
import managedStyle from "./style.css?managed";

const StickerIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" width={width} height={height} className={className}>
        <path
            fill="currentColor"
            fillRule="evenodd"
            d="M5 3h10l6 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm9 1.5V9a1 1 0 0 0 1 1h4.5L14 4.5Z"
        />
    </svg>
);

export default definePlugin({
    name: "NewChatbox",
    description: "Chatbox layout with a toolbar row, and a one-click strip of your favourite and most used stickers",
    authors: [{ name: "Kronweber", id: 675020556655001611n }],
    settings,
    managedStyle,

    chatBarButton: {
        icon: StickerIcon,
        render: StickerStrip
    },

    start() {
        startLayout(() => settings.store.layout);
    },

    stop() {
        stopLayout();
    }
});
