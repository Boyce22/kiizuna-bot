import { RARITIES, type Rarity, RARITY_EMOJI } from '@config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { TYPE_EMOJI, type CharacterType } from '../character-types';
import type { TranslateFn } from '../interfaces';

export const EDITCHAR_RARITY_ID = 'editchar:rarity';
export const EDITCHAR_TYPE_ID = 'editchar:type';
export const EDITCHAR_NSFW_ID = 'editchar:nsfw';
export const EDITCHAR_TEXTS_ID = 'editchar:texts';
export const EDITCHAR_SAVE_ID = 'editchar:save';
export const EDITCHAR_MODAL_ID = 'editchar:modal';

const TYPE_META: Record<CharacterType, { emoji: string }> = {
  waifu: { emoji: TYPE_EMOJI.waifu },
  husbando: { emoji: TYPE_EMOJI.husbando },
  unknown: { emoji: TYPE_EMOJI.unknown },
};

// Rascunho da edi├º├úo, iniciado com os valores atuais do personagem.
export interface EditCharDraft {
  rarity: Rarity;
  type: CharacterType;
  nsfw: boolean;
  name: string;
  series: string | null;
}

/** Linha de pr├®via com o estado atual do rascunho (mostra tamb├®m nome/s├®rie, que v├¬m do modal). */
export function editCharPreview(draft: EditCharDraft, id: number, t: TranslateFn): string {
  return t('editchar.preview', {
    id,
    name: draft.name,
    series: draft.series ?? 'ÔÇö',
    rarity: `${RARITY_EMOJI[draft.rarity]} ${t(`common.rarity.${draft.rarity}`)}`,
    type: t(`common.type.${draft.type}`),
    nsfw: draft.nsfw ? '­ƒö× NSFW' : '­ƒƒó SFW',
  });
}

export function buildEditCharComponents(
  draft: EditCharDraft,
  t: TranslateFn,
  done = false,
): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  const rarity = new StringSelectMenuBuilder()
    .setCustomId(EDITCHAR_RARITY_ID)
    .setPlaceholder(t('addchar.select_rarity'))
    .setDisabled(done)
    .addOptions(
      RARITIES.map((r) => ({
        label: t(`common.rarity.${r}`),
        value: r,
        emoji: RARITY_EMOJI[r],
        default: draft.rarity === r,
      })),
    );

  const type = new StringSelectMenuBuilder()
    .setCustomId(EDITCHAR_TYPE_ID)
    .setPlaceholder(t('addchar.select_type'))
    .setDisabled(done)
    .addOptions(
      (Object.keys(TYPE_META) as CharacterType[]).map((ty) => ({
        label: t(`common.type.${ty}`),
        value: ty,
        emoji: TYPE_META[ty].emoji,
        default: draft.type === ty,
      })),
    );

  const nsfw = new StringSelectMenuBuilder()
    .setCustomId(EDITCHAR_NSFW_ID)
    .setPlaceholder(t('addchar.select_nsfw'))
    .setDisabled(done)
    .addOptions(
      { label: t('addchar.opt_sfw'), value: '0', emoji: '­ƒƒó', default: !draft.nsfw },
      { label: t('addchar.opt_nsfw'), value: '1', emoji: '­ƒö×', default: draft.nsfw },
    );

  const texts = new ButtonBuilder()
    .setCustomId(EDITCHAR_TEXTS_ID)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('editchar.button_texts'))
    .setDisabled(done);
  const save = new ButtonBuilder()
    .setCustomId(EDITCHAR_SAVE_ID)
    .setStyle(ButtonStyle.Success)
    .setLabel(t('editchar.button_save'))
    .setDisabled(done);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rarity),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(type),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(nsfw),
    new ActionRowBuilder<ButtonBuilder>().addComponents(texts, save),
  ];
}

// Modal de nome/s├®rie pr├®-preenchido com os valores atuais.
export function buildEditCharModal(draft: EditCharDraft, t: TranslateFn): ModalBuilder {
  const field = (
    id: string,
    label: string,
    value: string,
    required: boolean,
  ): ActionRowBuilder<TextInputBuilder> =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setValue(value)
        .setRequired(required)
        .setMaxLength(100),
    );

  return new ModalBuilder()
    .setCustomId(EDITCHAR_MODAL_ID)
    .setTitle(t('editchar.modal_title'))
    .addComponents(
      field('name', t('addchar.f_name'), draft.name, true),
      field('series', t('addchar.f_series'), draft.series ?? '', false),
    );
}
