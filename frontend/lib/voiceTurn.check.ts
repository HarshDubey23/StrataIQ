// Run: node --experimental-strip-types lib/voiceTurn.check.ts
import assert from "node:assert/strict";
import { INTERRUPTED, isEcho, isStopWord, recentTurns, settleHistory, type HistoryMsg } from "./voiceTurn.ts";

const said = "Your break-even is 680 members at this rent. Want me to check better locations nearby?";
// the mic hearing the speaker is not an interruption
assert.equal(isEcho("your break even is 680 members", said), true);
assert.equal(isEcho("check better locations", said), true);
// a person saying something new is, even when it shares a word or two
assert.equal(isEcho("what about the rent in Dallas instead", said), false);
assert.equal(isEcho("how much is payroll", said), false);
// common words in a new order are a person, even when every word was in the answer
assert.equal(isEcho("what is the rent", "The rent is what matters. What you pay is the main cost."), false);
// numbers come back as digits, and the mic mishears some words
const spokenMoney = "Your rent of forty thousand dollars takes thirty percent of sales. That leaves very little room.";
assert.equal(isEcho("your rent of 40,000 takes 30% of sales", spokenMoney), true);
assert.equal(isEcho("that leaves very litter room", spokenMoney), true);
assert.equal(isEcho("6000", spokenMoney), true);
assert.equal(isEcho("what about 6000", spokenMoney), false);

assert.equal(isStopWord("Stop."), true);
assert.equal(isStopWord("ruk jao"), true);
assert.equal(isStopWord("stop the gym plan and test a cafe"), false);

const call = (id: string) => ({ id, name: "t", args: "{}" });

// stopped while waiting on a tool: the unanswered call goes, the question stays
let h: HistoryMsg[] = [{ role: "user", content: "q1" }, { role: "assistant", content: "", toolCalls: [call("a")] }];
settleHistory(h);
assert.deepEqual(h, [{ role: "user", content: "q1" }, { role: "assistant", content: INTERRUPTED }]);

// one of two calls answered is still not valid history
h = [{ role: "user", content: "q" }, { role: "assistant", content: "", toolCalls: [call("a"), call("b")] }, { role: "tool", content: "1", toolCallId: "a" }];
settleHistory(h);
assert.equal(h.length, 2);
assert.equal(h[1].content, INTERRUPTED);

// finished tools stay, so the model knows what was already done
h = [{ role: "user", content: "q" }, { role: "assistant", content: "", toolCalls: [call("a")] }, { role: "tool", content: "done", toolCallId: "a" }];
settleHistory(h);
assert.equal(h[2].content, "done");
assert.equal(h[3].content, INTERRUPTED);

// a finished answer needs no note, and earlier answered calls are left alone
h = [{ role: "user", content: "q" }, { role: "assistant", content: "", toolCalls: [call("a")] }, { role: "tool", content: "x", toolCallId: "a" }, { role: "assistant", content: "answer" }];
settleHistory(h);
assert.equal(h.length, 4);

// the window starts on a user turn and fits the limit
const long: HistoryMsg[] = Array.from({ length: 60 }, (_, i) => ({ role: i % 3 === 0 ? "user" : "assistant", content: String(i) }));
const r = recentTurns(long);
assert.equal(r[0].role, "user");
assert.ok(r.length <= 36);
assert.equal(r.at(-1)?.content, "59");

// a long talk full of tools still remembers the first question, and the latest turn keeps its tool results
const talk: HistoryMsg[] = [];
for (let t = 0; t < 12; t++) {
  talk.push(
    { role: "user", content: `q${t}` },
    { role: "assistant", content: "", toolCalls: [call(`c${t}`)] },
    { role: "tool", content: "result", toolCallId: `c${t}` },
    { role: "assistant", content: `a${t}` },
  );
}
const kept = recentTurns(talk);
assert.equal(kept[0].content, "q0");
assert.ok(kept.length <= 36);
assert.equal(kept.filter((m) => m.role === "tool").length, 3);
// every tool result that stays still has its call
for (const m of kept) if (m.role === "tool") assert.ok(kept.some((x) => x.toolCalls?.some((c) => c.id === m.toolCallId)));
console.log("voice turns ok");
