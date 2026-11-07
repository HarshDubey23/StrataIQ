/**
 * Offline command router for Strata (used when the realtime ElevenLabs agent is not connected).
 * It understands Hinglish / English commands, runs the SAME client tools the realtime agent uses and speaks the
 * result in Hinglish. Every number in a reply comes from a tool result (simulation, live data, the page itself).
 * Returns null when it doesn't recognise the request, so the caller can fall back to the backend fact router.
 */
import { distance, US_MARKET } from "@/lib/format";
import { readPage } from "@/lib/screen";

type Tool = (args?: never) => Promise<string>;
export type Tools = Record<string, Tool>;

// ---------------------------------------------------------------- numbers
const UNIT: [RegExp, number][] = [
  [/^(crore|cr)$/i, 1e7],
  [/^(lakh|lac|lakhs|l)$/i, 1e5],
  [/^(k|thousand|hazaar|hazar|hajar|hazaar)$/i, 1e3],
];
const AMOUNT = /(?:₹|rs\.?|inr|rupees?)?\s*(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(crore|cr|lakhs?|lac|l|k|thousand|hazaar|hazar|hajar)?\b/gi;

/** Every amount in the text with its position: "80 hazaar" → 80000, "1.2 lakh" → 120000, "₹2,500" → 2500. */
export function amounts(q: string): { v: number; at: number }[] {
  const out: { v: number; at: number }[] = [];
  for (const m of q.matchAll(AMOUNT)) {
    let v = Number(m[1].replace(/,/g, ""));
    const u = m[2] && UNIT.find(([re]) => re.test(m[2]!));
    if (u) v *= u[1];
    if (Number.isFinite(v)) out.push({ v, at: m.index ?? 0 });
  }
  return out;
}

const FIELDS: [string, RegExp, string][] = [
  ["rent", /\b(rent|kiraya|kiraaya|bhada|bhaada)\b/i, "rent"],
  ["payroll", /\b(salary|salaries|payroll|tankhwah|tankha|wages|staff (cost|kharcha))\b/i, "salary"],
  ["marketing_spend", /\b(marketing|ads?|advertis\w*|promotion|prachar)\b/i, "marketing"],
  ["utilities", /\b(bijli|electricity|utilities|utility|light bill)\b/i, "bijli-paani"],
  ["startup_cost", /\b(startup|start-up|setup|investment|budget|lagat)\b/i, "startup cost"],
  ["variable_cost_per_unit", /\b(variable cost|cost per (unit|cup|plate|order|item)|raw material)\b/i, "per-unit cost"],
  ["price", /\b(price|fees?|daam|dam|keemat|kimat|charge|rate|mrp)\b/i, "price"],
];

/** Plan fields mentioned with an amount next to them: "rent 80 hazaar aur price 300" → {rent: 80000, price: 300}. */
export function planChanges(q: string): Record<string, number> {
  const nums = amounts(q);
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const [key, re] of FIELDS) {
    const m = re.exec(q);
    if (!m) continue;
    const end = m.index + m[0].length;
    // prefer the first amount after the word, else the closest one before it
    const after = nums.find((n) => n.at >= end && n.at - end < 40 && !used.has(n.at));
    const before = [...nums].reverse().find((n) => n.at < m.index && m.index - n.at < 25 && !used.has(n.at));
    const hit = after || before;
    if (hit && hit.v > 0) {
      out[key] = hit.v;
      used.add(hit.at);
    }
  }
  return out;
}

// ---------------------------------------------------------------- formatting (Indian style)
export function inr(x: unknown): string {
  const v = Number(x);
  if (US_MARKET) {
    if (x === null || x === undefined || !Number.isFinite(v)) return "unknown";
    return `${v < 0 ? "a loss of " : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
  }
  if (x === null || x === undefined || !Number.isFinite(v)) return "unknown";
  const a = Math.abs(v);
  const s = a >= 1e7 ? `₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)} crore` : a >= 1e5 ? `₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)} lakh` : `₹${Math.round(a).toLocaleString("en-IN")}`;
  return v < 0 ? `a loss of ${s}` : s;
}
/** "₹40,000 profit har mahine" or "₹12,000 ka loss har mahine" */
const pm = (x: unknown) => (Number(x) < 0 ? `${inr(x)} a month` : `${inr(x)} profit a month`);
const num = (x: unknown) => (Number.isFinite(Number(x)) ? Math.round(Number(x)).toLocaleString(US_MARKET ? "en-US" : "en-IN") : "?");
const pct = (x: unknown) => (Number.isFinite(Number(x)) ? `${Math.round(Number(x) * 100)}%` : "?");
const parse = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return { text: s };
  }
};
const label = (k: string) => FIELDS.find(([f]) => f === k)?.[2] || k;

const PAGE_WORDS: [string, RegExp, string][] = [
  ["market", /\b(market map|map|naksha|competitors? map|3d)\b/i, "Market map"],
  ["field", /\b(field( data| research| page)?|ground data|researcher page)\b/i, "Field data"],
  ["live", /\b(live( market)?|agents?|log kaise chun)\b/i, "Live market"],
  ["simulation", /\b(simulation( lab)?|lab|scenario|what.?if page)\b/i, "Simulation lab"],
  ["decisions", /\b(decisions?|verdict|faisla|go.?no.?go)\b/i, "Decisions"],
  ["report", /\b(report|pdf)\b/i, "Report"],
  ["genome", /\b(dna|genome)\b/i, "Market DNA"],
  ["factors", /\b(factors?|615)\b/i, "615 factors"],
  ["monitor", /\b(monitor\w*|actuals)\b/i, "Monitoring"],
  ["overview", /\b(overview|project (home|page)|summary page)\b/i, "Overview"],
  ["dashboard", /\b(dashboard|all projects|projects page)\b/i, "Dashboard"],
  ["new_project", /\b(new (project|analysis)|naya project)\b/i, "New analysis"],
  ["methodology", /\b(methodology|method)\b/i, "Methodology"],
  ["settings", /\b(settings?)\b/i, "Settings"],
  ["home", /\b(home ?page|landing)\b/i, "Home"],
];
const PAGE_NAME: Record<string, string> = { market: "Market map", field: "Field data", live: "Live market", simulation: "Simulation lab", decisions: "Decisions", report: "Report",
  genome: "Market DNA", factors: "615 factors", monitor: "Monitoring" };

const OPEN = /\b(open|kholo|khol do|khol|dikhao|dikha do|le chalo|chalo|jao|go to|show|take me)\b/i;
const TRY = /\b(try|test|dekho|dekh|check|what if|kya hoga|simulate karke|karke dekho)\b/i;

function pageNameFromPath(p: string) {
  const seg = p.split("/").filter(Boolean);
  if (seg[0] !== "app") return p === "/" ? "home page" : p.replace("/", "");
  if (seg.length === 1) return "your dashboard";
  if (seg[1] === "projects" && seg[2] === "new") return "new analysis form";
  if (seg[1] === "projects") return PAGE_NAME[seg[3] || ""] || "project overview";
  return seg[1];
}

/** What is on the page, in two or three spoken sentences. */
function describePage(): string {
  const pg = readPage();
  if (!pg) return "I could not read the screen.";
  const name = pageNameFromPath(pg.path);
  const heads = pg.headings.filter((h) => h.length < 80).slice(0, 4);
  const n = (pg.numbers || {}) as Record<string, unknown>;
  const facts: string[] = [];
  if (n.day !== undefined) facts.push(`simulation day ${num(n.day)}`);
  if (n.orders_today !== undefined) facts.push(`${num(n.orders_today)} orders today`);
  if (n.competitors !== undefined) facts.push(`${num(n.competitors)} competitors on the map`);
  if (n.profit_per_month !== undefined) facts.push(pm(n.profit_per_month));
  // a few short lines that carry money or percentages: the figures a person would read first
  const keyLines = pg.visible_text.split("\n").map((l) => l.trim())
    .filter((l) => l.length > 3 && l.length < 70 && /\$|₹|%|\blakh\b|\bcrore\b/i.test(l)).slice(0, 3);
  let s = `You are on ${name}.`;
  if (heads.length) s += ` It shows ${heads.join("; ")}.`;
  if (facts.length) s += ` Numbers: ${facts.join(", ")}.`;
  else if (keyLines.length) s += ` Key numbers: ${keyLines.join("; ")}.`;
  return s;
}

function runSentence(o: Record<string, unknown>): string {
  const a = o.after as Record<string, number> | null;
  const b = o.before as Record<string, number> | null;
  if (!a) return "";
  const unit = (a as unknown as { unit?: string }).unit || "customers";
  let s = ` Now ${pm(a.profit_per_month)}`;
  if (b && b.profit_per_month !== undefined) s += ` (was ${pm(b.profit_per_month)})`;
  s += `, about ${num(a.units_per_month)} ${unit} a month`;
  if (a.break_even_units) s += `, break-even at ${num(a.break_even_units)} ${unit}`;
  if (a.chance_of_loss !== undefined && a.chance_of_loss !== null) s += `, and a ${pct(a.chance_of_loss)} chance of a losing month`;
  return s + ".";
}

// the last strategy we suggested, so "ye test karo" knows what "ye" is
let lastSuggestion: Record<string, number> | null = null;

/** Try to handle the request locally. `say` speaks an interim line for slow tools. */
export async function route(qRaw: string, t: Tools, ctx: { projectOpen: boolean; say: (s: string) => void }): Promise<string | null> {
  const q = qRaw.trim();
  const call = async (name: string, args?: Record<string, unknown>) => parse(await (t[name] as (a?: Record<string, unknown>) => Promise<string>)(args));
  const needProject = "Open a project first. Say 'show my projects', or tell me your idea, like 'I want to open a cafe in South Austin'.";

  // 1. a new business idea
  if (/\b(kholna|kholni|kholunga|start karna|shuru karna|open karna|i want to (open|start)|want to start|planning to open)\b/i.test(q) && !/\bproject\b/i.test(q)) {
    ctx.say("Okay, creating the project and finding the live market.");
    const o = await call("start_new_idea", { description: q });
    return o.created
      ? `Project created: ${o.business}${o.place ? `, ${String(o.place).split(",").slice(0, 2).join(",")}` : ""}. Live competitors and population are loading on the market map, and the first simulation will run on its own in about a minute.`
      : "I did not catch the place, so I opened the form. Just pick the address.";
  }

  // 2. change the plan (permanent) or test a what-if
  const changes = planChanges(q);
  if (Object.keys(changes).length) {
    if (!ctx.projectOpen) return needProject;
    const what = Object.entries(changes).map(([k, v]) => `${label(k)} ${inr(v)}`).join(", ");
    if (TRY.test(q) && !/\b(kar do|kardo|set|save|update)\b/i.test(q)) {
      ctx.say(`Running a simulation with ${what}.`);
      if (Object.keys(changes).length === 1 && changes.price) {
        const o = await call("test_price", { price: changes.price });
        if (o.error) return `The simulation could not run: ${o.error}`;
        const w = (o.what_if || {}) as Record<string, number>;
        const b = (o.baseline || {}) as Record<string, number>;
        return `At a price of ${inr(changes.price)}: ${pm(w.operating_profit_per_month)}, compared with ${pm(b.operating_profit_per_month)} now. ` +
          `Customers ${num(w.customers_or_units_per_month)} vs ${num(b.customers_or_units_per_month)}` +
          (w.probability_of_loss != null ? `, ${pct(w.probability_of_loss)} chance of a loss` : "") +
          `. This was only a test, so your plan has not changed. To save it, say 'set price to ${num(changes.price)}'.`;
      }
      const o = await call("test_strategy", changes);
      if (o.error) return `The simulation could not run: ${o.error}`;
      return `I ran the plan with ${what} on the live map. ${o.spoken || ""}`.trim();
    }
    ctx.say(`Setting ${what} and running the simulation again.`);
    const o = await call("update_plan", changes);
    if (o.error) return `The plan could not be updated: ${o.error}`;
    return `Set ${what} and ran the simulation again.${runSentence(o)}`;
  }

  // 2b. run the strategy we just suggested
  if (lastSuggestion && /\b(ye|yeh|isko|isse|wo|woh|this|it|that|suggestion)\b.*\b(test|try|chalao|apply|lagao|run)\b|\b(test|try|apply|run|chalao)\s+(it|this|that|ye|yeh|karo)\b|^(haan|ha|yes|ok|okay)\b.*\b(test|karo|chalao)\b/i.test(q)) {
    if (!ctx.projectOpen) return needProject;
    ctx.say("Okay, running this plan with 10,000 simulated customers.");
    const o = await call("test_strategy", lastSuggestion);
    if (o.error) return `The simulation could not run: ${o.error}`;
    return `It is running on the live map. ${o.spoken || ""}`.trim();
  }

  // 3. report
  if (/\b(report|pdf)\b/i.test(q) && /\b(bana|banao|bana do|make|create|generate|naya|nayi|chahiye)\b/i.test(q)) {
    if (!ctx.projectOpen) return needProject;
    ctx.say("Building your report.");
    const o = await call("make_report");
    return o.error ? `The report could not be built: ${o.error}` : "Your report is ready and open. You can print or share it from there.";
  }

  // 4. best location
  if (/\b(best|sabse (acchi|achhi|badhiya)|better|ideal|top|right)\s+(location|locatin|locaton|site|jagah|spot|area|place)\b|kahan khol|konsi jagah|kaun si jagah|where should i open|location (batao|dikhao|suggest)/i.test(q)) {
    if (!ctx.projectOpen) return needProject;
    ctx.say("Testing your plan across the area.");
    const o = await call("find_best_location");
    if (o.error) return `The location search could not finish: ${o.error}`;
    const cur = o.current_site || {};
    const best = (o.best_sites || [])[0];
    if (!best) return "I did not find another spot in this area worth comparing.";
    if (Number(best.profit_per_month) <= Number(cur.profit_per_month))
      return `Your current site is the best in this area: ${pm(cur.profit_per_month)}. The next best spot makes ${pm(best.profit_per_month)}.`;
    // both still losing: moving alone won't fix it, say so
    const stillLoss = Number(best.profit_per_month) < 0
      ? " That spot still loses money, so moving alone will not fix this. Rent, price or size has to change too. Say 'how do I raise profit' and I will find the best combination."
      : "";
    return `The best spot is ${distance(best.from_current_km)} from your site. The same plan there makes ${pm(best.profit_per_month)}, compared with ${pm(cur.profit_per_month)} now. ` +
      `It has ${num(best.people_within_1km)} people within ${distance(1)} and ${num(best.competitors_within_500m)} competitors within ${distance(0.5)}. I marked it on the map. This assumes the same rent, so check the local rent there.${stillLoss}`;
  }

  // 5. best strategy / how to increase profit
  if (/\b(best|optimal|sabse (zyada|jyada|accha))\s+(strategy|price|plan|pricing)|optimi[sz]e|maximi[sz]e|profit (kaise|kese) badh|zyada profit|munafa (kaise|badh)/i.test(q)) {
    if (!ctx.projectOpen) return needProject;
    ctx.say("Testing hundreds of combinations of price, marketing and capacity.");
    const o = await call("optimize_strategy");
    if (o.error) return `The plan search could not run: ${o.error}`;
    const b = o.best || {};
    const c = o.current || {};
    lastSuggestion = Object.fromEntries(
      (["price", "marketing_spend", "capacity_scale"] as const).filter((k) => b[k] !== undefined && b[k] !== c[k]).map((k) => [k, Number(b[k])]),
    );
    if (!Object.keys(lastSuggestion).length) lastSuggestion = null;
    return `The most profitable of ${num(o.combinations_tested)} combinations: price ${inr(b.price)}, marketing ${inr(b.marketing_spend)} a month` +
      (b.capacity_scale && b.capacity_scale !== 1 ? `, ${Math.round((b.capacity_scale - 1) * 100)}% more capacity` : "") +
      `. That makes ${pm(b.profit_per_month)}, compared with ${pm(c.profit_per_month)} now. Say 'test it' and I will check it with 10,000 simulated customers.`;
  }

  // 6. analysis / insights
  if (/\b(analy[sz]\w*|insight|suggest\w*|advice|sujhav|kya galat|problem|improve|kaise badhe|kya karu|what should i (do|change))\b/i.test(q)) {
    if (!ctx.projectOpen) return needProject;
    const o = await call("get_insights");
    if (o.error) return `The analysis could not run: ${o.error}. Run the simulation first by saying 'load the data'.`;
    return String(o.spoken || o.summary || o.text || "I found no insights for this run.");
  }

  // 7. what is on screen
  if (/\b(screen|is page|ye page|yeh page|yahan|yaha)\b|kya dikh|what (am i|are we|is) (looking|seeing|on)|what do you see|explain (this|the page)|samjhao ye/i.test(q)) {
    return describePage();
  }

  // 8. field research
  if (/\b(researcher|field (research|visit|data)|ground (data|reality)|survey|banda bhejo|koi bhejo)\b/i.test(q)) {
    if (!ctx.projectOpen) return needProject;
    if (/\b(status|kitne|kya hua|progress|update)\b/i.test(q)) {
      const o = await call("get_field_status");
      const c = (o.summary?.counts || {}) as Record<string, number>;
      return o.request ? `Field research is underway: ${num(c.interview || 0)} interviews, ${num(c.competitor || 0)} competitor visits, ${num(c.footfall || 0)} foot traffic counts and ${num(c.rent || 0)} rent quotes saved.`
        : "No field researcher has been requested yet. Say 'request a researcher'.";
    }
    const o = await call("request_field_researcher", { brief: q });
    return o.error ? `The request could not be made: ${o.error}` : `${o.specialty} requested. I opened the Field data page. Send its link to your researcher, who can enter interviews, rival prices, foot traffic and rent by phone.`;
  }

  // 9. load live data and run
  if (/\b(load|refresh|reload|update)\b.*\b(data|market)\b|\bdata load\b|simulation chalao|run (the )?simulation|baseline chalao/i.test(q)) {
    if (!ctx.projectOpen) return needProject;
    ctx.say("Loading live market data. This can take a minute or two.");
    const o = await call("load_market_and_simulate");
    if (o.error) return `The data could not load: ${o.error}`;
    if (o.status === "still_loading") return "The data is still loading in the background. Ask me again shortly.";
    if (o.status === "failed") return "Live data could not load right now. The map service may be busy, so try again shortly.";
    const s = o.simulation || {};
    return `The data is in and the simulation has run: about ${num(s.units_per_month)} ${s.unit || "customers"} a month, ${pm(s.profit_per_month)}${s.chance_of_loss !== undefined ? `, ${pct(s.chance_of_loss)} chance of a loss` : ""}.`;
  }

  // 10. projects
  if (/\b(mere|my|saare|all)\s+projects?\b|projects? (dikhao|list|batao)/i.test(q)) {
    const o = await call("list_projects");
    if (!Array.isArray(o)) return "Sign in to see your projects.";
    if (!o.length) return "You have no projects yet. Tell me your idea and I will create one.";
    await call("navigate", { page: "dashboard" });
    return `You have ${o.length} projects: ${o.slice(0, 5).map((p: { name: string }) => p.name).join(", ")}. Which one should I open?`;
  }
  const projName = q.match(/^(.+?)\s+(wala\s+)?project\s+(kholo|khol do|open)/i) || q.match(/\bopen\s+(the\s+)?(.+?)\s+project\b/i);
  if (projName) {
    const name = (projName[2] && projName[2] !== "the " ? projName[2] : projName[1]).trim();
    const o = await call("open_project", { name });
    return o.opened ? `Opened ${o.opened}.` : `I could not find a project called "${name}". Your projects: ${(o.projects || []).slice(0, 5).join(", ")}.`;
  }

  // 11. demo, guide, goal
  if (/\bdemo\b/i.test(q)) {
    ctx.say("Opening the live demo.");
    return String((await (t.start_demo as () => Promise<string>)()) || "The demo is open.");
  }
  if (/\b(guide|tour|how it works|kaise (use|chalaye|chalate)|walk me through)\b/i.test(q)) {
    await call("open_guide");
    return "I opened the How it works guide. It explains the app in five steps.";
  }
  if (/\b(risk kam|low risk|safe (rehna|chahiye))\b/i.test(q)) {
    await call("set_goal", { goal: "low_risk" });
    return "Okay, recommendations will now favor the lowest risk.";
  }

  // 12. navigation
  if (OPEN.test(q)) {
    const hit = PAGE_WORDS.find(([, re]) => re.test(q));
    if (hit) {
      const [page, , name] = hit;
      const projectPage = !["dashboard", "new_project", "methodology", "settings", "home"].includes(page);
      if (projectPage && !ctx.projectOpen) return needProject;
      await call("navigate", { page });
      await new Promise((r) => setTimeout(r, 1800)); // let the new page render before reading it
      return `Opened ${name}. ${describePage()}`;
    }
  }

  // 13. a word's meaning
  const term = q.match(/^(?:what is|what's|explain)\s+(.+?)\??$/i) || q.match(/^(.+?)\s+(?:kya hota hai|kya hai|ka matlab|means|meaning)\??$/i);
  if (term && term[1].split(" ").length <= 4) {
    const o = await call("explain_term", { term: term[1] });
    if (o.meaning) return `${o.term}: ${o.meaning}`;
  }

  return null;
}
