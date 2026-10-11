import { type GuildMember, PermissionFlagsBits } from 'discord.js';

// Conjunto de IDs de dono do bot (de BOT_OWNER_IDS, CSV). Parseado uma vez.
let ownerIds: Set<string> | null = null;

function getOwnerIds(): Set<string> {
  if (!ownerIds) {
    ownerIds = new Set(
      (process.env.BOT_OWNER_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }
  return ownerIds;
}

/** Dono do bot (BOT_OWNER_IDS). Usado por comandos owner-only (ex.: k!vip-admin). */
export function isBotOwner(userId: string): boolean {
  return getOwnerIds().has(userId);
}

/**
 * Membro pode administrar o servidor (perm ManageGuild). Base de k!setup e
 * comandos de config por servidor. `null` (DM/sem membro) → false.
 */
export function isGuildManager(member: GuildMember | null): boolean {
  return member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/** Dono do servidor (guild owner). Usado para comandos que só o owner — e não
 *  admins/gerentes — podem executar, ex.: `k!setup channels`. */
export function isGuildOwner(member: GuildMember | null): boolean {
  if (!member) return false;
  return member.id === member.guild.ownerId;
}
