import { ui } from '@config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import type { CommandInvocation } from '../command-invocation';
import type { TranslateFn } from '../interfaces';

const PREV_ID = 'page_prev';
const NEXT_ID = 'page_next';
const JUMP_ID = 'page_jump';
const JUMP_MODAL_ID = 'pagination:jump_modal';
const JUMP_FIELD_ID = 'pagination:jump_field';

function buildJumpModal(t: TranslateFn, totalPages: number): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(JUMP_FIELD_ID)
    .setLabel(t('pagination.jump_modal_label', { max: totalPages }))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(t('pagination.jump_modal_placeholder'))
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(String(totalPages).length);
  return new ModalBuilder()
    .setCustomId(JUMP_MODAL_ID)
    .setTitle(t('pagination.jump_modal_title'))
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export interface PaginateOptions {
  /** Invocação que disparou o comando (define autor e canal de resposta). */
  invocation: CommandInvocation;
  /** Total de itens (para o cálculo de páginas). */
  total: number;
  /** Itens por página. */
  pageSize: number;
  /**
   * Constrói o embed de uma página. Recebe o índice (0-based) e o total de páginas;
   * o chamador é responsável por buscar os dados da página (ex.: slice no banco).
   */
  renderPage: (page: number, totalPages: number) => EmbedBuilder | Promise<EmbedBuilder>;
  t: TranslateFn;
  /** Tempo até desabilitar a navegação (default `ui.pagination.defaultTimeoutMs`). */
  timeoutMs?: number;
}

/**
 * Resposta paginada por botões (◀ ▶) com coletor de interação e timeout.
 * Só o autor do comando navega; ao expirar, os botões são removidos.
 * Reutilizável por collection, gallery, globaltop, auction list, wishlist list.
 */
export async function paginate(opts: PaginateOptions): Promise<void> {
  const { invocation, total, pageSize, renderPage, t } = opts;
  const timeoutMs = opts.timeoutMs ?? ui.pagination.defaultTimeoutMs;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  let page = 0;
  const buildRow = (): ActionRowBuilder<ButtonBuilder> => {
    const buttons = [
      new ButtonBuilder()
        .setCustomId(PREV_ID)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(NEXT_ID)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('▶️')
        .setDisabled(page >= totalPages - 1),
    ];
    // Com 1-2 páginas, ◀️/▶️ já alcançam qualquer página em no máximo um clique — botão de
    // salto seria só ruído. A partir de 3 páginas, vira útil (ex.: coleções com 100+ cartas).
    if (totalPages > 2) {
      buttons.push(new ButtonBuilder().setCustomId(JUMP_ID).setStyle(ButtonStyle.Secondary).setEmoji('🔢'));
    }
    return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
  };

  const embed = await renderPage(page, totalPages);
  const reply = await invocation.reply({
    embeds: [embed],
    components: totalPages > 1 ? [buildRow()] : [],
  });
  if (totalPages <= 1) return;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeoutMs,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== invocation.author.id) {
      await interaction.reply({ content: t('pagination.not_yours'), flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.customId === JUMP_ID) {
      await interaction.showModal(buildJumpModal(t, totalPages));
      let submit;
      try {
        submit = await interaction.awaitModalSubmit({
          filter: (m) =>
            m.customId === JUMP_MODAL_ID &&
            m.user.id === invocation.author.id &&
            m.isFromMessage() &&
            m.message.id === reply.id,
          time: timeoutMs,
        });
      } catch {
        return; // modal expirou ou foi fechado sem envio — mantém a página atual
      }

      const raw = submit.fields.getTextInputValue(JUMP_FIELD_ID).trim();
      const requested = Number(raw);
      const valid = /^\d+$/.test(raw) && requested >= 1 && requested <= totalPages;
      if (!valid) {
        await submit.reply({ content: t('pagination.invalid_page', { max: totalPages }), flags: MessageFlags.Ephemeral });
        return;
      }

      page = requested - 1;
      const jumped = await renderPage(page, totalPages);
      if (submit.isFromMessage()) {
        await submit.update({ embeds: [jumped], components: [buildRow()] });
      }
      return;
    }

    page =
      interaction.customId === NEXT_ID ? Math.min(page + 1, totalPages - 1) : Math.max(page - 1, 0);
    const next = await renderPage(page, totalPages);
    await interaction.update({ embeds: [next], components: [buildRow()] });
  });

  collector.on('end', () => {
    void reply.edit({ components: [] }).catch(() => undefined);
  });
}
