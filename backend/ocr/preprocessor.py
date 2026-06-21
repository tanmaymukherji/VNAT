"""Image preprocessing utilities for OCR."""
import cv2
import numpy as np


def resize(image: np.ndarray, max_width: int = 2000) -> np.ndarray:
    """Resize image while maintaining aspect ratio."""
    h, w = image.shape[:2]
    if w > max_width:
        scale = max_width / w
        new_w = max_width
        new_h = int(h * scale)
        return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return image


def adaptive_threshold(image: np.ndarray) -> np.ndarray:
    """Apply adaptive thresholding."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 11, 2
    )


def sharpen(image: np.ndarray) -> np.ndarray:
    """Apply sharpening kernel."""
    kernel = np.array([[-1, -1, -1],
                       [-1,  9, -1],
                       [-1, -1, -1]])
    return cv2.filter2D(image, -1, kernel)


def remove_noise(image: np.ndarray) -> np.ndarray:
    """Remove noise using median filter."""
    return cv2.medianBlur(image, 3)
