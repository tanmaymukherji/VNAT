import CONFIG from './config';

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/single';

const LANG_MAP = {
  bn: 'bn', hi: 'hi', ta: 'ta', te: 'te', mr: 'mr',
  gu: 'gu', kn: 'kn', ml: 'ml', pa: 'pa', ur: 'ur',
};

const IT2_LANG_MAP = {
  bn: 'ben_Beng', hi: 'hin_Deva', ta: 'tam_Taml', te: 'tel_Telu',
  mr: 'mar_Deva', gu: 'guj_Gujr', kn: 'kan_Knda', ml: 'mal_Mlym',
  pa: 'pan_Guru', ur: 'urd_Arab', en: 'eng_Latn',
};

function toIT2Code(lang) {
  if (IT2_LANG_MAP[lang]) return IT2_LANG_MAP[lang];
  if (lang.includes('_')) return lang;
  return lang;
}

function detectLanguage(text) {
  const devanagari = (text.match(/[\u0900-\u097F]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const total = devanagari + latin;
  if (total === 0) return 'en';
  if (latin / total > 0.6) return 'en';
  return 'hi';
}

function isSanskrit(text) {
  const devanagari = (text.match(/[\u0900-\u097F]{3,}/g) || []).length;
  return text.length > 0 && devanagari / text.length > 0.3;
}

const MYMEMORY_MAX_CHARS = 300;

function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    if (start + maxLen >= text.length) {
      chunks.push(text.slice(start));
      break;
    }
    let end = start + maxLen;
    const boundary = text.lastIndexOf(' ', end);
    if (boundary > start) end = boundary + 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function translateGoogle(text, tgtLang) {
  const src = detectLanguage(text);
  const url = `${GOOGLE_URL}?client=gtx&sl=${src}&tl=${tgtLang}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google error (${response.status})`);
  const result = await response.json();
  const translated = (result[0] || []).map((seg) => seg[0] || '').join('');
  if (!translated) throw new Error('Google returned empty result');
  return translated;
}

async function translateMyMemory(text, tgtLang) {
  const src = detectLanguage(text);
  const langpair = `${src}|${tgtLang}`;
  const chunks = splitIntoChunks(text, MYMEMORY_MAX_CHARS);

  const translated = [];
  for (const chunk of chunks) {
    await delay(200);
    const response = await fetch(MYMEMORY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(langpair)}`,
    });
    if (!response.ok) {
      throw new Error(`MyMemory error (${response.status})`);
    }
    const result = await response.json();
    if (result.responseStatus !== 200) {
      throw new Error(`MyMemory error: ${result.responseDetails || result.responseStatus}`);
    }
    translated.push(result.responseData?.translatedText || '');
  }

  return translated.join(' ');
}

async function hfFetch(modelId, body, apiKey) {
  const key = apiKey || localStorage.getItem('hf_api_key') || '';
  const url = `https://api-inference.huggingface.co/models/${modelId}`;
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

  if (response.status === 503) {
    await delay(8000);
    return hfFetch(modelId, body, apiKey);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HF error (${response.status}): ${text}`);
  }

  const result = await response.json();
  if (Array.isArray(result)) {
    return result[0]?.translation_text || result[0]?.generated_text || String(result[0] || '');
  }
  return String(result.translation_text || result.generated_text || result);
}

async function translateOpusMT(text, tgtLang, apiKey) {
  const modelId = `Helsinki-NLP/opus-mt-en-${tgtLang}`;
  return hfFetch(modelId, { inputs: text }, apiKey);
}

async function translateIndicTrans2(text, srcLang, tgtLang, apiKey) {
  const src = srcLang === 'auto' ? detectLanguage(text) : toIT2Code(srcLang);
  const tgt = toIT2Code(tgtLang);

  let modelId;
  if (src === 'eng_Latn') modelId = CONFIG.INDICTRANS2_MODELS['en-indic'];
  else if (tgt === 'eng_Latn') modelId = CONFIG.INDICTRANS2_MODELS['indic-en'];
  else modelId = CONFIG.INDICTRANS2_MODELS['indic-indic'];

  return hfFetch(modelId, { inputs: text, parameters: { src_lang: src, tgt_lang: tgt } }, apiKey);
}

export async function translateHF(text, srcLang, tgtLang, apiKey) {
  if (isSanskrit(text)) {
    return { translation: text, note: 'Sanskrit text kept as-is' };
  }

  const tgt = LANG_MAP[tgtLang];
  let errors = [];

  // 1. MyMemory (free, no key needed)
  if (tgt) {
    try {
      const translation = await translateMyMemory(text, tgt);
      if (translation) return { translation };
    } catch (e) {
      errors.push(`MyMemory: ${e.message}`);
    }
  }

  // 2. Google Translate (free, no key, unofficial API)
  try {
    const translation = await translateGoogle(text, tgtLang);
    if (translation) return { translation };
  } catch (e) {
    errors.push(`Google: ${e.message}`);
  }

  // 3. OPUS-MT via HF Inference API (requires optional HF key)
  if (srcLang === 'auto' || srcLang === 'en') {
    try {
      const translation = await translateOpusMT(text, tgtLang, apiKey);
      return { translation };
    } catch (e) {
      errors.push(`OPUS-MT: ${e.message}`);
    }
  }

  // 4. IndicTrans2 via HF Inference API (requires optional HF key)
  try {
    const translation = await translateIndicTrans2(text, srcLang, tgtLang, apiKey);
    return { translation };
  } catch (e) {
    errors.push(`IndicTrans2: ${e.message}`);
  }

  throw new Error(`All translation methods failed: ${errors.join('; ')}`);
}

export async function translate(provider, text, srcLang, tgtLang, apiKey) {
  return await translateHF(text, srcLang, tgtLang, apiKey);
}
