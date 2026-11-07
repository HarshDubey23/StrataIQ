/** Rules for a voice conversation that can be interrupted at any moment. Kept apart from the UI so they can be tested. */

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

/**
 * The mic stays open while Strata talks, so it also hears Strata. This tells that echo from a real interruption:
 * if nearly everything heard is in what is being said, it is the speaker, not the person.
 */
export function isEcho(heard: string, spoken: string): boolean {
  const said = new Set(words(spoken));
  const got = words(heard);
  if (!got.length) return true;
  return got.filter((w) => said.has(w)).length / got.length >= 0.7;
}

const STOP = /^(stop|stop it|stop talking|wait|hold on|cancel|never mind|nevermind|quiet|ruko|ruk|ruk jao|bas|chup)$/;

/** "Stop" means be quiet and listen. It is not a question to answer. */
export const isStopWord = (heard: string) => STOP.test(words(heard).join(" "));

export interface HistoryMsg {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: { id: string; name: string; args: string }[];
  toolCallId?: string;
  isError?: boolean;
}

export const INTERRUPTED = "(Stopped here because the user sent a new message. Anything already done on screen stands.)";

/**
 * Leaves the history valid after an interruption, keeping what was asked and done so the next answer has the context.
 * A tool call without all its results must go, or the model rejects the whole conversation.
 */
export function settleHistory(h: HistoryMsg[]): void {
  for (let i = h.length - 1; i >= 0; i--) {
    const calls = h[i].toolCalls;
    if (h[i].role !== "assistant" || !calls?.length) continue;
    const answered = new Set(h.slice(i + 1).filter((m) => m.role === "tool").map((m) => m.toolCallId));
    if (!calls.every((c) => answered.has(c.id))) h.length = i;
    break;
  }
  const last = h[h.length - 1];
  if (last && (last.role !== "assistant" || last.toolCalls?.length)) h.push({ role: "assistant", content: INTERRUPTED });
}

/** The latest stretch of conversation that fits the API limit, starting on a user turn so no tool result loses its call. */
export function recentTurns<T extends { role: string }>(h: T[], limit = 36): T[] {
  for (let i = Math.max(0, h.length - limit); i < h.length; i++) {
    if (h[i].role === "user") return h.slice(i);
  }
  return h.slice(-1);
}
