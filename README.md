# Translation Tool

A desktop application built with Electron + React + Python FastAPI to scan images and translate them across Indian languages.

## Features
- **OCR**: Extracts text from Hindi, English, and Sanskrit scanned images.
- **Editor**: Split-pane editor to review extracted text and create translations.
- **Translation**: Uses Bhashini (Primary) or Hugging Face (Fallback) APIs for high-quality translation to Indian languages, starting with Bengali.
- **Selective Translation**: Translate specific paragraphs while retaining others in the original language.
- **Export**: Saves translated documents as DOCX files.

## Tech Stack
- **Frontend**: Electron, React, Vite, TipTap, Tailwind CSS
- **Backend**: Python FastAPI, Tesseract OCR, Pillow, OpenCV
- **APIs**: Bhashini, Hugging Face Inference

## Setup
1. Ensure you have `tesseract` installed on your system.
2. Create a `.env` file in the root with your API keys.
3. Run `npm install` and `pip install -r requirements.txt`.
4. Run `npm run dev` to start the application.
