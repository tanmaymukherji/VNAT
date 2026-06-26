// Configuration for VNAT - Village Need Analysis Tool
// All API keys and settings in one place.

function getLS(key, fallback = '') {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

const CONFIG = {
  HUGGINGFACE_API_KEY: getLS('hf_api_key'),

  GROQ_API_KEY: getLS('groq_api_key'),
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  GROQ_MODEL: 'llama-3.3-70b-versatile',

  HF_SUMMARISE_API_KEY: getLS('hf_summarise_api_key') || getLS('hf_api_key'),

  NVIDIA_API_KEY: getLS('nvidia_api_key'),
  NVIDIA_API_URL: 'https://integrate.api.nvidia.com/v1/chat/completions',
  NVIDIA_MODEL: 'meta/llama-3.1-8b-instruct',

  HF_ROUTER_URL: 'https://router.huggingface.co/v1/chat/completions',
  HF_MODEL: 'meta-llama/llama-3.1-8b-instruct',

  USE_HF_FALLBACK: getLS('vna_use_hf_fallback') !== 'false',

  OCR_LANGUAGES: 'hin+eng+san',

  LANGUAGES: [
    { code: 'bn', name: 'Bengali', native: 'বাংলা' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు' },
    { code: 'mr', name: 'Marathi', native: 'मराठी' },
    { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
    { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
    { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
    { code: 'ur', name: 'Urdu', native: 'اردو' },
  ],

  INDICTRANS2_MODELS: {
    'en-indic': 'ai4bharat/indictrans2-en-indic-1B',
    'indic-en': 'ai4bharat/indictrans2-indic-en-1B',
    'indic-indic': 'ai4bharat/indictrans2-indic-indic-1B',
  },

  OCR_SPACE_API_KEY: 'K82846767888957',
};

export default CONFIG;
