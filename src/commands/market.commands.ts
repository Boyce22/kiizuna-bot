import { type Rarity, ui } from '@config';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} from 'discord.js';

import type { InternalClient } from '../client';
import { refusalMessage } from '../i18n/refusal';
import type { CommandContext, CommandExecutor } from '../interfaces';

import { type CardData, MarketCardRenderer } from './market-card.renderer';

const CARDS_PER_PAGE = 9;
const ATTACHMENT_NAME = 'market_page.png';
const PREV_ID = 'mkt_prev';
const NEXT_ID = 'mkt_next';
const BUY_ID = 'mkt_buy';
const BUY_SELECT_ID = 'mkt_buy_select';
const FILTERABLE: Rarity[] = ['R', 'SR', 'SSR', 'UR'];
const RARITY_FLAGS = new Set(['raridade', 'rarity', 'rareza']);

function readRarityFilter(args: string[], flags: Record<string, string | boolean>): { rarity?: Rarity; invalid?: boolean } {
  let raw: string | undefined;
  for (const [key, value] of Object.entries(flags)) {
    if (RARITY_FLAGS.has(key.toLowerCase()) && typeof value === 'string') {
      raw = value.toUpperCase();
      break;
    }
  }
  if (!raw && args[0]) raw = args[0].toUpperCase();
  if (!raw) return {};
  if (FILTERABLE.includes(raw as Rarity)) return { rarity: raw as Rarity };
  return { invalid: true };
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(1)}k`;
  return String(price);
}

interface StockRow {
  id: number;
  price: number;
  characterName: string;
  rarity: Rarity;
  imageUrl: string | null;
  series: string | null;
}

export class MarketCommands {
  private readonly renderer = new MarketCardRenderer();

  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [{ name: 'market', execute: this.handleMarket }];
  }

  private handleMarket = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, flags, user, t } = ctx;
    const guildId = invocation.guildId!;
    const { rarity, invalid } = readRarityFilter(args, flags);
    if (invalid) {
      await invocation.reply(t('error.missing_args', { usage: t('market.filter_usage') }));
      return;
    }
    const first = await this.api.post<{ total: number; rows: StockRow[] }>('/internal/v1/market/stock/page', {
      guildId,
      page: 0,
      pageSize: CARDS_PER_PAGE,
      rarity,
    });
    if (first.total === 0) {
      await invocation.reply(t('market.list.empty'));
      return;
    }
    const totalPages = Math.max(1, Math.ceil(first.total / CARDS_PER_PAGE));
    let page = 0;
    const pngCache = new Map<number, Buffer>();

    const buildRows = (): ActionRowBuilder<ButtonBuilder>[] => {
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      if (totalPages > 1) {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(PREV_ID).setStyle(ButtonStyle.Secondary).setEmoji('◀️').setDisabled(page === 0),
            new ButtonBuilder().setCustomId(NEXT_ID).setStyle(ButtonStyle.Secondary).setEmoji('▶️').setDisabled(page >= totalPages - 1),
          ),
        );
      }
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(BUY_ID).setStyle(ButtonStyle.Primary).setLabel(t('market.buy_button')),
        ),
      );
      return rows;
    };

    const renderWithImage = async (p: number) => {
      let buffer = pngCache.get(p);
      if (!buffer) {
        const { rows } = await this.api.post<{ rows: StockRow[] }>('/internal/v1/market/stock/page', {
          guildId,
          page: p,
          pageSize: CARDS_PER_PAGE,
          rarity,
        });
        const cards: CardData[] = rows.map((r) => ({
          imageUrl: r.imageUrl,
          name: r.characterName,
          series: r.series,
          rarity: r.rarity,
          price: r.price,
          listingId: r.id,
        }));
        buffer = await this.renderer.renderPage(cards);
        pngCache.set(p, buffer);
      }
      const file = new AttachmentBuilder(buffer, { name: ATTACHMENT_NAME });
      const embed = new EmbedBuilder()
        .setImage(`attachment://${ATTACHMENT_NAME}`)
        .setFooter({ text: t('collection.page', { current: p + 1, total: totalPages }) });
      return { file, embed };
    };

    const firstRender = await renderWithImage(0);
    const reply = await invocation.reply({
      embeds: [firstRender.embed],
      files: [firstRender.file],
      components: buildRows(),
    });
    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: ui.pagination.defaultTimeoutMs });
    collector.on('collect', async (interaction) => {
      try {
        if (interaction.user.id !== invocation.author.id) {
          await interaction.reply({ content: t('pagination.not_yours'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === PREV_ID || interaction.customId === NEXT_ID) {
          await interaction.deferUpdate();
          page = interaction.customId === NEXT_ID ? Math.min(page + 1, totalPages - 1) : Math.max(page - 1, 0);
          const next = await renderWithImage(page);
          await interaction.editReply({ embeds: [next.embed], files: [next.file], components: buildRows() });
          return;
        }
        if (interaction.customId !== BUY_ID) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { rows } = await this.api.post<{ rows: StockRow[] }>('/internal/v1/market/stock/page', {
          guildId,
          page: 0,
          pageSize: 25,
          rarity,
        });
        if (rows.length === 0) {
          await interaction.editReply({ content: t('market.list.empty') });
          return;
        }
        const options = rows.map((r) => ({
          label: `${r.characterName} · ${t(`common.rarity.${r.rarity}`)} · 💰 ${formatPrice(r.price)}`,
          description: `#${r.id}${r.series ? ` · ${r.series}` : ''}`,
          value: String(r.id),
        }));
        const select = new StringSelectMenuBuilder()
          .setCustomId(BUY_SELECT_ID)
          .setPlaceholder(t('market.buy_select_placeholder'))
          .addOptions(options.slice(0, 25));
        const menuMessage = await interaction.editReply({
          content: '\u200B',
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
        });
        let selectInteraction;
        try {
          selectInteraction = await menuMessage.awaitMessageComponent({
            filter: (i) => i.customId === BUY_SELECT_ID && i.user.id === invocation.author.id,
            componentType: ComponentType.StringSelect,
            time: 60_000,
          });
        } catch {
          await interaction.editReply({ content: t('market.buy_timeout'), components: [] }).catch(() => undefined);
          return;
        }
        await selectInteraction.deferUpdate();
        const result = await this.api.call<{ price: number }>(
          '/internal/v1/market/stock/buy',
          { discordId: user.discordId, username: user.username ?? undefined, guildId, stockId: Number(selectInteraction.values[0]) },
        );
        if (!result.ok) {
          await selectInteraction.editReply({ content: refusalMessage(t, 'market', result.code), components: [] });
          return;
        }
        pngCache.clear();
        await selectInteraction.editReply({ content: t('market.bought', { price: result.price }), components: [] });
        try {
          const refreshed = await renderWithImage(page);
          await reply.edit({ embeds: [refreshed.embed], files: [refreshed.file], components: buildRows() });
        } catch {
          /* cosmetic */
        }
      } catch {
        /* swallow interaction errors */
      }
    });
    collector.on('end', () => {
      void reply.edit({ components: [] }).catch(() => undefined);
    });
  };
}
