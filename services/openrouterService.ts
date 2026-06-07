import { Scene, Language } from "../types";

// ---------------------------------------------------------------------------
// OpenRouter base helper
// ---------------------------------------------------------------------------
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const getApiKey = (): string =>
  (window as any).__OPENROUTER_API_KEY__ ||
  process.env.OPENROUTER_API_KEY ||
  '';

const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getApiKey()}`,
  "HTTP-Referer": window.location.origin,
  "X-Title": "VibeSketch AI",
});

// Text model (cheap + fast)
const TEXT_MODEL = "google/gemini-flash-1.5";
// Stronger model for script generation
const SCRIPT_MODEL = "google/gemini-pro-1.5";
// Image generation (OpenRouter supports Together/fal image models)
const IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------
const withRetry = async <T>(
  fn: () => Promise<T>,
  retries = 5,
  delay = 5000
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const status = error.status || (error?.error?.code);
    const message = error.message || "";
    const isRetryable =
      status === 429 ||
      status === 503 ||
      message.includes("429") ||
      message.includes("503") ||
      message.toLowerCase().includes("overloaded") ||
      message.toLowerCase().includes("unavailable");

    if (retries > 0 && isRetryable) {
      console.warn(
        `OpenRouter busy (${status}). Retrying in ${delay / 1000}s... (${retries} retries left)`
      );
      await new Promise((r) => setTimeout(r, delay));
      return withRetry(fn, retries - 1, delay * 1.5 + Math.random() * 1000);
    }
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Language config
// ---------------------------------------------------------------------------
const LANGUAGE_CONFIG: Record<
  Language,
  { role: string; formulas: string; scriptRules: string; visualText: string; voiceName: string }
> = {
  Vietnamese: {
    role: "viral YouTube strategist for the Vietnamese market",
    formulas: `
      1. Extreme Transformation: [Hành động] + [Đối tượng] + [Trạng thái: LẠNH LÙNG / BẤT KHẢ CHIẾN BẠI]
      2. Cruel Truth: Tại sao bạn mãi [Thất bại/Nghèo khó] dù đã [Cố gắng]?
      3. Wake-up Call: [Làm ngay đi] nếu không muốn [Hậu quả đáng sợ].`,
    scriptRules: "Tone: Street-smart, engaging, uses Vietnamese internet slang if appropriate, distinctively Vietnamese perspective.",
    visualText: "Text inside image must be Vietnamese.",
    voiceName: "Kore",
  },
  English: {
    role: "viral YouTube strategist for the US/Global market",
    formulas: `
      1. Extreme Transformation: How I became [Unstoppable/Stoic] by doing [Simple Action].
      2. The Harsh Truth: Why you are still [Broke/Unhappy] despite [Hard Work].
      3. The Warning: Stop doing [Action] immediately (Here is why).`,
    scriptRules: "Tone: Punchy, idiomatic English, direct, 'Better Than Yesterday' or 'Kurzgesagt' style.",
    visualText: "Text inside image must be English.",
    voiceName: "Puck",
  },
  Japanese: {
    role: "viral YouTube strategist for the Japanese market",
    formulas: `
      1. Extreme Transformation: [Action] shite, [Status] ni naru houhou. Use strong kanji.
      2. Cruel Truth: Nazebito wa [Fail] suru no ka?
      3. Wake-up Call: [Action] yamenasai. Zettai ni.`,
    scriptRules: "Tone: High-context, engaging, manga-style storytelling (Ki-Sho-Ten-Ketsu).",
    visualText: "Text inside image must be Japanese (Kanji/Kana).",
    voiceName: "Kore",
  },
};

// ---------------------------------------------------------------------------
// Chat completion helper
// ---------------------------------------------------------------------------
async function chatComplete(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e: any = new Error(err?.error?.message || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  });
}

// ---------------------------------------------------------------------------
// Image generation helper (OpenRouter image endpoint)
// ---------------------------------------------------------------------------
async function generateImage(prompt: string): Promise<string | undefined> {
  return withRetry(async () => {
    const res = await fetch(`${OPENROUTER_BASE}/images/generations`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e: any = new Error(err?.error?.message || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : undefined;
  });
}

// ---------------------------------------------------------------------------
// Safe JSON parse (strips markdown fences)
// ---------------------------------------------------------------------------
function safeParseJSON<T>(raw: string): T | null {
  try {
    return JSON.parse(raw);
  } catch {
    const stripped = raw.replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(stripped);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — mirrors old geminiService.ts exports
// ---------------------------------------------------------------------------

export const generateViralTitles = async (
  topic: string,
  tone: string,
  language: Language
): Promise<string[]> => {
  const cfg = LANGUAGE_CONFIG[language];
  const system = `Act as a ${cfg.role}. You always respond with valid JSON only, no markdown.`;
  const user = `
Generate 5 viral YouTube titles in ${language} based on the keyword: "${topic}".
Tone: ${tone}.
Use strictly one of the following 3 formulas adapted for ${language} culture:
${cfg.formulas}

Capitalize POWER WORDS. Return ONLY a JSON array of strings like: ["title1","title2","title3","title4","title5"]
`;

  try {
    const raw = await chatComplete(TEXT_MODEL, system, user);
    return safeParseJSON<string[]>(raw) ?? ["Error generating titles. Please try again."];
  } catch (e) {
    console.error("Error generating titles:", e);
    return ["Error generating titles. Please try again."];
  }
};

export const generateScriptScenes = async (
  title: string,
  duration: string,
  language: Language
): Promise<Scene[]> => {
  const cfg = LANGUAGE_CONFIG[language];
  const system = `Act as a master video scriptwriter for ${language}. You always respond with valid JSON only, no markdown.`;
  const user = `
Create a script for a viral short video titled: "${title}".
Target Duration: ${duration}.

TONE & LANGUAGE RULES (CRITICAL):
1. Universal Appeal: Simple, punchy.
2. Engaging Voice: Smart friend sharing a secret.
3. Cultural Context: ${cfg.scriptRules}

PACING RULE: EXTREME DENSITY (2 Seconds Per Scene)
- Break voiceover into TINY fragments (4-8 words max per scene).
- Total scenes should be high count for the duration.

STRUCTURE:
1. THE HOOK (Scenes 1, 2, 3): Statement → Twist → Bridge.
2. The Body: Break concept into visual steps.
3. The Conclusion: Powerful one-liner.

VISUAL INSTRUCTION:
- Simple stick figure metaphors, logical visual progression (comic strip style).

For each scene provide:
- "voiceover": ${language} spoken text (very short)
- "visualPrompt": English description of the stickman visual
- "keywords": Text written inside the image (${cfg.visualText}, 1-3 words max)

Return ONLY a JSON array like: [{"voiceover":"...","visualPrompt":"...","keywords":"..."},...]
`;

  try {
    const raw = await chatComplete(SCRIPT_MODEL, system, user);
    const data = safeParseJSON<any[]>(raw);
    if (!data) return [];
    return data.map((item: any, index: number) => ({
      id: `scene-${index}-${Date.now()}`,
      voiceover: item.voiceover ?? "",
      visualPrompt: item.visualPrompt ?? "",
      keywords: item.keywords ?? "",
    }));
  } catch (e) {
    console.error("Error generating script:", e);
    return [];
  }
};

export const generateDoodleImage = async (
  visualPrompt: string,
  textToRender: string,
  aspectRatio: "16:9" | "9:16",
  language: Language
): Promise<string | undefined> => {
  const orientation =
    aspectRatio === "9:16" ? "Vertical Portrait (9:16)" : "Horizontal Landscape (16:9)";

  const prompt = `
Clean, funny, minimalist digital illustration in the style of "Better Than Yesterday" or "Casually Explained" YouTube channels.
SUBJECT: Classic STICK FIGURE representing: ${visualPrompt}.
TEXT: Write "${textToRender}" clearly in the image. Font: Hand-written, bold black.
STYLE RULES:
1. CHARACTER: Classic stickman, perfect circle head, simple stick limbs.
2. EXPRESSION: Clear facial expression (Eyes and Mouth only).
3. LINES: Clean, consistent, smooth black lines, NOT messy, NO "pencil" texture.
4. COLOR: BLACK lines only.
5. BACKGROUND: Solid OFF-WHITE / BEIGE (#FDF6E3). Flat color.
Important: Text "${textToRender}" must be legible in ${language}.
COMPOSITION: Centered stickman, simple, uncluttered. High contrast: Black on Beige.
Format: ${orientation}.
  `.trim();

  try {
    return await generateImage(prompt);
  } catch (e) {
    console.error("Error generating doodle image:", e);
    return undefined;
  }
};

export const generateThumbnailImage = async (
  title: string,
  visualMetaphor: string = "",
  aspectRatio: "16:9" | "9:16"
): Promise<string | undefined> => {
  const orientation =
    aspectRatio === "9:16" ? "Vertical Portrait (9:16)" : "Horizontal Landscape (16:9)";

  const prompt = `
YouTube Thumbnail for: "${title}".
Visual: Funny, highly expressive STICK FIGURE engaging with: ${visualMetaphor}.
STYLE RULES:
1. Classic stickman, perfect circle head, simple stick limbs.
2. EXPRESSION: Highly expressive face (shocked, thinking, happy).
3. LINES: Clean, consistent, smooth black lines, NOT messy.
4. BACKGROUND: Solid OFF-WHITE / BEIGE (#FDF6E3). Flat color.
Format: Minimalist, clean, high contrast (Black on Beige).
No text in the image. Orientation: ${orientation}.
  `.trim();

  try {
    return await generateImage(prompt);
  } catch (e) {
    console.error("Error generating thumbnail:", e);
    return undefined;
  }
};

export const rewriteScript = async (
  currentScript: string,
  mode: "longer" | "shorter",
  language: Language
): Promise<string> => {
  const cfg = LANGUAGE_CONFIG[language];
  const system = `You are a professional video script editor for the ${language} market. Return ONLY the rewritten text, no explanations.`;
  const user = `
Rewrite the following ${language} script to be ${
    mode === "longer"
      ? "slightly more detailed and emotional (about 20% longer)"
      : "more concise and punchy (about 20% shorter)"
  }.

IMPORTANT RULES:
1. Keep the exact same meaning and core message.
2. Maintain the tone: ${cfg.scriptRules}
3. Return ONLY the rewritten text.

Original Script:
"${currentScript}"
`;

  try {
    return await chatComplete(TEXT_MODEL, system, user);
  } catch (e) {
    console.error("Rewrite error:", e);
    return currentScript;
  }
};

// ---------------------------------------------------------------------------
// WAV header helper
// ---------------------------------------------------------------------------
const createWavHeader = (dataLength: number, sampleRate = 24000) => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataLength, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataLength, true);

  return buffer;
};

// ---------------------------------------------------------------------------
// TTS via OpenRouter (uses openai/tts-1 which is available on OpenRouter)
// ---------------------------------------------------------------------------
export const generateSpeech = async (
  text: string,
  language: Language
): Promise<Blob | null> => {
  // Voice mapping for OpenRouter TTS
  const voiceMap: Record<Language, string> = {
    Vietnamese: "nova",   // Best match for Vietnamese
    English: "onyx",
    Japanese: "shimmer",
  };

  try {
    const res = await fetch(`${OPENROUTER_BASE}/audio/speech`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "openai/tts-1",
        input: text,
        voice: voiceMap[language],
        response_format: "wav",
      }),
    });

    if (!res.ok) {
      // Fallback: use browser's SpeechSynthesis API
      console.warn("OpenRouter TTS unavailable, falling back to Web Speech API");
      return await browserTTSFallback(text, language);
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Blob([arrayBuffer], { type: "audio/wav" });
  } catch (error) {
    console.error("TTS Error:", error);
    // Try browser TTS as last resort
    return await browserTTSFallback(text, language);
  }
};

// ---------------------------------------------------------------------------
// Browser-native TTS fallback (no API required)
// ---------------------------------------------------------------------------
const browserTTSFallback = (text: string, language: Language): Promise<Blob | null> => {
  return new Promise((resolve) => {
    const langCode: Record<Language, string> = {
      Vietnamese: "vi-VN",
      English: "en-US",
      Japanese: "ja-JP",
    };

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode[language];
    utterance.rate = 0.9;
    utterance.pitch = 1;

    // Record via MediaRecorder + AudioContext
    try {
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const recorder = new MediaRecorder(dest.stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        resolve(blob);
      };

      recorder.start();
      utterance.onend = () => {
        recorder.stop();
        audioCtx.close();
      };
      utterance.onerror = () => {
        recorder.stop();
        audioCtx.close();
        resolve(null);
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      // Plain fallback: just speak without recording
      window.speechSynthesis.speak(utterance);
      resolve(null);
    }
  });
};
