import type {
  BaseMessageOptions,
  Channel,
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  User,
} from 'discord.js';

interface FirstValue<T> {
  first(): T | undefined;
}

export type InvocationReplyOptions = BaseMessageOptions & {
  flags?: MessageFlags.IsComponentsV2;
};

export interface InvocationMentions {
  users: FirstValue<User>;
  members: FirstValue<GuildMember> | null;
  channels: FirstValue<Channel>;
}

export interface CommandInvocation {
  readonly source: 'message' | 'slash';
  readonly author: User;
  readonly member: GuildMember | null;
  readonly guild: Guild | null;
  readonly guildId: string;
  readonly channelId: string;
  readonly channel: Message['channel'];
  readonly client: Client<true>;
  readonly mentions: InvocationMentions;
  readonly deferred: boolean;
  defer(ephemeral?: boolean): Promise<void>;
  reply(payload: string | InvocationReplyOptions, ephemeral?: boolean): Promise<Message>;
  deleteSource(): Promise<void>;
}

export class MessageCommandInvocation implements CommandInvocation {
  readonly source = 'message' as const;

  constructor(private readonly message: Message<true>) {}

  get author(): User {
    return this.message.author;
  }

  get member(): GuildMember | null {
    return this.message.member;
  }

  get guild(): Guild {
    return this.message.guild;
  }

  get guildId(): string {
    return this.message.guildId;
  }

  get channelId(): string {
    return this.message.channelId;
  }

  get channel(): Message['channel'] {
    return this.message.channel;
  }

  get client(): Client<true> {
    return this.message.client;
  }

  get mentions(): InvocationMentions {
    return this.message.mentions;
  }

  get deferred(): boolean {
    return false;
  }

  async defer(): Promise<void> {}

  reply(payload: string | InvocationReplyOptions): Promise<Message> {
    return this.message.reply(payload);
  }

  async deleteSource(): Promise<void> {
    await this.message.delete().catch(() => undefined);
  }
}

export class SlashCommandInvocation implements CommandInvocation {
  readonly source = 'slash' as const;
  private firstReply = true;
  private readonly resolvedMentions: InvocationMentions;

  constructor(private readonly interaction: ChatInputCommandInteraction<'cached'>) {
    const users: User[] = [];
    const members: GuildMember[] = [];
    const channels: Channel[] = [];

    const visit = (options: ReadonlyArray<(typeof interaction.options.data)[number]>): void => {
      for (const option of options) {
        if (option.user) users.push(option.user);
        if (option.member) members.push(option.member as GuildMember);
        if (option.channel) channels.push(option.channel);
        if (option.options) visit(option.options);
      }
    };
    visit(interaction.options.data);

    this.resolvedMentions = {
      users: { first: () => users[0] },
      members: { first: () => members[0] },
      channels: { first: () => channels[0] },
    };
  }

  get author(): User {
    return this.interaction.user;
  }

  get member(): GuildMember {
    return this.interaction.member;
  }

  get guild(): Guild {
    return this.interaction.guild;
  }

  get guildId(): string {
    return this.interaction.guildId;
  }

  get channelId(): string {
    return this.interaction.channelId;
  }

  get channel(): Message['channel'] {
    return this.interaction.channel as Message['channel'];
  }

  get client(): Client<true> {
    return this.interaction.client;
  }

  get mentions(): InvocationMentions {
    return this.resolvedMentions;
  }

  get deferred(): boolean {
    return this.interaction.deferred;
  }

  async defer(ephemeral = false): Promise<void> {
    if (this.interaction.deferred || this.interaction.replied) return;
    await this.interaction.deferReply({ ephemeral });
  }

  async reply(payload: string | InvocationReplyOptions, ephemeral = false): Promise<Message> {
    const options = typeof payload === 'string' ? { content: payload } : payload;
    if (this.interaction.deferred && this.firstReply) {
      this.firstReply = false;
      return this.interaction.editReply(options);
    }
    if (this.interaction.replied || !this.firstReply) {
      this.firstReply = false;
      return this.interaction.followUp({
        ...options,
        ephemeral,
        fetchReply: true,
      });
    }
    this.firstReply = false;
    return this.interaction.reply({
      ...options,
      ephemeral,
      fetchReply: true,
    });
  }

  async deleteSource(): Promise<void> {}
}
