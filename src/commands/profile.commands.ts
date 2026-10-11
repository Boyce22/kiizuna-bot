import { MessageFlags } from 'discord.js';

import type { InternalClient } from '../client';
import type { Command, CommandContext } from '../interfaces';

import { buildProfileContainer, type ProfilePayload } from './profile.presenter';

export class ProfileCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [{ name: 'profile', aliases: ['p', 'perfil'], descriptionKey: 'command.profile.description', execute: this.handleProfile }];
  }

  private handleProfile = async (ctx: CommandContext): Promise<void> => {
    const { message, user, t } = ctx;
    const targetUser = message.mentions.users.first() ?? message.author;
    const displayName =
      message.mentions.members?.first()?.displayName ?? message.member?.displayName ?? targetUser.username;
    const data = await this.api.post<ProfilePayload>('/internal/v1/profile/view', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      targetDiscordId: targetUser.id,
      targetUsername: targetUser.username,
      guildId: message.guildId,
    });
    const container = buildProfileContainer(displayName, data, { avatarUrl: targetUser.displayAvatarURL({ size: 256 }) }, t);
    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  };
}
