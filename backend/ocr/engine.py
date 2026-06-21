import os
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import cv2
import numpy as np

# Configure tesseract path - adjust for your system
# Common paths:
# Windows: C:\\Program Files\\Tesseract-OCR\\tesseract.exe
# Linux: /usr/bin/tesseract
# macOS: /usr/local/bin/tesseract
TESSERACT_CMD = os.environ.get(
    "TESSERACT_CMD",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD


class OCRProcessor:
    """Process images using Tesseract OCR with Hindi, English, and Sanskrit support."""

    # Tesseract language codes
    LANG_MAP = {
        "hin": "hin",
        "eng": "eng",
        "san": "san",
        "default": "hin+eng+san",
    }

    def __init__(self, lang: str = "default"):
        self.lang = self.LANG_MAP.get(lang, lang)

    def preprocess_image(self, image_path: str) -> np.ndarray:
        """Preprocess image for better OCR accuracy."""
        # Read image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")

        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Apply thresholding to binarize
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Denoise
        denoised = cv2.fastNlMeansDenoising(thresh, h=30)

        # Deskew
        coords = np.column_stack(np.where(denoised > 0))
        if len(coords) > 0:
            angle = cv2.minAreaRect(coords)[-1]
            if angle < -45:
                angle = 90 + angle
            if abs(angle) > 0.5:
                h, w = denoised.shape[:2]
                center = (w // 2, h // 2)
                matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
                denoised = cv2.warpAffine(
                    denoised, matrix, (w, h),
                    flags=cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REPLICATE
                )

        return denoised

    def process_image(self, image_path: str) -> dict:
        """Extract text from an image and return structured result."""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")

        # Preprocess
        processed = self.preprocess_image(image_path)

        # Convert numpy array to PIL Image for pytesseract
        pil_image = Image.fromarray(processed)

        # OCR with layout analysis
        custom_config = (
            f'--oem 3 --psm 6 '  # LSTM engine, uniform block of text
            f'-l {self.lang} '
            f'-c preserve_interword_spaces=1'
        )

        # Get detailed data including bounding boxes
        data = pytesseract.image_to_data(
            pil_image,
            config=custom_config,
            output_type=pytesseract.Output.DICT
        )

        # Extract paragraphs (grouped by block_num)
        paragraphs = []
        current_para = []
        prev_block = -1

        for i in range(len(data["text"])):
            block_num = data["block_num"][i]
            text = data["text"][i].strip()

            if block_num != prev_block and prev_block != -1:
                if current_para:
                    paragraphs.append(" ".join(current_para))
                    current_para = []

            if text:
                current_para.append(text)

            prev_block = block_num

        if current_para:
            paragraphs.append(" ".join(current_para))

        # Also get raw text
        raw_text = pytesseract.image_to_string(pil_image, config=custom_config)

        return {
            "raw_text": raw_text.strip(),
            "paragraphs": paragraphs,
            "word_count": len(raw_text.split()),
            "filename": os.path.basename(image_path),
        }

    def process_batch(self, image_paths: list) -> list:
        """Process multiple images."""
        results = []
        for path in image_paths:
            try:
                result = self.process_image(path)
                results.append(result)
            except Exception as e:
                print(f"Error processing {path}: {e}")
                results.append({
                    "raw_text": "",
                    "paragraphs": [],
                    "word_count": 0,
                    "filename": os.path.basename(path),
                    "error": str(e),
                })
        return results
