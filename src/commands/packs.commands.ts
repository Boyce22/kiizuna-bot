import { checkNsfwPermission, discordRelative } from '@utils';
import type { ButtonComponent, ButtonInteraction, Message } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ComponentType } from 'discord.js';

import { reviveBindResult } from '../bind-result';
import type { ApiFailure, InternalClient } from '../client';
import { awaitSelection } from '../discord/selection';
import { refusalMessage } from '../i18n/refusal';
import type { CommandContext, CommandExecutor, GuildConfigView, TranslateFn } from '../interfaces';

import { publishBindOutcome } from './bind-outcome';
import {
  type OpeningView,
  type PacksState,
  type PackView,
  renderPicked,
  renderShowcase,
  renderTable,
} from './packs.presenter';

type Refusal = ApiFailure<{ resetAt: string | null; max: number }>;

interface PickOk {
  pack: PackView;
  amount: number;
}

/** A escolha sempre vira uma cópia nova na coleção (a posse não é única). */
interface ChooseOk {
  opening: OpeningView;
  wishlistPings: Array<{ discordIds: string[]; name: string; series?: string; kind: 'character' | 'anime' }>;
}

/** Quem age num botão de pack: a pessoa, o servidor e a configuração dele. */
export interface PackActor {
  discordId: string;
  username: string;
  guildId: string;
  guildConfig: Pick<GuildConfigView, 'rollIntervalMinutes'>;
}

/** Códigos que o roubo devolve como vínculo (o resto é recusa do pack). */
const BIND_CODES = new Set(['COOLDOWN', 'EXPIRED']);

/** Recusa da API em texto: tempo de volta e teto quando a recusa traz. */
function refusal(t: TranslateFn, result: Refusal): string {
  const time = result.resetAt ? discordRelative(new Date(result.resetAt)) : '—';
  return refusalMessage(t, 'packs', result.code, { time, max: result.max ?? 0 });
}

/** A mensagem sem o botão `customId` (a sobra roubada sai da mesa). */
function withoutButton(message: Message, customId: string) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const component of message.components) {
    if (component.type !== ComponentType.ActionRow) continue;
    const buttons = component.components
      .filter((child): child is ButtonComponent => child.type === ComponentType.Button)
      .filter((button) => button.customId !== customId)
      .map((button) => ButtonBuilder.from(button));
    if (buttons.length) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }
  return { components: rows };
}

/**
 * Packs no Discord: vitrine (`packs`), abrir guardado (`open`) e os botões da vitrine e da mesa.
 * Só I/O do Discord; vitrine, cargas, sorteio e posse ficam na API.
 */
export class PacksCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'packs', execute: this.handleShowcase },
      { name: 'open', execute: this.handleOpen },
    ];
  }

  private handleShowcase = async (ctx: CommandContext): Promise<void> => {
    const { invocation, user, guildConfig, t } = ctx;
    const result = await this.api.call<PacksState, Refusal>('/internal/v1/packs/showcase', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      rollIntervalMinutes: guildConfig.rollIntervalMinutes,
    });
    if (!result.ok) {
      await invocation.reply(refusal(t, result));
      return;
    }
    await invocation.reply(renderShowcase(result, user.discordId, t));
  };

  /** `open [pack]`: abre um pack guardado; sem nome e com mais de um tipo, pergunta qual. */
  private handleOpen = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, guildConfig, t } = ctx;
    const state = await this.api.call<PacksState, Refusal>('/internal/v1/packs/showcase', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      rollIntervalMinutes: guildConfig.rollIntervalMinutes,
    });
    if (!state.ok) {
      await invocation.reply(refusal(t, state));
      return;
    }
    if (state.pending) {
      await invocation.reply(renderTable(state.pending, state.pending.packName, user.discordId, t));
      return;
    }

    const packId = await this.choosePack(ctx, state, args.join(' ').trim().toLowerCase());
    if (!packId) return;
    const opened = await this.api.call<OpeningView, Refusal>('/internal/v1/packs/open', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      packId,
      channelId: invocation.channelId,
      // Personagem NSFW só sai em canal NSFW (e para conta liberada, que a API confere).
      channelNsfw: checkNsfwPermission(invocation.channel, true).allowed,
    });
    if (!opened.ok) {
      await invocation.reply(refusal(t, opened));
      return;
    }
    await invocation.reply(renderTable(opened, opened.packName, user.discordId, t));
  };

  /** O pack guardado a abrir: pelo nome/id digitado, o único que há, ou escolhido num menu. */
  private async choosePack(ctx: CommandContext, state: PacksState, query: string): Promise<string | undefined> {
    const { invocation, t } = ctx;
    if (!state.held.length) {
      await invocation.reply(t('packs.NO_PACKS'));
      return undefined;
    }
    if (query) {
      const match = state.held.find(({ pack }) => pack.id === query || pack.name.toLowerCase() === query);
      if (!match) await invocation.reply(t('packs.NO_PACKS'));
      return match?.pack.id;
    }
    if (state.held.length === 1) return state.held[0].pack.id;

    const outcome = await awaitSelection({
      invocation,
      content: t('packs.open_pick_prompt'),
      placeholder: t('packs.open_pick_placeholder'),
      options: state.held.map(({ pack, amount }) => ({ label: `${pack.name} ×${amount}`, value: pack.id })),
      authorizedUserId: invocation.author.id,
      timeoutMs: 60_000,
      idPrefix: 'packs_open_pick',
    });
    if (outcome.status === 'timeout') {
      await outcome.prompt.edit({ content: t('packs.open_pick_timeout'), components: [] }).catch(() => undefined);
      return undefined;
    }
    await outcome.interaction.update({ content: t('packs.opening'), components: [] });
    return outcome.value;
  }

  /**
   * Botões de pack (`pk:<ação>:...`), com a resposta efêmera já adiada por `events.ts`. Os botões
   * da vitrine e a escolha da carta são do dono (o último segmento do customId); roubar é de todos.
   */
  async handleComponent(interaction: ButtonInteraction, actor: PackActor, t: TranslateFn): Promise<void> {
    const [, action, ...parts] = interaction.customId.split(':');
    const ownerOnly = action !== 'steal';
    const ownerId = parts[parts.length - 1];
    if (ownerOnly && ownerId !== actor.discordId) {
      await interaction.editReply({ content: t('pagination.not_yours') });
      return;
    }

    if (action === 'pick') return this.pick(interaction, actor, parts[0], t);
    if (action === 'refresh') return this.refresh(interaction, actor, t);
    if (action === 'open') return this.open(interaction, actor, parts[0], t);
    if (action === 'resume') return this.resume(interaction, actor, t);
    if (action === 'take') return this.take(interaction, actor, parts[0], Number(parts[1]), t);
    if (action === 'steal') return this.steal(interaction, actor, parts[0], Number(parts[1]), t);
  }

  private player(actor: PackActor) {
    return { discordId: actor.discordId, username: actor.username, guildId: actor.guildId };
  }

  private async pick(interaction: ButtonInteraction, actor: PackActor, packId: string, t: TranslateFn) {
    const result = await this.api.call<PickOk, Refusal>('/internal/v1/packs/pick', {
      ...this.player(actor),
      packId,
      rollIntervalMinutes: actor.guildConfig.rollIntervalMinutes,
    });
    if (!result.ok) {
      await interaction.editReply({ content: refusal(t, result) });
      return;
    }
    await interaction.editReply(renderPicked(result.pack, result.amount, actor.discordId, t));
  }

  private async refresh(interaction: ButtonInteraction, actor: PackActor, t: TranslateFn) {
    const result = await this.api.call<PacksState, Refusal>('/internal/v1/packs/refresh', {
      ...this.player(actor),
      rollIntervalMinutes: actor.guildConfig.rollIntervalMinutes,
    });
    if (!result.ok) {
      await interaction.editReply({ content: refusal(t, result) });
      return;
    }
    await interaction.editReply(renderShowcase(result, actor.discordId, t));
  }

  /** Abre no canal (mesa pública) e confirma no efêmero. */
  private async open(interaction: ButtonInteraction, actor: PackActor, packId: string, t: TranslateFn) {
    const result = await this.api.call<OpeningView, Refusal>('/internal/v1/packs/open', {
      ...this.player(actor),
      packId,
      channelId: interaction.channelId,
      channelNsfw: checkNsfwPermission(interaction.channel, true).allowed,
    });
    if (!result.ok) {
      await interaction.editReply({ content: refusal(t, result) });
      return;
    }
    await this.postTable(interaction, result, actor, t);
  }

  private async resume(interaction: ButtonInteraction, actor: PackActor, t: TranslateFn) {
    const result = await this.api.call<PacksState, Refusal>('/internal/v1/packs/showcase', {
      ...this.player(actor),
      rollIntervalMinutes: actor.guildConfig.rollIntervalMinutes,
    });
    if (!result.ok) {
      await interaction.editReply({ content: refusal(t, result) });
      return;
    }
    if (!result.pending) {
      await interaction.editReply({ content: t('packs.no_pending') });
      return;
    }
    await this.postTable(interaction, result.pending, actor, t);
  }

  private async postTable(interaction: ButtonInteraction, opening: OpeningView, actor: PackActor, t: TranslateFn) {
    if (!interaction.channel?.isSendable()) return;
    await interaction.channel.send(renderTable(opening, opening.packName, actor.discordId, t));
    await interaction.editReply({ content: t('packs.opening') });
  }

  /** O dono fica com a carta: a mesa vira sobras roubáveis e quem as deseja é avisado. */
  private async take(
    interaction: ButtonInteraction,
    actor: PackActor,
    openingId: string,
    characterId: number,
    t: TranslateFn,
  ) {
    const result = await this.api.call<ChooseOk, Refusal>('/internal/v1/packs/choose', {
      ...this.player(actor),
      openingId,
      characterId,
    });
    if (!result.ok) {
      await interaction.editReply({ content: refusal(t, result) });
      return;
    }

    const { opening } = result;
    await interaction.message.edit(renderTable(opening, opening.packName, actor.discordId, t));
    const card = opening.cards.find((entry) => entry.id === characterId);
    const name = card?.name ?? '';
    await interaction.editReply({ content: t('packs.took', { name }) });

    if (!interaction.channel?.isSendable()) return;
    for (const ping of result.wishlistPings) {
      const key = ping.kind === 'anime' ? 'packs.anime_wishlist_ping' : 'packs.wishlist_ping';
      const users = ping.discordIds.map((discordId) => `<@${discordId}>`).join(' ');
      await interaction.channel.send({
        content: t(key, { users, name: ping.name, series: ping.series ?? '' }),
        allowedMentions: { users: ping.discordIds },
      });
    }
  }

  /** Rouba uma sobra: vínculo de summon alheio (cooldown de roubo, cargo de Ladrão). */
  private async steal(
    interaction: ButtonInteraction,
    actor: PackActor,
    openingId: string,
    characterId: number,
    t: TranslateFn,
  ) {
    const raw = await this.api.call<Record<string, unknown>, Record<string, unknown>>('/internal/v1/packs/steal', {
      ...this.player(actor),
      openingId,
      characterId,
      channelId: interaction.channelId,
    });
    if (!raw.ok && !BIND_CODES.has(raw.code)) {
      await interaction.editReply({ content: refusalMessage(t, 'packs', raw.code) });
      return;
    }

    const result = reviveBindResult(raw);
    await publishBindOutcome(result, interaction, this.api, t);
    if (result.ok) {
      await interaction.message.edit(withoutButton(interaction.message, interaction.customId)).catch(() => undefined);
    }
  }
}
