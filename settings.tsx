/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Paragraph } from "@components/Paragraph";
import { useAwaiter } from "@utils/react";
import { OptionType } from "@utils/types";
import { findByCodeLazy } from "@webpack";
import { GuildStore, SearchableSelect, SoundboardStore, TextInput } from "@webpack/common";

export interface Combo {
    id: string;
    name: string;
    sounds: string[];
    emojiId?: string | null;
    emojiName?: string | null;
}

const KEYS = ["combos" as const];

const fetchSounds: () => Promise<unknown> = findByCodeLazy('"SOUNDBOARD_FETCH_DEFAULT_SOUNDS"');

export const settings = definePluginSettings({
    combos: {
        type: OptionType.COMPONENT,
        component: ComboEditor,
        default: [] as Combo[]
    },
    gap: {
        type: OptionType.NUMBER,
        description: "Pause between sounds in milliseconds. A negative number starts the next sound a bit early.",
        default: 0
    }
});

export const getCombos = (): Combo[] => settings.plain.combos ?? [];

export function useCombos() {
    settings.use(KEYS);
    return getCombos();
}

export function updateCombo(id: string, changes: Partial<Combo>) {
    settings.store.combos = getCombos().map(combo => combo.id === id ? { ...combo, ...changes } : combo);
}

function ComboEditor() {
    const combos = useCombos();
    useAwaiter(fetchSounds);

    const options = [...SoundboardStore.getSounds().values()].flat().map(sound => ({
        label: `${sound.name} · ${GuildStore.getGuild(sound.guildId)?.name ?? "Discord"}`,
        value: sound.soundId
    }));

    return (
        <Flex flexDirection="column">
            <Paragraph>Right-click a sound in the soundboard to start a combo, or right-click a combo to edit or delete it. Sounds play in the order shown here.</Paragraph>
            {combos.map(combo => (
                <Card key={combo.id}>
                    <Flex flexDirection="column" gap="0.5em">
                        <TextInput
                            value={combo.name}
                            placeholder="Combo name"
                            onChange={(name: string) => updateCombo(combo.id, { name })}
                        />
                        <SearchableSelect
                            multi
                            closeOnSelect={false}
                            placeholder="Add sounds"
                            options={options}
                            value={combo.sounds}
                            onChange={(values: (string | { value: string; })[]) => updateCombo(combo.id, { sounds: values.map(v => typeof v === "string" ? v : v.value) })}
                        />
                        <Button variant="dangerPrimary" size="small" onClick={() => settings.store.combos = combos.filter(c => c.id !== combo.id)}>
                            Delete combo
                        </Button>
                    </Flex>
                </Card>
            ))}
            <Button onClick={() => settings.store.combos = [...combos, { id: crypto.randomUUID(), name: "New combo", sounds: [] }]}>
                New combo
            </Button>
        </Flex>
    );
}
