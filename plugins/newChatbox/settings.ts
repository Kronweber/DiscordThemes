/*
 * NewChatbox — Vencord userplugin by Kronweber
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { refreshLayout } from "./layout";

export const settings = definePluginSettings({
    layout: {
        type: OptionType.BOOLEAN,
        description: "Chatbox layout: text on top, a toolbar row with attach and buttons below it",
        default: true,
        onChange: refreshLayout
    },
    stickerStrip: {
        type: OptionType.BOOLEAN,
        description: "Sticker strip in the toolbar row",
        default: true
    },
    source: {
        type: OptionType.SELECT,
        description: "Which stickers the strip shows",
        options: [
            { label: "Favourites, then frequently used", value: "both", default: true },
            { label: "Favourites only", value: "favourites" },
            { label: "Frequently used only", value: "frequent" }
        ]
    },
    maxStickers: {
        type: OptionType.SLIDER,
        description: "Maximum number of stickers in the strip",
        markers: [4, 8, 12, 16, 20, 24],
        default: 12,
        stickToMarkers: true
    },
    size: {
        type: OptionType.SLIDER,
        description: "Sticker size in pixels",
        markers: [24, 28, 32, 36, 40],
        default: 32,
        stickToMarkers: true
    },
    unsendable: {
        type: OptionType.SELECT,
        description: "Stickers you can't send in the current channel (no Nitro, missing permission, unavailable)",
        options: [
            { label: "Show greyed out", value: "dim", default: true },
            { label: "Hide", value: "hide" }
        ]
    },
    animate: {
        type: OptionType.SELECT,
        description: "Animated stickers",
        options: [
            { label: "Animate on hover", value: "hover", default: true },
            { label: "Always animate", value: "always" },
            { label: "Never animate", value: "never" }
        ]
    }
});
