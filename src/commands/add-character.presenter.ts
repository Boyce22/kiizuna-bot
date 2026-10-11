import { RARITIES, type Rarity, RARITY_EMOJI } from '@config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { TYPE_EMOJI, type CharacterType } from '../character-types';
import type { TranslateFn } from '../interfaces';

import { type AddCharInput, rarityLabel } from './character-form';

export const ADDCHAR_OPEN_ID = 'addchar:open';
export const ADDCHAR_MODAL_ID = 'addchar:modal';
export const ADDCHAR_RARITY_ID = 'addchar:rarity';
export const ADDCHAR_TYPE_ID = 'addchar:type';
export const ADDCHAR_NSFW_ID = 'addchar:nsfw';

const TYPE_META: Record<CharacterType, { emoji: string }> = {
  waifu: { emoji: TYPE_EMOJI.waifu },
  husbando: { emoji: TYPE_EMOJI.husbando },
  unknown: { emoji: TYPE_EMOJI.unknown },
};

// Campos fixos escolhidos por dropdown; textos livres ficam no modal.
export interface AddCharDraft {
  rarity?: Rarity;
  type?: CharacterType;
  nsfw: boolean;
}

// Monta os menus + bot├úo refletindo a sele├º├úo atual (default marcado). `done` desabilita tudo.
export function buildAddCharComponents(
  draft: AddCharDraft,
  t: TranslateFn,
  done = false,
): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  const rarity = new StringSelectMenuBuilder()
    .setCustomId(ADDCHAR_RARITY_ID)
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
    .setCustomId(ADDCHAR_TYPE_ID)
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
    .setCustomId(ADDCHAR_NSFW_ID)
    .setPlaceholder(t('addchar.select_nsfw'))
    .setDisabled(done)
    .addOptions(
      { label: t('addchar.opt_sfw'), value: '0', emoji: '­ƒƒó', default: !draft.nsfw },
      { label: t('addchar.opt_nsfw'), value: '1', emoji: '­ƒö×', default: draft.nsfw },
    );

  const open = new ButtonBuilder()
    .setCustomId(ADDCHAR_OPEN_ID)
    .setStyle(ButtonStyle.Primary)
    .setLabel(t('addchar.button'))
    .setDisabled(done);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rarity),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(type),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(nsfw),
    new ActionRowBuilder<ButtonBuilder>().addComponents(open),
  ];
}

// Modal s├│ com os textos livres (4 campos, dentro do limite do Discord).
export function buildAddCharModal(t: TranslateFn): ModalBuilder {
  const field = (
    id: string,
    label: string,
    placeholder: string,
    required: boolean,
    max: number,
  ): ActionRowBuilder<TextInputBuilder> =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(placeholder)
        .setRequired(required)
        .setMaxLength(max),
    );

  return new ModalBuilder()
    .setCustomId(ADDCHAR_MODAL_ID)
    .setTitle(t('addchar.modal_title'))
    .addComponents(
      field('name', t('addchar.f_name'), 'Maki Zenin', true, 100),
      field('series', t('addchar.f_series'), 'Jujutsu Kaisen', false, 100),
      field('url', t('addchar.f_url'), 'https://...', true, 500),
      field('base', t('addchar.f_base'), '42', false, 12),
    );
}

/** Embed de confirmação depois que o personagem foi criado. */
export function buildAddCharCreatedEmbed(
  character: { id: number; name: string; rarity: Rarity; type: CharacterType },
  input: AddCharInput,
  nsfw: boolean,
  t: TranslateFn,
): EmbedBuilder {
  const variant = input.baseCharacterId
    ? t('addchar.variant_suffix', { base: input.baseCharacterId })
    : '';
  return new EmbedBuilder()
    .setTitle(
      t('addchar.created', {
        name: character.name,
        id: character.id,
        rarity: rarityLabel(character.rarity, t),
        type: t(`common.type.${character.type}`),
        variant,
      }),
    )
    .setDescription(
      [input.series ? `📺 ${input.series}` : null, nsfw ? '🔞 NSFW' : '🟢 SFW']
        .filter(Boolean)
        .join(' · '),
    )
    .setImage(input.imageUrl);
}
