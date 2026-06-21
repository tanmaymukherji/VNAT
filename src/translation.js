// Translation API - direct browser calls to LibreTranslate / Hugging Face / Bhashini

import CONFIG from './config';

// LibreTranslate public instance (free, supports CORS)
const LIBRE_TRANSLATE_URL = 'https://libretranslate.com/translate';
const LIBRE_LANGS = {
  bn: { name: 'Bengali', code: 'bn' },
  hi: { name: 'Hindi', code: 'hi' },
  ta: { name: 'Tamil', code: 'ta' },
  te: { name: 'Telugu', code: 'te' },
  mr: { name: 'Marathi', code: 'mr' },
  gu: { name: 'Gujarati', code: 'gu' },
  kn: { name: 'Kannada', code: 'kn' },
  ml: { name: 'Malayalam', code: 'ml' },
  pa: { name: 'Punjabi', code: 'pa' },
  ur: { name: 'Urdu', code: 'ur' },
};

// Hugging Face language code mapping for IndicTrans2
const IT2_LANG_MAP = {
  bn: 'ben_Beng',
  hi: 'hin_Deva',
  ta: 'tam_Taml',
  te: 'tel_Telu',
  mr: 'mar_Deva',
  gu: 'guj_Gujr',
  kn: 'kan_Knda',
  ml: 'mal_Mlym',
  pa: 'pan_Guru',
  ur: 'urd_Arab',
  en: 'eng_Latn',
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

// ---- LibreTranslate ----
async function translateLibre(text, srcLang, tgtLang) {
  const src = srcLang === 'auto' ? detectLanguage(text) : srcLang;

  const response = await fetch(LIBRE_TRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: src,
      target: tgtLang,
      format: 'text',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LibreTranslate error (${response.status}): ${body}`);
  }

  const result = await response.json();
  return result.translatedText || '';
}

// ---- Hugging Face (OPUS-MT) ----
async function translateOpusMT(text, tgtLang, apiKey) {
  const modelId = `Helsinki-NLP/opus-mt-en-${tgtLang}`;
  const url = `${CONFIG.HUGGINGFACE_API_URL}/${modelId}`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs: text }),
  });

  if (response.status === 503) {
    await new Promise((r) => setTimeout(r, 8000));
    return translateOpusMT(text, tgtLang, apiKey);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HF OPUS-MT error (${response.status}): ${body}`);
  }

  const result = await response.json();
  if (Array.isArray(result)) {
    return result[0]?.translation_text || result[0]?.generated_text || String(result[0] || '');
  }
  return String(result.translation_text || result.generated_text || result);
}

// ---- Hugging Face (IndicTrans2) ----
async function translateIndicTrans2(text, srcLang, tgtLang, apiKey) {
  const src = srcLang === 'auto' ? detectLanguage(text) : toIT2Code(srcLang);
  const tgt = toIT2Code(tgtLang);

  let modelId;
  if (src === 'eng_Latn') {
    modelId = CONFIG.INDICTRANS2_MODELS['en-indic'];
  } else if (tgt === 'eng_Latn') {
    modelId = CONFIG.INDICTRANS2_MODELS['indic-en'];
  } else {
    modelId = CONFIG.INDICTRANS2_MODELS['indic-indic'];
  }

  const url = `${CONFIG.HUGGINGFACE_API_URL}/${modelId}`;
  const key = apiKey || CONFIG.HUGGINGFACE_API_KEY;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: text,
      parameters: { src_lang: src, tgt_lang: tgt },
    }),
  });

  if (response.status === 503) {
    await new Promise((r) => setTimeout(r, 8000));
    return translateIndicTrans2(text, srcLang, tgtLang, apiKey);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HF IndicTrans2 error (${response.status}): ${body}`);
  }

  const result = await response.json();
  let translation;
  if (Array.isArray(result)) {
    translation = result[0]?.translation_text || result[0]?.generated_text || '';
  } else if (typeof result === 'object') {
    translation = result.translation_text || result.generated_text || '';
  } else {
    translation = String(result);
  }
  return translation;
}

// ---- Public API (tries LibreTranslate first, then Hugging Face) ----
export async function translateHF(text, srcLang, tgtLang, apiKey) {
  if (isSanskrit(text)) {
    return { translation: text, note: 'Sanskrit text kept as-is' };
  }

  const tgt = LIBRE_LANGS[tgtLang]?.code;
  const src = srcLang === 'auto' ? 'auto' : srcLang;

  let errors = [];

  // Try LibreTranslate first (CORS-friendly, free, no auth needed)
  if (tgt) {
    try {
      const translation = await translateLibre(text, src, tgt);
      return { translation };
    } catch (libreErr) {
      errors.push(`LibreTranslate: ${libreErr.message}`);
    }
  }

  // Try OPUS-MT next (source must be English)
  if (srcLang === 'auto' || srcLang === 'en') {
    try {
      const translation = await translateOpusMT(text, tgtLang, apiKey);
      return { translation };
    } catch (opusErr) {
      errors.push(`OPUS-MT: ${opusErr.message}`);
    }
  }

  // Try IndicTrans2 last
  try {
    const translation = await translateIndicTrans2(text, srcLang, tgtLang, apiKey);
    return { translation };
  } catch (it2Err) {
    errors.push(`IndicTrans2: ${it2Err.message}`);
  }

  throw new Error(`All translation methods failed: ${errors.join('; ')}`);
}

// ---- Bhashini (kept for when API key is available) ----
export async function translateBhashini(text, srcLang, tgtLang, apiKey) {
  if (isSanskrit(text)) {
    return { translation: text, note: 'Sanskrit text kept as-is' };
  }

  if (!apiKey) {
    throw new Error('Bhashini API key not configured');
  }

  const src = srcLang === 'auto' ? detectLanguage(text) : srcLang;

  const response = await fetch(`${CONFIG.BHASHINI_API_URL}/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceLanguage: src,
      targetLanguage: tgtLang,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bhashini API error (${response.status})`);
  }

  const result = await response.json();
  return { translation: result.translation || result.text || '' };
}

// ---- Top-level translate function ----
export async function translate(provider, text, srcLang, tgtLang, apiKey) {
  if (provider === 'bhashini') {
    try {
      return await translateBhashini(text, srcLang, tgtLang, apiKey);
    } catch (e) {
      if (e.message.includes('key not configured')) {
        console.warn('Bhashini unavailable, falling back to Hugging Face:', e.message);
        return await translateHF(text, srcLang, tgtLang, apiKey);
      }
      throw e;
    }
  }
  return await translateHF(text, srcLang, tgtLang, apiKey);
}
