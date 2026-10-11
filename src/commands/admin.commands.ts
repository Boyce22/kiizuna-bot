import { type Rarity } from '@config';
import { isBotOwner, isGuildManager, isGuildOwner } from '@utils';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  type TextChannel,
} from 'discord.js';

import type { CharacterType } from '../character-types';
import type { InternalClient } from '../client';
import { SUPPORTED_LOCALES } from '../i18n/i18n.service';
import type { CommandContext, CommandExecutor, Locale } from '../interfaces';

import {
  ADDCHAR_MODAL_ID,
  ADDCHAR_NSFW_ID,
  ADDCHAR_OPEN_ID,
  ADDCHAR_RARITY_ID,
  ADDCHAR_TYPE_ID,
  type AddCharDraft,
  buildAddCharComponents,
  buildAddCharCreatedEmbed,
  buildAddCharModal,
} from './add-character.presenter';
import { addCharErrorKey, isImageUrl, parseAddCharModal, pickHandlers, rarityLabel } from './character-form';
import {
  buildEditCharComponents,
  buildEditCharModal,
  EDITCHAR_MODAL_ID,
  EDITCHAR_NSFW_ID,
  EDITCHAR_RARITY_ID,
  EDITCHAR_SAVE_ID,
  EDITCHAR_TEXTS_ID,
  EDITCHAR_TYPE_ID,
  type EditCharDraft,
  editCharPreview,
} from './edit-character.presenter';

const ALLOWED_TYPES = ['all', 'waifu', 'husbando'] as const;
const ADDCHAR_PICKS = pickHandlers({ rarity: ADDCHAR_RARITY_ID, type: ADDCHAR_TYPE_ID, nsfw: ADDCHAR_NSFW_ID });
const EDITCHAR_PICKS = pickHandlers({ rarity: EDITCHAR_RARITY_ID, type: EDITCHAR_TYPE_ID, nsfw: EDITCHAR_NSFW_ID });
const RMCHAR_CONFIRM_ID = 'rmchar:confirm';
const RMCHAR_CANCEL_ID = 'rmchar:cancel';
const CLEARMSG_CONFIRM_ID = 'clearmsg:confirm';
const CLEARMSG_CANCEL_ID = 'clearmsg:cancel';
const CLEARMSG_MAX_FETCH = 500;

type CharacterView = {
  id: number;
  name: string;
  series: string | null;
  rarity: Rarity;
  type: CharacterType;
  isNsfw: boolean;
};

export class AdminCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'setup', execute: this.handleSetup },
      { name: 'charimage', execute: this.handleCharImage },
      { name: 'addchar', execute: this.handleAddChar },
      { name: 'editchar', execute: this.handleEditChar },
      { name: 'removechar', execute: this.handleRemoveChar },
      { name: 'resetrolls', execute: this.handleResetRolls },
      { name: 'resetclaim', execute: this.handleResetClaim },
      { name: 'clearmessages', execute: this.handleClearMessages },
    ];
  }

  private handleSetup = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, guildConfig, t } = ctx;
    if (!isGuildManager(invocation.member)) {
      await invocation.reply(t('setup.no_permission'));
      return;
    }
    const guildId = invocation.guildId;
    if (!guildId) return;

    const sub = (args[0] ?? '').toLowerCase();
    const value = (args[1] ?? '').toLowerCase();

    if (sub === 'mode') {
      if (value !== 'guild' && value !== 'global') {
        await invocation.reply(t('setup.mode_usage'));
        return;
      }
      const result = await this.api.post<{ ok: boolean; mode: 'guild' | 'global' }>('/internal/v1/guilds/setup', {
        guildId,
        action: 'mode',
        value,
      });
      const mode = t(`setup.mode_names.${result.mode}`);
      await invocation.reply(t(result.ok ? 'setup.mode_set' : 'setup.mode_already', { mode }));
      return;
    }
    if (sub === 'channel') {
      await this.api.post('/internal/v1/guilds/setup', { guildId, channelId: invocation.channelId, action: 'channel' });
      await invocation.reply(t('setup.channel_set', { channel: `<#${invocation.channelId}>` }));
      return;
    }
    if (sub === 'types') {
      if (!ALLOWED_TYPES.includes(value as (typeof ALLOWED_TYPES)[number])) {
        await invocation.reply(t('setup.invalid'));
        return;
      }
      await this.api.post('/internal/v1/guilds/setup', { guildId, action: 'types', value });
      await invocation.reply(t('setup.types_set', { types: value }));
      return;
    }
    if (sub === 'prefix') {
      if (!args[1] || args[1].length > 3 || args[1] === '/') {
        await invocation.reply(t('setup.invalid'));
        return;
      }
      await this.api.post('/internal/v1/guilds/setup', { guildId, action: 'prefix', value: args[1] });
      await invocation.reply(t('setup.prefix_set', { prefix: args[1] }));
      return;
    }
    if (sub === 'locale') {
      if (!SUPPORTED_LOCALES.includes(value as Locale)) {
        await invocation.reply(t('setup.invalid'));
        return;
      }
      await this.api.post('/internal/v1/guilds/setup', { guildId, action: 'locale', value });
      await invocation.reply(t('setup.locale_set', { locale: value }));
      return;
    }
    if (sub === 'interval') {
      const minutes = Number(args[1]);
      if (!Number.isInteger(minutes) || minutes < 1) {
        await invocation.reply(t('setup.invalid'));
        return;
      }
      await this.api.post('/internal/v1/guilds/setup', { guildId, action: 'interval', minutes });
      await invocation.reply(t('setup.interval_set', { minutes }));
      return;
    }
    if (sub === 'channels') {
      if (!isGuildOwner(invocation.member)) {
        await invocation.reply(t('setup.channels.no_owner'));
        return;
      }
      const action = (args[1] ?? '').toLowerCase();
      if (action === 'list') {
        const data = await this.api.post<{ allowedChannelIds: string[] }>('/internal/v1/guilds/setup', {
          guildId,
          action: 'channels-list',
        });
        if (data.allowedChannelIds.length === 0) {
          await invocation.reply(t('setup.channels.empty'));
          return;
        }
        await invocation.reply(t('setup.channels.list', { channels: data.allowedChannelIds.map((id) => `<#${id}>`).join(', ') }));
        return;
      }
      if (action === 'add' || action === 'remove') {
        const target = invocation.mentions.channels.first();
        if (!target) {
          await invocation.reply(t('setup.channels.usage'));
          return;
        }
        const data = await this.api.post<{ ok: boolean; reason?: string; allowedChannelIds?: string[] }>(
          '/internal/v1/guilds/setup',
          { guildId, action: action === 'add' ? 'channels-add' : 'channels-remove', targetChannelId: target.id },
        );
        if (!data.ok && data.reason === 'already_added') {
          await invocation.reply(t('setup.channels.already_added', { channel: `<#${target.id}>` }));
          return;
        }
        if (!data.ok && data.reason === 'not_in_list') {
          await invocation.reply(t('setup.channels.not_in_list', { channel: `<#${target.id}>` }));
          return;
        }
        await invocation.reply(
          t(action === 'add' ? 'setup.channels.added' : 'setup.channels.removed', { channel: `<#${target.id}>` }),
        );
        return;
      }
      await invocation.reply(t('setup.channels.usage'));
      return;
    }

    await invocation.reply(
      t('setup.current', {
        mode: t(`setup.mode_names.${guildConfig.scopeMode ?? 'unset'}`),
        prefix: guildConfig.prefix,
        locale: guildConfig.defaultLocale,
        types: Array.isArray(guildConfig.allowedTypes) ? guildConfig.allowedTypes.join(', ') : guildConfig.allowedTypes,
        interval: guildConfig.rollIntervalMinutes,
        channel: guildConfig.rollChannelId ? `<#${guildConfig.rollChannelId}>` : '—',
        channels_restricted:
          guildConfig.allowedChannelIds.length > 0
            ? guildConfig.allowedChannelIds.map((id) => `<#${id}>`).join(', ')
            : t('setup.channels.not_restricted'),
      }),
    );
  };

  private handleCharImage = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, flags, user, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('error.not_owner'));
      return;
    }
    const sub = (args[0] ?? '').toLowerCase();
    if (sub === 'add') {
      const characterId = Number(args[1]);
      const url = args[2];
      if (!Number.isInteger(characterId) || !url || !isImageUrl(url)) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}charimage add <id> <url> [--nsfw] [--primary]' }));
        return;
      }
      const result = await this.api.post<{ ok: boolean; reason?: string; id?: number; nsfw?: boolean; primary?: boolean }>(
        '/internal/v1/admin/charimage',
        {
          actorDiscordId: user.discordId,
          action: 'add',
          characterId,
          url,
          nsfw: flags.nsfw === true,
          primary: flags.primary === true,
        },
      );
      if (!result.ok) {
        await invocation.reply(t('charimage.not_found', { id: characterId }));
        return;
      }
      await invocation.reply(
        t('charimage.added', {
          id: result.id ?? 0,
          group: result.nsfw ? '🔞 NSFW' : '🟢 SFW',
          primary: result.primary ? '⭐' : '—',
        }),
      );
      return;
    }
    if (sub === 'list') {
      const characterId = Number(args[1]);
      if (!Number.isInteger(characterId)) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}charimage list <id>' }));
        return;
      }
      const { images } = await this.api.post<{ images: Array<{ id: number; url: string; nsfw: boolean; primary: boolean }> }>(
        '/internal/v1/admin/charimage',
        { actorDiscordId: user.discordId, action: 'list', characterId },
      );
      if (images.length === 0) {
        await invocation.reply(t('charimage.empty', { id: characterId }));
        return;
      }
      await invocation.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(t('charimage.list_title', { id: characterId }))
            .setDescription(images.map((i) => `\`#${i.id}\` ${i.nsfw ? '🔞' : '🟢'} ${i.primary ? '⭐' : '·'} ${i.url}`).join('\n')),
        ],
      });
      return;
    }
    if (sub === 'remove') {
      const imageId = Number(args[1]);
      if (!Number.isInteger(imageId)) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}charimage remove <id_imagem>' }));
        return;
      }
      const { ok } = await this.api.post<{ ok: boolean }>('/internal/v1/admin/charimage', {
        actorDiscordId: user.discordId,
        action: 'remove',
        imageId,
      });
      await invocation.reply(ok ? t('charimage.removed', { id: imageId }) : t('charimage.image_not_found'));
      return;
    }
    await invocation.reply(t('error.missing_args', { usage: '{prefix}charimage add|list|remove ...' }));
  };

  private handleAddChar = async (ctx: CommandContext): Promise<void> => {
    const { invocation, user, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('error.not_owner'));
      return;
    }
    const draft: AddCharDraft = { nsfw: false };
    const reply = await invocation.reply({ content: t('addchar.prompt'), components: buildAddCharComponents(draft, t) });
    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === invocation.author.id,
      time: 180_000,
    });
    collector.on('collect', async (i) => {
      if (i.isStringSelectMenu()) {
        ADDCHAR_PICKS[i.customId]?.(draft, i.values[0]);
        await i.update({ components: buildAddCharComponents(draft, t) });
        return;
      }
      if (!i.isButton() || i.customId !== ADDCHAR_OPEN_ID) return;
      if (!draft.rarity || !draft.type) {
        await i.reply({ content: t('addchar.need_picks'), flags: MessageFlags.Ephemeral });
        return;
      }
      await i.showModal(buildAddCharModal(t));
      let submit;
      try {
        submit = await i.awaitModalSubmit({
          filter: (m) => m.customId === ADDCHAR_MODAL_ID && m.user.id === invocation.author.id,
          time: 300_000,
        });
      } catch {
        return;
      }
      const parsed = parseAddCharModal(submit.fields);
      if (!parsed.ok) {
        await submit.reply({ content: t(parsed.key), flags: MessageFlags.Ephemeral });
        return;
      }
      const { input } = parsed;
      const created = await this.api.post<{ ok: boolean; reason?: string; character?: CharacterView }>(
        '/internal/v1/admin/character/create',
        { actorDiscordId: user.discordId, type: draft.type, rarity: draft.rarity, nsfw: draft.nsfw, ...input },
      );
      if (!created.ok || !created.character) {
        await submit.reply({
          content: t(addCharErrorKey(created.reason), { id: input.baseCharacterId ?? 0 }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      collector.stop('done');
      await reply.edit({ components: buildAddCharComponents(draft, t, true) }).catch(() => undefined);
      await submit.reply({ embeds: [buildAddCharCreatedEmbed(created.character, input, draft.nsfw, t)] });
    });
    collector.on('end', (_collected, reason) => {
      if (reason !== 'done') void reply.edit({ content: t('addchar.timeout'), components: [] }).catch(() => undefined);
    });
  };

  private handleEditChar = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('error.not_owner'));
      return;
    }
    const id = Number(args[0]);
    if (!Number.isInteger(id) || id <= 0) {
      await invocation.reply(t('editchar.usage'));
      return;
    }
    const found = await this.api.post<{ ok: boolean; character?: CharacterView }>('/internal/v1/admin/character/get', {
      actorDiscordId: user.discordId,
      characterId: id,
    });
    if (!found.ok || !found.character) {
      await invocation.reply(t('editchar.not_found', { id }));
      return;
    }
    const draft: EditCharDraft = {
      rarity: found.character.rarity,
      type: found.character.type,
      nsfw: found.character.isNsfw,
      name: found.character.name,
      series: found.character.series,
    };
    const reply = await invocation.reply({
      content: editCharPreview(draft, id, t),
      components: buildEditCharComponents(draft, t),
    });
    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === invocation.author.id,
      time: 180_000,
    });
    collector.on('collect', async (i) => {
      if (i.isStringSelectMenu()) {
        EDITCHAR_PICKS[i.customId]?.(draft, i.values[0]);
        await i.update({ content: editCharPreview(draft, id, t), components: buildEditCharComponents(draft, t) });
        return;
      }
      if (!i.isButton()) return;
      if (i.customId === EDITCHAR_TEXTS_ID) {
        await i.showModal(buildEditCharModal(draft, t));
        try {
          const submit = await i.awaitModalSubmit({
            filter: (m) => m.customId === EDITCHAR_MODAL_ID && m.user.id === invocation.author.id,
            time: 300_000,
          });
          draft.name = submit.fields.getTextInputValue('name').trim() || draft.name;
          draft.series = submit.fields.getTextInputValue('series').trim() || null;
          await submit.deferUpdate();
          await reply.edit({ content: editCharPreview(draft, id, t), components: buildEditCharComponents(draft, t) });
        } catch {
          /* modal expired */
        }
        return;
      }
      if (i.customId === EDITCHAR_SAVE_ID) {
        const saved = await this.api.post<{ ok: boolean; character?: CharacterView }>('/internal/v1/admin/character/edit', {
          actorDiscordId: user.discordId,
          characterId: id,
          ...draft,
        });
        collector.stop('done');
        if (!saved.ok || !saved.character) {
          await i.update({ content: t('editchar.not_found', { id }), components: [] });
          return;
        }
        await i.update({
          content: t('editchar.saved', {
            name: saved.character.name,
            id: saved.character.id,
            rarity: rarityLabel(saved.character.rarity, t),
            type: t(`common.type.${saved.character.type}`),
          }),
          components: [],
        });
      }
    });
    collector.on('end', (_collected, reason) => {
      if (reason !== 'done') void reply.edit({ content: t('editchar.timeout'), components: [] }).catch(() => undefined);
    });
  };

  private handleRemoveChar = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('error.not_owner'));
      return;
    }
    const id = Number(args[0]);
    if (!Number.isInteger(id) || id <= 0) {
      await invocation.reply(t('removechar.usage'));
      return;
    }
    const found = await this.api.post<{ ok: boolean; character?: CharacterView }>('/internal/v1/admin/character/get', {
      actorDiscordId: user.discordId,
      characterId: id,
    });
    if (!found.ok || !found.character) {
      await invocation.reply(t('removechar.not_found', { id }));
      return;
    }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(RMCHAR_CONFIRM_ID).setStyle(ButtonStyle.Danger).setLabel(t('removechar.confirm_button')),
      new ButtonBuilder().setCustomId(RMCHAR_CANCEL_ID).setStyle(ButtonStyle.Secondary).setLabel(t('common.cancel')),
    );
    const reply = await invocation.reply({
      content: t('removechar.confirm', { name: found.character.name, id }),
      components: [row],
    });
    let interaction;
    try {
      interaction = await reply.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === invocation.author.id,
        time: 60_000,
      });
    } catch {
      await reply.edit({ content: t('removechar.timeout'), components: [] }).catch(() => undefined);
      return;
    }
    if (interaction.customId === RMCHAR_CANCEL_ID) {
      await interaction.update({ content: t('removechar.cancelled'), components: [] });
      return;
    }
    const deleted = await this.api.post<{ ok: boolean; name?: string; id?: number }>('/internal/v1/admin/character/delete', {
      actorDiscordId: user.discordId,
      characterId: id,
    });
    await interaction.update({
      content: deleted.ok
        ? t('removechar.done', { name: deleted.name ?? found.character.name, id })
        : t('removechar.not_found', { id }),
      components: [],
    });
  };

  private handleResetRolls = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, guildConfig, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('error.not_owner'));
      return;
    }
    const sub = (args[0] ?? '').toLowerCase();
    if (sub === 'all' || sub === 'todos') {
      const { count } = await this.api.post<{ count: number }>('/internal/v1/admin/reset-rolls', {
        actorDiscordId: user.discordId,
        all: true,
      });
      await invocation.reply(t('resetrolls.all', { count }));
      return;
    }
    const target = invocation.mentions.users.first();
    if (!target) {
      await invocation.reply(t('resetrolls.usage'));
      return;
    }
    const result = await this.api.post<{ rollsLeft: number }>('/internal/v1/admin/reset-rolls', {
      actorDiscordId: user.discordId,
      targetDiscordId: target.id,
      targetUsername: target.username,
      guildId: invocation.guildId,
      rollIntervalMinutes: guildConfig.rollIntervalMinutes,
    });
    await invocation.reply(t('resetrolls.one', { user: `<@${target.id}>`, rolls: result.rollsLeft }));
  };

  private handleResetClaim = async (ctx: CommandContext): Promise<void> => {
    const { invocation, user, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('error.not_owner'));
      return;
    }
    const target = invocation.mentions.users.first();
    if (!target) {
      await invocation.reply(t('resetclaim.usage'));
      return;
    }
    await this.api.post('/internal/v1/admin/reset-claim', {
      actorDiscordId: user.discordId,
      targetDiscordId: target.id,
      targetUsername: target.username,
      guildId: invocation.guildId,
    });
    await invocation.reply(t('resetclaim.one', { user: `<@${target.id}>` }));
  };

  private handleClearMessages = async (ctx: CommandContext): Promise<void> => {
    const { invocation, user, guildConfig, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('clearmessages.no_permission'));
      return;
    }
    const mentionedChannel = invocation.mentions.channels.first();
    const targetChannel = (mentionedChannel ?? invocation.channel) as TextChannel;
    if (targetChannel.type !== ChannelType.GuildText && targetChannel.type !== ChannelType.GuildVoice) {
      await invocation.reply(t('clearmessages.not_text_channel'));
      return;
    }
    const prefix = guildConfig.prefix;
    const botId = invocation.client.user?.id;
    if (!botId) {
      await invocation.reply(t('error.generic'));
      return;
    }
    const statusMsg = await invocation.reply(t('clearmessages.fetching'));
    const matchedMessages: { id: string; authorId: string }[] = [];
    let lastId: string | undefined;
    while (matchedMessages.length < CLEARMSG_MAX_FETCH) {
      const batch = await targetChannel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) }).catch(() => undefined);
      if (!batch || batch.size === 0) break;
      for (const [, msg] of batch) {
        if (msg.author.id === botId || msg.content.startsWith(prefix)) {
          matchedMessages.push({ id: msg.id, authorId: msg.author.id });
        }
        lastId = msg.id;
      }
      if (batch.size < 100) break;
    }
    if (matchedMessages.length === 0) {
      await statusMsg.edit(t('clearmessages.empty', { channel: `<#${targetChannel.id}>` }));
      return;
    }
    const botCount = matchedMessages.filter((m) => m.authorId === botId).length;
    const embed = new EmbedBuilder()
      .setTitle(t('clearmessages.title'))
      .setDescription(
        t('clearmessages.found', {
          total: matchedMessages.length,
          bot: botCount,
          users: matchedMessages.length - botCount,
          channel: `<#${targetChannel.id}>`,
        }),
      )
      .setFooter({ text: t('clearmessages.footer_note') })
      .setColor(0xff_a5_00);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(CLEARMSG_CONFIRM_ID).setStyle(ButtonStyle.Danger).setLabel(t('clearmessages.confirm_button')),
      new ButtonBuilder().setCustomId(CLEARMSG_CANCEL_ID).setStyle(ButtonStyle.Secondary).setLabel(t('common.cancel')),
    );
    await statusMsg.edit({ content: null, embeds: [embed], components: [row] });
    let interaction;
    try {
      interaction = await statusMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === invocation.author.id,
        time: 60_000,
      });
    } catch {
      await statusMsg.edit({ content: t('clearmessages.timeout'), embeds: [], components: [] }).catch(() => undefined);
      return;
    }
    if (interaction.customId === CLEARMSG_CANCEL_ID) {
      await interaction.update({ content: t('clearmessages.cancelled'), embeds: [], components: [] });
      return;
    }
    const ids = matchedMessages.map((m) => m.id);
    let deleted = 0;
    await interaction.deferUpdate();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      try {
        deleted += (await targetChannel.bulkDelete(chunk, true)).size;
      } catch {
        for (const id of chunk) {
          try {
            const msg = await targetChannel.messages.fetch(id).catch(() => null);
            if (msg) {
              await msg.delete();
              deleted++;
            }
          } catch {
            /* skip undeletable */
          }
        }
      }
    }
    await statusMsg.edit({
      content: t('clearmessages.done', {
        deleted,
        failed: matchedMessages.length - deleted,
        channel: `<#${targetChannel.id}>`,
      }),
      embeds: [],
      components: [],
    });
  };
}
