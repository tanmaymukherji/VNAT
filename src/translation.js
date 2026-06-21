import { InferenceClient } from '@huggingface/inference';
import CONFIG from './config';

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

const LANG_MAP = {
  bn: 'bn', hi: 'hi', ta: 'ta', te: 'te', mr: 'mr',
  gu: 'gu', kn: 'kn', ml: 'ml', pa: 'pa', ur: 'ur',
};

const LIBRE_LANG_MAP = {
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

function getHFClient() {
  const apiKey = localStorage.getItem('hf_api_key') || '';
  return new InferenceClient(apiKey);
}

const MYMEMORY_MAX_CHARS = 500;

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

async function translateMyMemory(text, tgtLang) {
  const src = detectLanguage(text);
  const langpair = `${src}|${tgtLang}`;
  const chunks = splitIntoChunks(text, MYMEMORY_MAX_CHARS);

  const translated = await Promise.all(chunks.map(async (chunk) => {
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
    return result.responseData?.translatedText || '';
  }));

  return translated.join(' ');
}

async function translateLibre(text, tgtLang) {
  const src = detectLanguage(text);
  const apiKey = localStorage.getItem('libretranslate_api_key') || '';

  const response = await fetch('https://libretranslate.com/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: src,
      target: tgtLang,
      format: 'text',
      api_key: apiKey || undefined,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LibreTranslate error (${response.status}): ${body}`);
  }

  const result = await response.json();
  return result.translatedText || '';
}

async function translateOpusMT(text, tgtLang) {
  const modelId = `Helsinki-NLP/opus-mt-en-${tgtLang}`;
  const client = getHFClient();
  const result = await client.translation({
    inputs: text,
    model: modelId,
  });
  return result.translation_text || '';
}

async function translateIndicTrans2(text, srcLang, tgtLang) {
  const src = srcLang === 'auto' ? detectLanguage(text) : toIT2Code(srcLang);
  const tgt = toIT2Code(tgtLang);

  let modelId;
  if (src === 'eng_Latn') modelId = CONFIG.INDICTRANS2_MODELS['en-indic'];
  else if (tgt === 'eng_Latn') modelId = CONFIG.INDICTRANS2_MODELS['indic-en'];
  else modelId = CONFIG.INDICTRANS2_MODELS['indic-indic'];

  const client = getHFClient();
  const result = await client.translation({
    inputs: text,
    model: modelId,
    parameters: { src_lang: src, tgt_lang: tgt },
  });
  return result.translation_text || '';
}

export async function translateHF(text, srcLang, tgtLang, apiKey) {
  if (isSanskrit(text)) {
    return { translation: text, note: 'Sanskrit text kept as-is' };
  }

  const tgt = LANG_MAP[tgtLang];
  let errors = [];

  if (tgt) {
    try {
      const translation = await translateMyMemory(text, tgt);
      if (translation) return { translation };
    } catch (e) {
      errors.push(`MyMemory: ${e.message}`);
    }
  }

  if (tgt && LIBRE_LANG_MAP[tgtLang]) {
    try {
      const translation = await translateLibre(text, LIBRE_LANG_MAP[tgtLang]);
      if (translation) return { translation };
    } catch (e) {
      errors.push(`LibreTranslate: ${e.message}`);
    }
  }

  if (srcLang === 'auto' || srcLang === 'en') {
    try {
      const translation = await translateOpusMT(text, tgtLang);
      return { translation };
    } catch (e) {
      errors.push(`OPUS-MT: ${e.message}`);
    }
  }

  try {
    const translation = await translateIndicTrans2(text, srcLang, tgtLang);
    return { translation };
  } catch (e) {
    errors.push(`IndicTrans2: ${e.message}`);
  }

  throw new Error(`All translation methods failed: ${errors.join('; ')}`);
}

export async function translateBhashini(text, srcLang, tgtLang, apiKey) {
  if (isSanskrit(text)) return { translation: text, note: 'Sanskrit text kept as-is' };
  if (!apiKey) throw new Error('Bhashini API key not configured');

  const src = srcLang === 'auto' ? detectLanguage(text) : srcLang;
  const response = await fetch(`${CONFIG.BHASHINI_API_URL}/translate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceLanguage: src, targetLanguage: tgtLang, text }),
  });
  if (!response.ok) throw new Error(`Bhashini API error (${response.status})`);
  const result = await response.json();
  return { translation: result.translation || result.text || '' };
}

export async function translate(provider, text, srcLang, tgtLang, apiKey) {
  if (provider === 'bhashini') {
    try {
      return await translateBhashini(text, srcLang, tgtLang, apiKey);
    } catch (e) {
      if (e.message.includes('key not configured')) {
        console.warn('Bhashini unavailable, falling back to HF:', e.message);
        return await translateHF(text, srcLang, tgtLang, apiKey);
      }
      throw e;
    }
  }
  return await translateHF(text, srcLang, tgtLang, apiKey);
}
