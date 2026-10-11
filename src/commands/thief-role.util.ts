import type { Guild } from 'discord.js';

import type { ThiefEvent } from '../bind-types';
import type { InternalClient } from '../client';
import type { TranslateFn } from '../interfaces';
import { contextualLogger } from '../observability/context';

export interface ThiefRoleStore {
  setThiefRoleId(guildId: string, roleId: string): Promise<void>;
}

/**
 * Aplica a coroa do evento de roubo. No escopo global o campeão é o mesmo em todos os servidores
 * globais: o cargo é aplicado (ou criado) em cada um onde o bot está; no modo guild, só aqui.
 */
export async function applyThiefEvent(
  guild: Guild,
  api: InternalClient,
  event: ThiefEvent,
  t: TranslateFn,
): Promise<void> {
  const crown = event.crown;
  if (!crown) return;
  const store: ThiefRoleStore = {
    setThiefRoleId: (guildId, roleId) =>
      api.post('/internal/v1/gacha/thief-role', { guildId, roleId }).then(() => undefined),
  };
  if (event.scope !== 'global') {
    await applyThiefCrown(guild, store, crown, t);
    return;
  }
  const { guilds } = await api.post<{ guilds: Array<{ guildId: string; thiefRoleId: string | null }> }>(
    '/internal/v1/guilds/global',
  );
  for (const target of guilds) {
    const member = guild.client.guilds.cache.get(target.guildId);
    if (member) await applyThiefCrown(member, store, { ...crown, existingRoleId: target.thiefRoleId }, t);
  }
}

export async function applyThiefCrown(
  guild: Guild,
  store: ThiefRoleStore,
  crown: NonNullable<ThiefEvent['crown']>,
  t: TranslateFn,
): Promise<void> {
  let roleId = crown.existingRoleId;
  if (!roleId) {
    try {
      const role = await guild.roles.create({
        name: t('thief.role_name'),
        mentionable: false,
        reason: 'Kizuna: cargo de Ladrão/Thief',
      });
      roleId = role.id;
      await store.setThiefRoleId(guild.id, role.id);
    } catch (err) {
      contextualLogger({ component: 'thief-role', guildId: guild.id }).warn(
        { err, action: 'create' },
        'thief role operation failed',
      );
      return;
    }
  }
  if (!roleId) return;
  try {
    if (crown.oldThiefDiscordId) {
      const oldMember = await guild.members.fetch(crown.oldThiefDiscordId).catch(() => null);
      if (oldMember) await oldMember.roles.remove(roleId).catch(() => undefined);
    }
    const member = await guild.members.fetch(crown.newThiefDiscordId).catch(() => null);
    if (member) await member.roles.add(roleId).catch(() => undefined);
  } catch (err) {
    contextualLogger({ component: 'thief-role', guildId: guild.id }).warn(
      { err, action: 'assign' },
      'thief role operation failed',
    );
  }
}
