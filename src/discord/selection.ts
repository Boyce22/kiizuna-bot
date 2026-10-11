import {
  ActionRowBuilder,
  ComponentType,
  type Message,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';

/**
 * Resultado de um fluxo de escolha via dropdown (item escolhido ou timeout). Mantém a
 * referência ao `interaction`/`prompt` para que o **comando** renderize o estado final — a
 * regra fica no serviço, o I/O do Discord fica concentrado aqui (controlador fino e reutilizável).
 */
export type SelectionOutcome<T> =
  | { status: 'picked'; value: T; interaction: StringSelectMenuInteraction }
  | { status: 'timeout'; prompt: Message };

export interface SelectionOption<T> {
  label: string;
  description?: string;
  value: T;
}

export interface SelectionParams<T> {
  /** Mensagem original (para `reply`). */
  message: Message;
  /** Texto do prompt de escolha. */
  content: string;
  placeholder: string;
  options: Array<SelectionOption<T>>;
  /** Só este usuário pode escolher. */
  authorizedUserId: string;
  timeoutMs: number;
  /** Prefixo do customId (evita colisão entre fluxos). Default: `select`. */
  idPrefix?: string;
}

/**
 * Posta um dropdown (StringSelectMenu) e aguarda a escolha do usuário autorizado. Só ele
 * consegue interagir — outros usuários que clicarem têm a interação silenciosamente ignorada
 * (mesmo padrão de `fixed.commands.ts`/`admin.commands.ts`). Não renderiza o estado final —
 * devolve o `interaction` (escolhido) ou o `prompt` (timeout) para o chamador atualizar a
 * mensagem como quiser.
 */
export async function awaitSelection<T>(params: SelectionParams<T>): Promise<SelectionOutcome<T>> {
  const customId = `${params.idPrefix ?? 'select'}_menu`;

  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(params.placeholder)
    .addOptions(
      params.options.map((option, i) => ({
        label: option.label,
        description: option.description,
        value: String(i),
      })),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const prompt = await params.message.reply({ content: params.content, components: [row] });

  try {
    const interaction = await prompt.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: params.timeoutMs,
      filter: (i) => i.user.id === params.authorizedUserId,
    });
    const chosen = params.options[Number(interaction.values[0])];
    return { status: 'picked', value: chosen.value, interaction };
  } catch {
    return { status: 'timeout', prompt };
  }
}
