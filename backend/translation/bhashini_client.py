import os
import requests
import json

# Bhashini API configuration from environment
BHASHINI_API_KEY = os.environ.get("BHASHINI_API_KEY", "")
BHASHINI_USER_ID = os.environ.get("BHASHINI_USER_ID", "")
BHASHINI_API_URL = "https://api.bhashini.gov.in/v2"


class BhashiniClient:
    """Client for Bhashini translation API (Government of India).

    API key registration: https://bhashini.gov.in
    """

    # Language code mapping for Bhashini
    LANG_MAP = {
        "bn": "bn",
        "hi": "hi",
        "ta": "ta",
        "te": "te",
        "mr": "mr",
        "gu": "gu",
        "kn": "kn",
        "ml": "ml",
        "pa": "pa",
        "ur": "ur",
        "en": "en",
        "hin_Deva": "hi",
        "eng_Latn": "en",
        "ben_Beng": "bn",
    }

    def __init__(
        self,
        api_key: str = None,
        user_id: str = None,
    ):
        self.api_key = api_key or BHASHINI_API_KEY
        self.user_id = user_id or BHASHINI_USER_ID

    def _to_bhashini_code(self, lang: str) -> str:
        """Convert any language code format to Bhashini format."""
        if lang in self.LANG_MAP:
            return self.LANG_MAP[lang]
        if "_" in lang:
            parts = lang.split("_")
            short = parts[0]
            return self.LANG_MAP.get(short, lang)
        return lang

    def translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        """Translate text using Bhashini API.

        Args:
            text: Source text to translate
            src_lang: Source language code
            tgt_lang: Target language code

        Returns:
            Translated text

        Raises:
            ValueError: If API key is not configured
            ConnectionError: If API call fails
        """
        if not self.api_key or self.api_key == "your_bhashini_api_key_here":
            raise ValueError(
                "Bhashini API key not configured. "
                "Register at https://bhashini.gov.in and set the BHASHINI_API_KEY "
                "and BHASHINI_USER_ID environment variables."
            )

        src = self._to_bhashini_code(src_lang)
        tgt = self._to_bhashini_code(tgt_lang)

        payload = {
            "sourceLanguage": src,
            "targetLanguage": tgt,
            "text": text,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        try:
            response = requests.post(
                f"{BHASHINI_API_URL}/translate",
                headers=headers,
                json=payload,
                timeout=30,
            )

            if response.status_code == 401:
                raise ValueError("Invalid Bhashini API credentials")
            if response.status_code == 429:
                raise ConnectionError("Bhashini API rate limit exceeded")

            response.raise_for_status()
            result = response.json()

            # Parse Bhashini response format
            return result.get("translation", result.get("text", str(result)))

        except requests.exceptions.Timeout:
            raise TimeoutError("Bhashini API timed out")
        except requests.exceptions.RequestException as e:
            raise ConnectionError(f"Failed to connect to Bhashini API: {e}")

    def translate_batch(self, texts: list, src_lang: str, tgt_lang: str) -> list:
        """Translate multiple texts."""
        results = []
        for text in texts:
            try:
                result = self.translate(text, src_lang, tgt_lang)
                results.append(result)
            except Exception as e:
                results.append(f"[Error: {e}]")
        return results
