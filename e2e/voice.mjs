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
let brokenHistory = 0;
const failNext = new Set();
let ttsDown = false;
let slowFacts = 0;
let factsHits = 0;
let factsDone = 0;
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
    const bad = body.messages.find((m, i) => m.role === "assistant" && m.toolCalls?.some((c) => !body.messages.slice(i + 1).some((x) => x.toolCallId === c.id)));
    if (bad) brokenHistory++;
    if (body.messages[0].role !== "user") brokenHistory++;
    if (failNext.has(q)) { failNext.delete(q); return json({ detail: "brain down" }, 502); }
    const lastMsg = body.messages.at(-1);
    if (q === "use a slow tool" && lastMsg.role === "user") return json({ text: "", tool_calls: [{ id: "c1", name: "get_market_facts", args: "{}" }] });
    return json({ text: `${ANSWER} (answer to: ${q})`, tool_calls: [] });
  }
  if (u === "/assistant/tts" && ttsDown) return json({ detail: "down" }, 503);
  if (u === "/projects/11111111-1111-4111-8111-111111111111") return json({ id: "11111111-1111-4111-8111-111111111111", name: "Gym", objective: "start_new", decision_goal: "profit", status: "active", is_demo: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), category: { key: "gym", label: "Gym", method: "taxonomy", filters: ["gym"] }, profile: {}, archetype: { key: "membership", label: "Membership", unit: "members", unit_label: "members", price_label: "Price" }, locations: [{ id: "l1", label: "South Lamar", address: "1402 South Lamar, Austin, TX", lat: 30.25, lng: -97.76, catchment: { radius_km: 3 } }], scenarios: [], snapshots: {}, field: { records: 0, status: null }, summary: null, data_kinds: {} });
  if (u === "/projects/11111111-1111-4111-8111-111111111111/assistant/facts") { const counts = u.endsWith("facts"); if (counts) factsHits++; await new Promise((res) => setTimeout(res, slowFacts)); if (counts) factsDone++; return json({ id: "11111111-1111-4111-8111-111111111111", name: "Gym", facts: {} }); }
  if (u.endsWith("/assistant/ask")) return json({ answer: "Fallback answer from the backend.", actions: [] });
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
// 9. cut off while a tool is running: the late result must not corrupt the next request
await p.goto(BASE + "/app/projects/11111111-1111-4111-8111-111111111111", { waitUntil: "load", timeout: 120000 });
await p.getByRole("button", { name: /Talk to Strata/ }).click({ timeout: 60000 });
await p.waitForFunction(() => window.__rec?.running, null, { timeout: 15000 });
slowFacts = 3000;
await typed("use a slow tool");
for (let i = 0; i < 40 && !factsHits; i++) await p.waitForTimeout(100);
assert.ok(factsHits > 0, "the slow tool really was running");
const stillRunning = factsDone < factsHits;
assert.ok(stillRunning, "and had not finished when the new message came");
await typed("forget that, next question");
await p.waitForTimeout(3500);
assert.equal(factsDone, factsHits, "then it finished, late");
slowFacts = 0;
await typed("and after that");
await p.waitForTimeout(800);
assert.equal(brokenHistory, 0, "no request carried an unanswered tool call");
const after = agent.at(-1).messages.map((m) => m.content).join(" | ");
assert.ok(after.includes("use a slow tool") && after.includes("forget that, next question"));
ok("cut off during a tool, the late result stays out and the next request is valid");

// 10. the AI brain failing must not wipe the conversation
await waitPlaying();
failNext.add("brain fails on this");
await typed("brain fails on this");
await p.waitForTimeout(1200);
assert.ok((await text()).includes("Fallback answer from the backend."));
await typed("are you back");
await p.waitForTimeout(800);
assert.ok(agent.at(-1).messages.map((m) => m.content).join(" | ").includes("forget that, next question"), "memory survives an error");
assert.equal(brokenHistory, 0);
ok("an AI error falls back to the backend answer and keeps the memory");

// 11. with the natural voice down, the browser voice can be cut off too
ttsDown = true;
await typed("first with browser voice");
await p.waitForTimeout(1500);
await typed("second with browser voice");
await p.waitForTimeout(1000);
assert.ok((await text()).includes("answer to: second with browser voice"));
ttsDown = false;
ok("the fallback browser voice can be interrupted as well");

// 12. "stop" while it is still thinking cancels the answer
delay = () => 1500;
await typed("slow thinking question");
await p.waitForTimeout(200);
await p.evaluate(() => window.__hear("stop", true));
await p.waitForTimeout(2200);
assert.ok(!(await text()).includes("answer to: slow thinking question"));
delay = () => 150;
ok('"stop" while thinking cancels the answer');

console.log(`${pass} passed; page errors: ${errs.join(" | ") || "none"}`);
await b.close();
