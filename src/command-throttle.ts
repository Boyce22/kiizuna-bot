/**
 * Anti-spam por usuário, em memória (um processo de gateway). Janela fixa: até `max` comandos a
 * cada `windowMs`. A primeira recusa da janela é avisada; as seguintes caem em silêncio, para o
 * spam não virar spam de respostas do bot.
 */
export type ThrottleVerdict = 'ok' | 'warn' | 'drop';

interface Window {
  startedAt: number;
  count: number;
}

export class CommandThrottle {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 10_000,
    private readonly maxTracked = 100_000,
  ) {}

  take(key: string, now = Date.now()): ThrottleVerdict {
    let window = this.windows.get(key);
    if (!window || now - window.startedAt >= this.windowMs) {
      if (!window && this.windows.size >= this.maxTracked) this.sweep(now);
      window = { startedAt: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count++;
    if (window.count <= this.max) return 'ok';
    return window.count === this.max + 1 ? 'warn' : 'drop';
  }

  /** Segundos até a janela do usuário reabrir (para a mensagem de aviso). */
  retryAfterSeconds(key: string, now = Date.now()): number {
    const window = this.windows.get(key);
    if (!window) return 0;
    return Math.max(1, Math.ceil((window.startedAt + this.windowMs - now) / 1000));
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows)
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    // Mesmo assim cheio (ataque com muitas contas): recomeça do zero em vez de crescer sem teto.
    if (this.windows.size >= this.maxTracked) this.windows.clear();
  }
}

/** Comandos (prefixo e slash) por usuário. */
export const commandThrottle = new CommandThrottle();
/** Cliques em componentes (botão de vincular) por usuário: um summon gera vários cliques legítimos. */
export const componentThrottle = new CommandThrottle(8, 10_000);
