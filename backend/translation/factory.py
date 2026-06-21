import os
import re
from .huggingface_client import HuggingFaceClient
from .bhashini_client import BhashiniClient


class TranslationFactory:
    """Factory for selecting and using translation providers.

    Supports Hugging Face and Bhashini providers.
    Default provider: Hugging Face (until Bhashini API key is configured).
    """

    def __init__(self):
        self._clients = {}

    def _get_client(self, provider: str):
        """Get or create a translation client."""
        if provider not in self._clients:
            if provider == "huggingface":
                self._clients[provider] = HuggingFaceClient()
            elif provider == "bhashini":
                self._clients[provider] = BhashiniClient()
            else:
                raise ValueError(f"Unknown provider: {provider}")
        return self._clients[provider]

    def translate(self, provider: str, text: str, src_lang: str, tgt_lang: str) -> str:
        """Translate text using specified provider.

        Args:
            provider: "huggingface" or "bhashini"
            text: Source text
            src_lang: Source language code
            tgt_lang: Target language code

        Returns:
            Translated text
        """
        client = self._get_client(provider)

        if provider == "bhashini":
            try:
                return client.translate(text, src_lang, tgt_lang)
            except ValueError as e:
                # If Bhashini is not configured, fallback to Hugging Face
                print(f"Bhashini unavailable, falling back to Hugging Face: {e}")
                hf_client = self._get_client("huggingface")
                return hf_client.translate(text, src_lang, tgt_lang)

        return client.translate(text, src_lang, tgt_lang)

    def list_providers(self) -> list:
        """Return list of available providers with their status."""
        providers = []

        # Check Hugging Face
        hf_token = os.environ.get("HUGGINGFACE_API_KEY", "")
        providers.append({
            "id": "huggingface",
            "name": "Hugging Face (IndicTrans2)",
            "configured": bool(hf_token),
            "default": True if not os.environ.get("BHASHINI_API_KEY") else False,
        })

        # Check Bhashini
        bhashini_key = os.environ.get("BHASHINI_API_KEY", "")
        providers.append({
            "id": "bhashini",
            "name": "Bhashini (Govt of India)",
            "configured": bool(bhashini_key) and bhashini_key != "your_bhashini_api_key_here",
            "default": bool(bhashini_key) and bhashini_key != "your_bhashini_api_key_here",
        })

        return providers
