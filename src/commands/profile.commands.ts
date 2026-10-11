import { MessageFlags } from 'discord.js';

import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

import { buildProfileContainer, type ProfilePayload } from './profile.presenter';

export class ProfileCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [{ name: 'profile', execute: this.handleProfile }];
  }

  private handleProfile = async (ctx: CommandContext): Promise<void> => {
    const { invocation, user, t } = ctx;
    const targetUser = invocation.mentions.users.first() ?? invocation.author;
    const displayName =
      invocation.mentions.members?.first()?.displayName ?? invocation.member?.displayName ?? targetUser.username;
    const data = await this.api.post<ProfilePayload>('/internal/v1/profile/view', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      targetDiscordId: targetUser.id,
      targetUsername: targetUser.username,
      guildId: invocation.guildId,
    });
    const container = buildProfileContainer(displayName, data, { avatarUrl: targetUser.displayAvatarURL({ size: 256 }) }, t);
    await invocation.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  };
}
