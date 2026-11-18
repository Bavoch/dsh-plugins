import { readFileSync } from 'node:fs';
import { installNextTask } from './next-task.js';

export const name = '@local/dsh-concise-replies';
export const inject = ['systemPrompt', 'connection', 'sessions', 'sessionQuery', 'llm'];

export function apply(ctx) {
  installNextTask(ctx);
  // Read on assembly so refining writing rules does not require restarting agents or the Host.
  ctx.systemPrompt.section({
    name: 'concise-user-facing-results',
    order: 10000,
    interpolate: false,
    text: () => readFileSync(new URL('./reply-policy.txt', import.meta.url), 'utf8'),
  });
}
