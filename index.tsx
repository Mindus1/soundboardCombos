/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { isNonNullish } from "@utils/guards";
import { proxyLazy } from "@utils/lazy";
import { sleep } from "@utils/misc";
import definePlugin from "@utils/types";
import { Channel, SoundboardSound } from "@vencord/discord-types";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { ChannelStore, ContextMenuApi, IconUtils, Menu, Popout, SelectedChannelStore, SoundboardStore, TextInput, useEffect, useRef, zustandCreate } from "@webpack/common";

import { Combo, getCombos, settings, updateCombo, useCombos } from "./settings";

const cl = classNameFactory("vc-soundboard-combos-");
const COMBOS = "combos";
const NO_OVERLAY = 0;

interface ComboItem {
    type: typeof COMBOS;
    combo: Combo;
}

interface CellProps {
    descriptor: { item: ComboItem; };
    soundButtonProps: object;
    columnIndex: number;
    getItemProps(columnIndex: number): object;
    onSelectItem(descriptor: { item: ComboItem; }): void;
    onItemMouseEnter(columnIndex: number): void;
}

interface SoundButtonProps {
    sound: SoundboardSound;
    channel?: Channel;
    forceSecondaryActions: boolean;
    showLockForDisabledSound?: boolean;
    buttonOverlay?: number;
    isPlayingSoundOverride?: boolean;
    tooltipOverride: string;
    onMouseEnter?(): void;
    onSelectItem(): void;
}

interface EmojiPickerProps {
    channel?: Channel;
    closePopout(): void;
    onSelectEmoji(selection: { emoji: { id?: string | null; name?: string | null; optionallyDiverseSequence?: string; } | null; willClose: boolean; }): void;
}

interface ComboState {
    playing: string | null;
    editing: string | null;
}

interface ComboStore {
    <T>(selector: (state: ComboState) => T): T;
    getState(): ComboState;
    setState(state: Partial<ComboState>): void;
}

const SoundButton = findComponentByCodeLazy<SoundButtonProps>(/showLockForDisabledSound:\i=!0/);
const EmojiPicker = findComponentByCodeLazy<EmojiPickerProps>("showAddEmojiButton:", "pickerIntention:", "messageId:");
const playSoundboardSound: (sound: SoundboardSound, channelId: string) => void = findByCodeLazy(".SEND_SOUNDBOARD_SOUND(", "SOUNDBOARD_TRACK_USAGE");
const useComboState: ComboStore = proxyLazy(() => zustandCreate(() => ({ playing: null, editing: null })));

let run = 0;

function getDuration(soundId: string) {
    return new Promise<number>(resolve => {
        const audio = new Audio(`https://${window.GLOBAL_ENV.CDN_HOST}/soundboard-sounds/${soundId}`);
        audio.onloadedmetadata = () => resolve(audio.duration * 1000);
        audio.onerror = () => resolve(0);
    });
}

async function playCombo(combo: Combo) {
    const me = ++run;
    const channelId = SelectedChannelStore.getVoiceChannelId();
    if (useComboState.getState().playing === combo.id || !channelId) return useComboState.setState({ playing: null });

    useComboState.setState({ playing: combo.id });
    const { gap } = settings.store;
    const sounds = combo.sounds.map(id => SoundboardStore.getSoundById(id)).filter(isNonNullish);
    const durations = sounds.map(sound => getDuration(sound.soundId));

    for (let i = 0; i < sounds.length && me === run && SelectedChannelStore.getVoiceChannelId() === channelId; i++) {
        const start = Date.now();
        playSoundboardSound(sounds[i], channelId);
        await sleep(start + await durations[i] + gap - Date.now());
    }

    if (me === run) useComboState.setState({ playing: null });
}

function toggleEditingSound(sound: SoundboardSound) {
    const combo = getCombos().find(c => c.id === useComboState.getState().editing);
    if (!combo) return false;

    updateCombo(combo.id, {
        sounds: combo.sounds.includes(sound.soundId)
            ? combo.sounds.filter(id => id !== sound.soundId)
            : [...combo.sounds, sound.soundId]
    });
    return true;
}

function addComboCategory(categories: unknown[], channel?: Channel) {
    const combos = getCombos();
    if (combos.length && channel?.id === SelectedChannelStore.getVoiceChannelId())
        categories.unshift({ key: COMBOS, categoryInfo: { type: COMBOS }, items: combos.map(combo => ({ type: COMBOS, combo })) });
}

function ComboIcon({ className, size = 24 }: { className?: string; size?: number; }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5h14v2H3zm0 5h14v2H3zm0 5h8v2H3zm11-1v8l7-4z" />
        </svg>
    );
}

const EditBar = ErrorBoundary.wrap(({ combo }: { combo: Combo; }) => {
    const triggerRef = useRef<HTMLDivElement>(null);
    const sounds = combo.sounds.map(id => SoundboardStore.getSoundById(id)).filter(isNonNullish);
    const icon = combo.emojiName ? combo : sounds[0];
    const channelId = SelectedChannelStore.getVoiceChannelId();
    const channel = channelId ? ChannelStore.getChannel(channelId) : undefined;

    return (
        <Flex flexDirection="column" gap="8px" className={cl("edit-bar")}>
            <Flex alignItems="center" gap="8px">
                <Popout
                    position="bottom"
                    align="left"
                    targetElementRef={triggerRef}
                    renderPopout={({ closePopout }) => (
                        <EmojiPicker
                            channel={channel}
                            closePopout={closePopout}
                            onSelectEmoji={({ emoji, willClose }) => {
                                if (emoji) updateCombo(combo.id, emoji.id
                                    ? { emojiId: emoji.id, emojiName: emoji.name }
                                    : { emojiId: null, emojiName: emoji.optionallyDiverseSequence ?? emoji.name });
                                if (willClose) closePopout();
                            }}
                        />
                    )}
                >
                    {popoutProps => (
                        <div ref={triggerRef}>
                            <Button {...popoutProps} variant="secondary" size="iconOnly" aria-label="Change combo icon">
                                {icon?.emojiId
                                    ? <img className={cl("emoji")} src={IconUtils.getEmojiURL({ id: icon.emojiId, animated: false, size: 32 })} alt="" />
                                    : icon?.emojiName
                                        ? <span className={cl("emoji")}>{icon.emojiName}</span>
                                        : <ComboIcon size={20} />}
                            </Button>
                        </div>
                    )}
                </Popout>
                <TextInput
                    value={combo.name}
                    placeholder="Combo name"
                    onChange={(name: string) => updateCombo(combo.id, { name })}
                />
            </Flex>
            {sounds.length ? (
                <ul className={cl("sounds")}>
                    {sounds.map(sound => (
                        <SoundButton
                            key={sound.soundId}
                            sound={sound}
                            channel={channel}
                            forceSecondaryActions={false}
                            showLockForDisabledSound={false}
                            buttonOverlay={NO_OVERLAY}
                            tooltipOverride="Remove from combo"
                            onSelectItem={() => toggleEditingSound(sound)}
                        />
                    ))}
                </ul>
            ) : <Paragraph>No sounds yet.</Paragraph>}
            <Flex alignItems="center" justifyContent="space-between">
                <Paragraph>Click sounds to add them. Click them here to remove them.</Paragraph>
                <Button size="small" onClick={() => useComboState.setState({ editing: null })}>Done</Button>
            </Flex>
        </Flex>
    );
}, { noop: true });

function useEditBar() {
    const editing = useComboState(state => state.editing);
    const combo = useCombos().find(c => c.id === editing);
    useEffect(() => () => useComboState.setState({ editing: null }), []);

    return combo ? <EditBar combo={combo} /> : null;
}

function ComboMenu({ combo }: { combo: Combo; }) {
    return (
        <Menu.Menu navId="vc-soundboard-combos" onClose={ContextMenuApi.closeContextMenu} aria-label="Combo Actions">
            <Menu.MenuItem
                id="vc-soundboard-combos-edit"
                label="Edit combo"
                action={() => useComboState.setState({ editing: combo.id })}
            />
            <Menu.MenuItem
                id="vc-soundboard-combos-delete"
                label="Delete combo"
                color="danger"
                action={() => settings.store.combos = getCombos().filter(c => c.id !== combo.id)}
            />
        </Menu.Menu>
    );
}

const ComboButton = ErrorBoundary.wrap(({ descriptor, soundButtonProps, columnIndex, getItemProps, onSelectItem, onItemMouseEnter }: CellProps) => {
    const { combo } = descriptor.item;
    const playing = useComboState(state => state.playing === combo.id);
    const sounds = combo.sounds.map(id => SoundboardStore.getSoundById(id)).filter(isNonNullish);
    const icon = combo.emojiName ? combo : sounds[0];

    return (
        <div className={cl("cell")} onContextMenu={e => ContextMenuApi.openContextMenu(e, () => <ComboMenu combo={combo} />)}>
            <SoundButton
                {...getItemProps(columnIndex)}
                {...soundButtonProps}
                forceSecondaryActions={false}
                sound={{
                    soundId: `combo-${combo.id}`,
                    name: combo.name,
                    emojiId: icon?.emojiId ?? null,
                    emojiName: icon?.emojiName ?? null,
                    guildId: "0",
                    available: true,
                    volume: 1
                }}
                isPlayingSoundOverride={playing}
                tooltipOverride={sounds.map(sound => sound.name).join(" → ")}
                onMouseEnter={() => onItemMouseEnter(columnIndex)}
                onSelectItem={() => onSelectItem(descriptor)}
            />
        </div>
    );
}, { noop: true });

const SoundContext: NavContextMenuPatchCallback = (children, { sound }: { sound: SoundboardSound; }) => {
    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-soundboard-combos-new"
                label="New combo"
                action={() => {
                    const id = crypto.randomUUID();
                    settings.store.combos = [...getCombos(), { id, name: sound.name, sounds: [sound.soundId] }];
                    useComboState.setState({ editing: id });
                }}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "SoundboardCombos",
    description: "Chain soundboard sounds into combos that play back to back from one button.",
    authors: [{ name: "Mindus", id: 261776328003420161n }],
    settings,
    contextMenus: {
        "sound-button-context": SoundContext
    },

    patches: [
        {
            find: '"soundboard-picker-categories"',
            group: true,
            replacement: [
                {
                    match: /(?=(\i)\.forEach\(\i=>\{\i\.categoryInfo\.type===\i\.\i\.GUILD&&\(\i\.categoryInfo\.isNitroLocked)/,
                    replace: "$self.addComboCategory($1,arguments[0]),"
                },
                {
                    match: /(?<=lockedCustomSoundCount:\i\}\}\)\},\[)/,
                    replace: "$self.useCombos(),"
                },
                {
                    match: /(?<=return\(0,(\i)\.jsx\)\((\i),\{icon:\i\.TrophyIcon,([^}]{0,80})\},(\i)\.key\);)(?=default:return null)/,
                    replace: "case $self.COMBOS:return(0,$1.jsx)($2,{icon:$self.ComboIcon,$3},$4.key);"
                },
                {
                    match: /(?=\}\}\(\i\),position:"right")/,
                    replace: ';case $self.COMBOS:return"Combos"'
                },
                {
                    match: /(?<=\.TrophyIcon,\{size:"xs",color:"currentColor",className:(\i\.\i)\}\))(?=\}\}\(\))/,
                    replace: ";case $self.COMBOS:return $self.ComboIcon({size:16,className:$1})"
                },
                {
                    match: /(?<=\{guildName:\i\.guild\.name\}\))(?=\}\}\(\)\}\))/,
                    replace: ';case $self.COMBOS:return"Combos"'
                },
                {
                    match: /(?<=`add-sound-\$\{)(\i)\.item\.guild\.id(?=\}`)/,
                    replace: "$1.item.guild?.id??$1.item.combo.id"
                },
                {
                    match: /(?<=switch\(\i\.item\.type\)\{)(?=case \i\.\i\.SOUND:return\(0,\i\.createElement\)\()/,
                    replace: "case $self.COMBOS:return $self.renderCombo(arguments[0]);"
                },
                {
                    match: /(?<=\.ADD_SOUND:return \i\(\),\i\((\i)\.item\.guild\.id\))(?=\})/,
                    replace: ";case $self.COMBOS:return $self.playCombo($1.item.combo)"
                },
                {
                    match: /(?<=\((\i),\i,\i,\i\)=>\{)(?=if\(null!=\i&&!\i\)return \i\(\i,\i\);)/,
                    replace: "if($self.toggleEditingSound($1))return;"
                },
                {
                    match: /(?<=gridNotice:)(\i)(?=,renderHeader:\i,renderUpsell:\i\}\))/,
                    replace: "$self.useEditBar()??$1"
                }
            ]
        }
    ],

    COMBOS,
    ComboIcon,
    playCombo,
    addComboCategory,
    useCombos,
    toggleEditingSound,
    useEditBar,
    renderCombo: (props: CellProps) => <ComboButton {...props} />
});
