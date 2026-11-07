// The voice bot end to end in a real browser: fake mic, fake AI, real VoiceDock code. Needs NEXT_PUBLIC_VOICE=1.
// node voice.mjs http://localhost:3010
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.argv[2] || "http://localhost:3010";
// 20 seconds of silence, so "still talking" is easy to tell from "was stopped"
const rate = 8000;
const pcm = Buffer.alloc(rate * 2 * 20);
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write("WAVEfmt ", 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
hdr.writeUInt32LE(rate, 24); hdr.writeUInt32LE(rate * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(pcm.length, 40);
const wav = Buffer.concat([hdr, pcm]);

const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const c = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
await c.addCookies([{ name: "siq_session", value: "local", domain: "localhost", path: "/" }]);
await c.addInitScript(() => {
  localStorage.setItem("siq-tour-seen", "1");
  window.__audio = [];
  const A = window.Audio;
  window.Audio = function (u) { const a = new A(u); window.__audio.push(a); return a; };
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    constructor() { window.__rec = this; }
    start() { this.running = true; this.onstart?.(); }
    stop() { this.running = false; this.onend?.(); }
    abort() { this.running = false; this.aborted = (this.aborted || 0) + 1; this.onend?.(); }
  };
  window.__hear = (text, final) => {
    const r = [{ transcript: text }];
    r.isFinal = final;
    window.__rec.onresult({ resultIndex: 0, results: [r] });
  };
});
const agent = [];
let delay = () => 150;
const ANSWER = "Your break-even is 680 members at this rent. Want me to check better locations nearby?";
await c.route("**/api/v1/**", async (r) => {
  const u = new URL(r.request().url()).pathname.replace("/api/v1", "");
  const json = (x, s = 200) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(x) }).catch(() => {});
  if (u === "/assistant/agent") {
    const body = r.request().postDataJSON();
    const q = body.messages.filter((m) => m.role === "user").at(-1).content;
    agent.push({ q, messages: body.messages, done: false });
    await new Promise((res) => setTimeout(res, delay(q)));
    return json({ text: `${ANSWER} (answer to: ${q})`, tool_calls: [] });
  }
  if (u === "/assistant/tts") return r.fulfill({ status: 200, contentType: "audio/wav", body: wav }).catch(() => {});
  if (u === "/auth/me") return json({ id: "u", email: "f@example.com", name: "Founder" });
  if (u === "/system/capabilities") return json({ ai: false, routing: true, model_version: "x" });
  if (u === "/projects") return json([]);
  return json({ detail: "not mocked" }, 404);
});
const p = await c.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + "/app", { waitUntil: "load", timeout: 120000 });
await p.getByRole("button", { name: /Talk to Strata/ }).click({ timeout: 60000 });
await p.waitForFunction(() => window.__rec?.running, null, { timeout: 15000 });
const typed = async (t) => {
  if (!(await p.getByLabel("Type a question").isVisible().catch(() => false))) await p.getByRole('button', { name: 'Toggle keyboard input' }).click();
  await p.getByLabel("Type a question").fill(t);
  await p.getByLabel("Send").click();
};
const playing = () => p.evaluate(() => window.__audio.filter((a) => !a.paused && !a.ended).length);
const waitPlaying = () => p.waitForFunction(() => window.__audio.some((a) => !a.paused && !a.ended), null, { timeout: 15000 });
const text = () => p.getByRole("dialog", { name: /Strata/ }).innerText();
let pass = 0;
const ok = (name) => { pass++; console.log("  ok  ", name); };

// 1. a typed message while talking cuts the voice and carries the context
await typed("what is my break even");
await waitPlaying();
const n1 = agent.length;
await typed("what about in Dallas");
await p.waitForFunction((n) => window.__audio.length > 0, 0);
await p.waitForTimeout(600);
assert.equal(agent.length, n1 + 1);
const sent = agent.at(-1).messages.map((m) => m.content).join(" | ");
assert.ok(sent.includes("what is my break even"), "earlier question kept");
assert.ok(sent.includes("answer to: what is my break even"), "earlier answer kept");
await waitPlaying();
assert.equal(await playing(), 1, "only the new answer plays");
ok("new typed message stops the voice, and the next request has the earlier talk");

// 2. a new message while thinking drops the old answer completely
delay = (q) => (q === "slow question" ? 2500 : 150);
await typed("slow question");
await p.waitForTimeout(300);
await typed("quick question");
await p.waitForTimeout(3200);
const shown = await text();
assert.ok(!shown.includes("answer to: slow question"), "old answer never appears");
assert.ok(shown.includes("answer to: quick question"));
const notes = agent.at(-1).messages.map((m) => m.content);
assert.ok(notes.some((m) => m.startsWith("(Stopped here")), "the model is told it was stopped");
assert.ok(notes.includes("slow question"), "the stopped question is still remembered");
ok("a message while thinking replaces the old one, which never shows, but stays in memory");

// 3. the mic stays open during speech, and our own voice is not an interruption
await waitPlaying();
const n3 = agent.length;
assert.equal(await p.evaluate(() => window.__rec.running), true, "mic open while talking");
await p.evaluate(() => window.__hear("your break even is 680 members", false));
await p.evaluate(() => window.__hear("your break even is 680 members at this rent", true));
await p.waitForTimeout(1200);
assert.equal(await playing(), 1, "still talking");
assert.equal(agent.length, n3, "echo is not sent");
ok("its own voice coming back through the mic is ignored");

// 4. a person talking over it: silence right away, on the words so far
await p.evaluate(() => window.__hear("what about", false));
await p.waitForFunction(() => !window.__audio.some((a) => !a.paused && !a.ended), null, { timeout: 500 });
ok("speaking over it stops the voice before the sentence is finished");
await p.evaluate(() => window.__hear("what about the rent in Austin", true));
await p.waitForTimeout(1000);
assert.equal(agent.at(-1).q, "what about the rent in Austin");
ok("then answers what was said");

// 5. a pause mid-thought stays one message
await waitPlaying();
const n5 = agent.length;
await p.evaluate(() => window.__hear("and what happens if", true));
await p.waitForTimeout(250);
await p.evaluate(() => window.__hear("payroll goes up", true));
await p.waitForTimeout(1200);
assert.equal(agent.length, n5 + 1);
assert.equal(agent.at(-1).q, "and what happens if payroll goes up");
ok("a short pause in a sentence does not split it into two messages");

// 6. "stop" means quiet, not a question
await waitPlaying();
const n6 = agent.length;
await p.evaluate(() => window.__hear("stop", true));
await p.waitForTimeout(1000);
assert.equal(await playing(), 0);
assert.equal(agent.length, n6);
assert.equal(await p.evaluate(() => window.__rec.running), true, "still listening");
ok('"stop" goes quiet, sends nothing and keeps listening');

// 7. and the conversation still continues with everything before it
await typed("so what should I do");
await p.waitForTimeout(800);
const last = agent.at(-1).messages.map((m) => m.content).join(" | ");
for (const q of ["what is my break even", "what about in Dallas", "quick question", "payroll goes up"]) assert.ok(last.includes(q), `remembers: ${q}`);
ok("after all of that, it still remembers the whole conversation");

// 8. closing it stops everything
await waitPlaying();
await p.getByRole("button", { name: /Stop voice analyst/ }).click();
await p.waitForTimeout(500);
assert.equal(await playing(), 0);
ok("stopping the voice analyst silences it");
console.log(`${pass} passed; page errors: ${errs.join(" | ") || "none"}`);
await b.close();
