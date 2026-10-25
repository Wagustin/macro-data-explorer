// Shared LLM call for the daily jobs: NVIDIA NIM models that answered fast in the probe of
// 25-Oct-2026, then Google Gemini (2.5/2.0 flash first) as fallback. Returns parsed JSON or null.
// Env: NVIDIA_API_KEY, GEMINI_API_KEY (either is enough).
const NIM = ["nvidia/nemotron-3-ultra-550b-a55b", "minimaxai/minimax-m3.1-flash", "openai/gpt-oss-20b", "z-ai/glm-5.3"];
const GEMINI_FIRST = ["models/gemini-2.5-flash", "models/gemini-2.5-flash-lite", "models/gemini-2.0-flash", "models/gemini-2.0-flash-lite"];

function parseJson(text) {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = t.indexOf("{");
  if (start < 0) throw new Error(`respuesta sin JSON: ${t.slice(0, 120).replace(/\s+/g, " ")}`);
  return JSON.parse(t.slice(start, t.lastIndexOf("}") + 1));
}

export async function askJSON(prompt, { budgetMs = 5 * 60 * 1000, maxTokens = 4000 } = {}) {
  const deadline = Date.now() + budgetMs;
  const nimKey = process.env.NVIDIA_API_KEY;
  if (nimKey) {
    for (const model of NIM) {
      const left = deadline - Date.now();
      if (left < 20000) break;
      try {
        const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${nimKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model, temperature: 0.2, max_tokens: maxTokens, thinking: { type: "disabled" },
            chat_template_kwargs: { thinking: false, enable_thinking: false },
            messages: [{ role: "system", content: "Respondes solo con el JSON pedido, sin análisis previo ni texto adicional." }, { role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(Math.min(150000, left)),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const msg = (await r.json()).choices?.[0]?.message || {};
        const out = parseJson(msg.content || msg.reasoning_content);
        return { model, out };
      } catch (e) {
        console.error(`NIM ${model}: ${e.message}`);
      }
    }
  }
  const gKey = process.env.GEMINI_API_KEY;
  if (gKey) {
    let names = GEMINI_FIRST;
    try {
      const list = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${gKey}`, { signal: AbortSignal.timeout(15000) })).json();
      const ok = new Set((list.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name));
      names = GEMINI_FIRST.filter((n) => ok.has(n)).concat([...ok].filter((n) => /flash/.test(n) && !GEMINI_FIRST.includes(n) && !/image|tts|audio|live|embedding/i.test(n)));
    } catch (e) {}
    for (const model of names.slice(0, 6)) {
      const left = deadline - Date.now();
      if (left < 15000) break;
      try {
        const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${gKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
          signal: AbortSignal.timeout(Math.min(90000, left)),
        });
        if (!g.ok) throw new Error(`HTTP ${g.status}`);
        const text = (await g.json()).candidates?.[0]?.content?.parts?.map((x) => x.text).join("") || "";
        return { model: `Gemini ${model}`, out: parseJson(text) };
      } catch (e) {
        console.error(`Gemini ${model}: ${e.message}`);
      }
    }
  }
  return null;
}

// Drops sentences whose numbers do not appear in the source text (days of the month excepted)
export function grounded(text, sourceText) {
  const known = new Set((String(sourceText).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", ".")));
  return String(text || "").split(/(?<=[.!?])\s+/).filter((sentence) => {
    const nums = (sentence.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."));
    return nums.every((n) => known.has(n) || known.has(String(Number(n))) || Number(n) < 32);
  }).join(" ");
}
