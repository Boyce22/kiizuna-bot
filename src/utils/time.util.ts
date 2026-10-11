// Timestamp relativo do Discord (ex.: "in 2 hours"), traduzido automaticamente pelo client.
export function discordRelative(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

// Data longa do Discord (ex.: "23 de junho de 2026"), localizada pelo client de cada usuário.
export function discordDate(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:D>`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

// Próxima virada de dia UTC estritamente após `date` (00:00:00.000 UTC do dia seguinte).
export function nextUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0));
}

// Mesmo dia-calendário UTC (ano/mês/dia), independente da hora.
export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Pausa por `ms` (ex.: respeitar rate limit de API externa). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
