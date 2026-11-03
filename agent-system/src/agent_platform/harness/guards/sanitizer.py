import base64
import re
import unicodedata
from typing import List

ZERO_WIDTH_CHARS = re.compile(r"[\u200b-\u200f\ufeff\u202a-\u202e\u2060-\u206f\u00ad]")
HTML_COMMENT_REGEX = re.compile(r"<!--\s*(.*?)\s*-->", re.DOTALL)
BASE64_CANDIDATE_REGEX = re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{16,}={0,2}(?![A-Za-z0-9+/])")


class InputSanitizer:
    """Removes invisible characters, zero-width spaces, extracts embedded HTML comments/Base64 payloads, and normalizes Unicode."""

    @staticmethod
    def strip_accents(text: str) -> str:
        """Strip Vietnamese diacritics / combining marks (NFKD) for unaccented matching (VinAI Day 24)."""
        if not text:
            return ""
        text = text.replace("đ", "d").replace("Đ", "d")
        nfkd = unicodedata.normalize("NFKD", text)
        return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()

    @staticmethod
    def extract_base64_payloads(text: str) -> List[str]:
        """Detect and decode potential base64 payloads to inspect hidden instructions (VinAI Day 24)."""
        payloads: List[str] = []
        if not text:
            return payloads
        for match in BASE64_CANDIDATE_REGEX.finditer(text):
            candidate = match.group(0)
            try:
                decoded_bytes = base64.b64decode(candidate, validate=True)
                decoded_str = decoded_bytes.decode("utf-8", errors="ignore")
                # Ensure it's legible text (mostly printable characters)
                if decoded_str and sum(c.isprintable() for c in decoded_str) / len(decoded_str) > 0.8:
                    payloads.append(decoded_str.strip())
            except Exception:
                continue
        return payloads

    @staticmethod
    def sanitize(text: str) -> str:
        if not text:
            return ""
        # 1. Strip zero-width chars
        cleaned = ZERO_WIDTH_CHARS.sub("", text)
        # 2. Normalize Unicode (NFKC)
        cleaned = unicodedata.normalize("NFKC", cleaned)
        # 3. Unbox HTML comments into inspection stream
        cleaned = HTML_COMMENT_REGEX.sub(r" \1 ", cleaned)
        # 4. Detect and append decoded Base64 content for inspection
        b64_chunks = InputSanitizer.extract_base64_payloads(cleaned)
        if b64_chunks:
            cleaned += " " + " ".join(f"[DECODED_PAYLOAD: {chunk}]" for chunk in b64_chunks)
        # 5. Clean extra whitespace
        return re.sub(r"\s+", " ", cleaned).strip()

