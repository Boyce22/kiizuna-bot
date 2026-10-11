import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

import type { Logger } from './logger';

interface MetricEntry {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
}

const commands = new Map<string, MetricEntry>();
const apiRequests = new Map<string, MetricEntry>();

function record(target: Map<string, MetricEntry>, key: string, elapsedMs: number, error: boolean): void {
  const entry = target.get(key) ?? { count: 0, errors: 0, totalMs: 0, maxMs: 0 };
  entry.count++;
  entry.errors += Number(error);
  entry.totalMs += elapsedMs;
  entry.maxMs = Math.max(entry.maxMs, elapsedMs);
  target.set(key, entry);
}

export function recordCommand(
  source: 'message' | 'slash',
  command: string,
  outcome: string,
  elapsedMs: number,
): void {
  record(commands, `${source}:${command}:${outcome}`, elapsedMs, outcome === 'error');
}

export function recordApiRequest(path: string, status: number, elapsedMs: number): void {
  record(apiRequests, `POST ${path}`, elapsedMs, status === 0 || status >= 500);
}

export function installTelemetry(logger: Logger, intervalMs = 30_000): () => void {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  let utilization = performance.eventLoopUtilization();
  let cpu = process.cpuUsage();
  delay.enable();

  const timer = setInterval(() => {
    const nextCpu = process.cpuUsage();
    const nextUtilization = performance.eventLoopUtilization();
    logger.info(
      {
        telemetry: {
          memory: process.memoryUsage(),
          cpu: { user: nextCpu.user - cpu.user, system: nextCpu.system - cpu.system },
          eventLoop: {
            utilization: performance.eventLoopUtilization(nextUtilization, utilization).utilization,
            p95Ms: delay.percentile(95) / 1e6,
            maxMs: delay.max / 1e6,
          },
          commands: Object.fromEntries(commands),
          apiRequests: Object.fromEntries(apiRequests),
        },
      },
      'runtime metrics',
    );
    cpu = nextCpu;
    utilization = nextUtilization;
    commands.clear();
    apiRequests.clear();
    delay.reset();
  }, intervalMs);
  timer.unref();

  return () => {
    clearInterval(timer);
    delay.disable();
  };
}
