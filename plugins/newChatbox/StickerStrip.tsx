/*
 * NewChatbox — Vencord userplugin by Kronweber
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButtonFactory } from "@api/ChatButtons";
import { sendMessage } from "@utils/discord";
import { classes } from "@utils/misc";
import { Channel, FluxStore, Sticker } from "@vencord/discord-types";
import { StickerFormatType } from "@vencord/discord-types/enums";
import { findStoreLazy } from "@webpack";
import {
    FluxDispatcher,
    MessageActions,
    PendingReplyStore,
    PermissionsBits,
    PermissionStore,
    StickersStore,
    Tooltip,
    UserSettingsProtoStore,
    UserStore,
    useLayoutEffect,
    useRef,
    useState,
    useStateFromStores
} from "@webpack/common";

import { getSelectors } from "./layout";
import { settings } from "./settings";

const StickersPersistedStore = findStoreLazy("StickersPersistedStore") as FluxStore & {
    stickerFrecencyWithoutFetchingLatest: { frequently: Sticker[]; };
};

const CDN = "https://media.discordapp.net/stickers";

function collectStickers(source: string): Sticker[] {
    const result: Sticker[] = [];
    const seen = new Set<string>();
    const push = (s?: Sticker) => {
        if (s && !seen.has(s.id)) {
            seen.add(s.id);
            result.push(s);
        }
    };

    if (source !== "frequent") {
        const favIds: string[] = UserSettingsProtoStore.frecencyWithoutFetchingLatest?.favoriteStickers?.stickerIds ?? [];
        // Favourites from servers you left don't resolve and are skipped
        favIds.forEach(id => push(StickersStore.getStickerById(id)));
    }

    if (source !== "favourites") {
        StickersPersistedStore.stickerFrecencyWithoutFetchingLatest?.frequently?.forEach(push);
    }

    return result;
}

// Same rules Discord applies (and FakeNitro mirrors)
function canSend(sticker: Sticker, channel: Channel): boolean {
    if (sticker.available === false) return false;
    if ("pack_id" in sticker) return true; // Discord's own sticker packs are free for everyone
    if (channel.guild_id && sticker.guild_id === channel.guild_id) return true;

    const hasNitro = (UserStore.getCurrentUser()?.premiumType ?? 0) > 1;
    if (!hasNitro) return false;

    return channel.isPrivate() || PermissionStore.can(PermissionsBits.USE_EXTERNAL_STICKERS, channel);
}

function sendSticker(sticker: Sticker, channelId: string) {
    const reply = PendingReplyStore.getPendingReply(channelId);
    const options = reply ? MessageActions.getSendMessageOptionsForReply(reply) : {};

    sendMessage(channelId, { content: "" }, true, { ...options, stickerIds: [sticker.id] });

    if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
}

function stickerUrl({ id, format_type }: Sticker, animated: boolean, size: number) {
    const px = size * 2; // crisp on HiDPI screens

    if (format_type === StickerFormatType.GIF)
        return animated
            ? `${CDN}/${id}.gif?size=${px}`
            : `${CDN}/${id}.png?size=${px}&passthrough=false`;

    if (format_type === StickerFormatType.APNG && !animated)
        return `${CDN}/${id}.png?size=${px}&passthrough=false`;

    return `${CDN}/${id}.png?size=${px}`;
}

/**
 * The character counter is absolutely positioned in the toolbar row, outside the grid, so it can't push the
 * strip aside by itself. Measure where it ends and pad the buttons cell past it (--nc-counter-gap).
 */
function useCounterGap(stripRef: React.RefObject<HTMLDivElement | null>) {
    useLayoutEffect(() => {
        const buttons = stripRef.current?.parentElement;
        const sel = getSelectors();
        const box = buttons?.closest<HTMLElement>(sel.textArea.channelTextArea);
        if (!buttons || !box) return;

        const counterSelector = `:scope > :is(.vc-charCounter-counter, ${sel.charCount.characterCount})`;
        let counter: Element | null = null;

        const update = () => {
            const next = box.querySelector(counterSelector);
            if (next !== counter) {
                if (counter) resize.unobserve(counter);
                if (next) resize.observe(next);
                counter = next;
            }

            const rect = counter?.getBoundingClientRect();
            const gap = rect?.width
                ? Math.max(0, rect.right - buttons.getBoundingClientRect().left)
                : 0;

            buttons.style.setProperty("--nc-counter-gap", gap ? `calc(${gap}px + var(--nc-counter-spacing, 8px))` : "0px");
        };

        const resize = new ResizeObserver(update);
        const mutations = new MutationObserver(update);
        resize.observe(buttons);
        mutations.observe(box, { childList: true });
        update();

        return () => {
            resize.disconnect();
            mutations.disconnect();
            buttons.style.removeProperty("--nc-counter-gap");
        };
    }, []);
}

function StickerButton({ sticker, enabled, animate, size, onSend }: {
    sticker: Sticker;
    enabled: boolean;
    animate: string;
    size: number;
    onSend(): void;
}) {
    const [hovered, setHovered] = useState(false);
    const [staticFailed, setStaticFailed] = useState(false);

    const animated = staticFailed || animate === "always" || (animate === "hover" && hovered);
    const label = enabled ? sticker.name : `${sticker.name} (can't be sent here)`;

    return (
        <Tooltip text={label}>
            {({ onMouseEnter, onMouseLeave }) => (
                <button
                    type="button"
                    className={classes("vc-nc-sticker", !enabled && "vc-nc-disabled")}
                    aria-label={label}
                    aria-disabled={!enabled}
                    onClick={() => enabled && onSend()}
                    onMouseEnter={() => { onMouseEnter(); setHovered(true); }}
                    onMouseLeave={() => { onMouseLeave(); setHovered(false); }}
                >
                    {sticker.format_type === StickerFormatType.LOTTIE
                        // Lottie stickers (Discord's default packs) have no image version
                        ? <span className="vc-nc-lottie">{sticker.name}</span>
                        : <img
                            src={stickerUrl(sticker, animated, size)}
                            alt={sticker.name}
                            draggable={false}
                            loading="lazy"
                            onError={() => !animated && setStaticFailed(true)}
                        />
                    }
                </button>
            )}
        </Tooltip>
    );
}

function Strip({ channel, stickers, maxStickers, size, unsendable, animate }: {
    channel: Channel;
    stickers: Sticker[];
    maxStickers: number;
    size: number;
    unsendable: string;
    animate: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useCounterGap(ref);

    const items = stickers
        .map(sticker => ({ sticker, enabled: canSend(sticker, channel) }))
        .filter(i => i.enabled || unsendable === "dim")
        .slice(0, maxStickers);

    return (
        <div
            ref={ref}
            className="vc-nc-strip"
            style={{ "--vc-nc-size": `${size}px` } as React.CSSProperties}
            onWheel={e => { if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY; }}
        >
            {items.map(({ sticker, enabled }) => (
                <StickerButton
                    key={sticker.id}
                    sticker={sticker}
                    enabled={enabled}
                    animate={animate}
                    size={size}
                    onSend={() => sendSticker(sticker, channel.id)}
                />
            ))}
        </div>
    );
}

export const StickerStrip: ChatBarButtonFactory = ({ channel, isAnyChat, type }) => {
    const { stickerStrip, source, maxStickers, size, unsendable, animate } =
        settings.use(["stickerStrip", "source", "maxStickers", "size", "unsendable", "animate"]);

    const stickers = useStateFromStores(
        [UserSettingsProtoStore, StickersPersistedStore, StickersStore],
        () => collectStickers(source),
        [source],
        (a, b) => a.length === b.length && a.every((s, i) => s.id === b[i].id)
    );

    if (!stickerStrip || !isAnyChat || !type.stickers?.allowSending || !stickers.length) return null;

    return <Strip channel={channel} stickers={stickers} maxStickers={maxStickers} size={size} unsendable={unsendable} animate={animate} />;
};
