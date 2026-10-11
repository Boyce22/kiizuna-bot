import { ui } from '@config';
import { checkNsfwPermission, paginate } from '@utils';

import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

import { buildCollectionEmbed, type CollectionCardView } from './collection.presenter';

export class CollectionCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'collection', execute: this.handleCollection },
    ];
  }

  private handleCollection = async (ctx: CommandContext): Promise<void> => {
    const { invocation, t } = ctx;
    const targetUser = invocation.mentions.users.first() ?? invocation.author;
    const targetName =
      invocation.mentions.members?.first()?.displayName ??
      invocation.member?.displayName ??
      targetUser.username;
    const nsfw = checkNsfwPermission(invocation.channel, true).allowed;
    const guildId = invocation.guildId!;
    const pageSize = ui.pagination.collectionPageSize;

    type Page = {
      total: number;
      card: CollectionCardView | null;
      imageUrl: string | null;
      bond: number;
    };

    const first = await this.api.post<Page>('/internal/v1/collection/page', {
      discordId: ctx.user.discordId,
      username: ctx.user.username ?? undefined,
      targetDiscordId: targetUser.id,
      targetUsername: targetUser.username,
      guildId,
      nsfw,
      page: 0,
      pageSize,
    });
    if (first.total === 0 || !first.card) {
      await invocation.reply(t('collection.empty', { user: targetName }));
      return;
    }

    await paginate({
      invocation,
      total: first.total,
      pageSize,
      t,
      renderPage: async (page, totalPages) => {
        const data =
          page === 0
            ? first
            : await this.api.post<Page>('/internal/v1/collection/page', {
                discordId: ctx.user.discordId,
                targetDiscordId: targetUser.id,
                targetUsername: targetUser.username,
                guildId,
                nsfw,
                page,
                pageSize,
              });
        return buildCollectionEmbed(
          data.card!,
          data.imageUrl,
          { targetName, page, totalPages, nsfw, bond: data.bond },
          t,
        );
      },
    });
  };
}
