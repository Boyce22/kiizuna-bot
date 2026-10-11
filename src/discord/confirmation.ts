import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ComponentType,
  type Message,
} from 'discord.js';

/**
 * Resultado de um fluxo de confirmação (sim/não/timeout). Mantém a referência ao
 * `interaction`/`prompt` para que o **comando** renderize o estado final — a regra fica no
 * serviço, o I/O do Discord fica concentrado aqui (controlador fino e reutilizável).
 */
export type ConfirmationOutcome =
  | { status: 'confirmed'; interaction: ButtonInteraction }
  | { status: 'declined'; interaction: ButtonInteraction }
  | { status: 'timeout'; prompt: Message };

export interface ConfirmationParams {
  /** Mensagem original (para `reply`). */
  message: Message;
  /** Texto do prompt de confirmação. */
  content: string;
  /** Só este usuário pode responder aos botões. */
  authorizedUserId: string;
  confirmLabel: string;
  cancelLabel: string;
  timeoutMs: number;
  /** Prefixo dos customIds (evita colisão entre fluxos). Default: `confirm`. */
  idPrefix?: string;
  confirmStyle?: ButtonStyle;
  cancelStyle?: ButtonStyle;
}

/**
 * Posta um prompt com botões Confirmar/Cancelar e aguarda a resposta do usuário autorizado.
 * Não renderiza o estado final — devolve o `interaction` (confirmado/recusado) ou o `prompt`
 * (timeout) para o chamador atualizar a mensagem como quiser.
 */
export async function awaitConfirmation(params: ConfirmationParams): Promise<ConfirmationOutcome> {
  const prefix = params.idPrefix ?? 'confirm';
  const yesId = `${prefix}_yes`;
  const noId = `${prefix}_no`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(yesId)
      .setStyle(params.confirmStyle ?? ButtonStyle.Success)
      .setLabel(params.confirmLabel),
    new ButtonBuilder()
      .setCustomId(noId)
      .setStyle(params.cancelStyle ?? ButtonStyle.Secondary)
      .setLabel(params.cancelLabel),
  );

  const prompt = await params.message.reply({ content: params.content, components: [row] });

  try {
    const interaction = await prompt.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: params.timeoutMs,
      filter: (i) => i.user.id === params.authorizedUserId,
    });
    return interaction.customId === yesId
      ? { status: 'confirmed', interaction }
      : { status: 'declined', interaction };
  } catch {
    return { status: 'timeout', prompt };
  }
}
