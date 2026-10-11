import { ui } from '@config';
import { checkNsfwPermission, paginate } from '@utils';

import type { InternalClient } from '../client';
import type { Command, CommandContext } from '../interfaces';

import { buildCollectionEmbed, type CollectionCardView } from './collection.presenter';

export class CollectionCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [
      { name: 'collection', aliases: ['col', 'harem'], descriptionKey: 'command.collection.description', execute: this.handleCollection },
    ];
  }

  private handleCollection = async (ctx: CommandContext): Promise<void> => {
    const { message, t } = ctx;
    const targetUser = message.mentions.users.first() ?? message.author;
    const targetName =
      message.mentions.members?.first()?.displayName ??
      message.member?.displayName ??
      targetUser.username;
    const nsfw = checkNsfwPermission(message.channel, true).allowed;
    const guildId = message.guildId!;
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
      await message.reply(t('collection.empty', { user: targetName }));
      return;
    }

    await paginate({
      message,
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
