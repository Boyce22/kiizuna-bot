export interface ParsedCommand {
  name: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

// Faz o parse de uma mensagem com prefixo: comando, args posicionais e flags (--x / --k v).
// Retorna null se a mensagem não começa com o prefixo.
export function parseCommand(content: string, prefix: string): ParsedCommand | null {
  if (!content.startsWith(prefix)) return null;
  const withoutPrefix = content.slice(prefix.length).trim();
  if (!withoutPrefix) return null;

  const tokens = withoutPrefix.split(/\s+/);
  const name = (tokens.shift() ?? '').toLowerCase();

  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      // Consome todos os tokens seguintes até a próxima flag (ou o fim) — permite valores com
      // espaço sem exigir aspas (ex.: --anime Pocket Monsters). Todo uso hoje coloca flags no
      // fim da linha, então isso não invade args posicionais.
      const values: string[] = [];
      while (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        values.push(tokens[++i]);
      }
      flags[key] = values.length > 0 ? values.join(' ') : true;
    } else {
      args.push(token);
    }
  }

  return { name, args, flags };
}

// Lê o valor de uma flag aceitando vários nomes alternativos (ex.: --anime/--series/--serie).
export function readFlag(
  flags: Record<string, string | boolean>,
  aliases: Set<string>,
): string | undefined {
  for (const [key, value] of Object.entries(flags)) {
    if (aliases.has(key.toLowerCase()) && typeof value === 'string') return value;
  }
  return undefined;
}
