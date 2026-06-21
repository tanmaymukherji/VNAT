import os
import requests
import json

# Hugging Face API token from environment
HF_API_TOKEN = os.environ.get("HUGGINGFACE_API_KEY", "")
HF_API_URL = "https://api-inference.huggingface.co/models"


class HuggingFaceClient:
    """Client for Hugging Face Inference API using IndicTrans2 models."""

    # Model mapping for different translation directions
    MODEL_MAP = {
        "en-indic": "ai4bharat/indictrans2-en-indic-1B",
        "indic-en": "ai4bharat/indictrans2-indic-en-1B",
        "indic-indic": "ai4bharat/indictrans2-indic-indic-1B",
    }

    # Language code mapping for IndicTrans2
    LANG_MAP = {
        "bn": "ben_Beng",
        "hi": "hin_Deva",
        "ta": "tam_Taml",
        "te": "tel_Telu",
        "mr": "mar_Deva",
        "gu": "guj_Gujr",
        "kn": "kan_Knda",
        "ml": "mal_Mlym",
        "pa": "pan_Guru",
        "ur": "urd_Arab",
        "en": "eng_Latn",
    }

    def __init__(self, api_token: str = None):
        self.api_token = api_token or HF_API_TOKEN
        self.headers = {"Authorization": f"Bearer {self.api_token}"}

    def _get_model(self, src_lang: str, tgt_lang: str) -> str:
        """Determine the correct model based on source/target languages."""
        if src_lang == "eng_Latn":
            return self.MODEL_MAP["en-indic"]
        elif tgt_lang == "eng_Latn":
            return self.MODEL_MAP["indic-en"]
        else:
            return self.MODEL_MAP["indic-indic"]

    def _to_it2_code(self, lang: str) -> str:
        """Convert short language code to IndicTrans2 format."""
        if lang in self.LANG_MAP:
            return self.LANG_MAP[lang]
        # If it already looks like an IT2 code, return as-is
        if "_" in lang:
            return lang
        return lang

    def translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        """Translate text using Hugging Face Inference API."""
        if not self.api_token:
            raise ValueError(
                "Hugging Face API token not configured. "
                "Set the HUGGINGFACE_API_KEY environment variable."
            )

        # Convert codes
        src = self._to_it2_code(src_lang)
        tgt = self._to_it2_code(tgt_lang)
        model_id = self._get_model(src, tgt)

        url = f"{HF_API_URL}/{model_id}"

        # Build payload with source/target language hints
        payload = {
            "inputs": text,
            "parameters": {
                "src_lang": src,
                "tgt_lang": tgt,
            }
        }

        try:
            response = requests.post(
                url,
                headers=self.headers,
                json=payload,
                timeout=120  # HF model may need time to warm up
            )

            if response.status_code == 503:
                # Model is loading - retry after brief delay
                import time
                time.sleep(5)
                response = requests.post(
                    url,
                    headers=self.headers,
                    json=payload,
                    timeout=120
                )

            if response.status_code == 401:
                raise ValueError("Invalid Hugging Face API token")
            if response.status_code == 400:
                raise ValueError(f"Bad request: {response.text}")

            response.raise_for_status()
            result = response.json()

            # Handle different response formats
            if isinstance(result, list):
                return result[0].get("translation_text", result[0].get("generated_text", str(result[0])))
            elif isinstance(result, dict):
                return result.get("translation_text", result.get("generated_text", str(result)))
            return str(result)

        except requests.exceptions.Timeout:
            raise TimeoutError("Hugging Face API timed out. The model may still be loading.")
        except requests.exceptions.RequestException as e:
            raise ConnectionError(f"Failed to connect to Hugging Face API: {e}")

    def translate_batch(self, texts: list, src_lang: str, tgt_lang: str) -> list:
        """Translate multiple texts in a single API call."""
        # For now, translate sequentially since HF free tier may not support batching
        results = []
        for text in texts:
            try:
                result = self.translate(text, src_lang, tgt_lang)
                results.append(result)
            except Exception as e:
                results.append(f"[Error: {e}]")
        return results
