import cv2
import numpy as np
import openslide
import pyvips
import json
from pathlib import Path


# =========================================
# LOAD JPG + PNG + SVS
# =========================================
def load_image_any(path):
    """
    Load image from various formats.
    
    Returns:
        tuple: (img_np, scale_factor)
            - img_np: numpy array of the loaded image (RGB)
            - scale_factor: Factor by which the image was downsampled
    """
    path = str(path)
    ext = Path(path).suffix.lower()

    # -------------------------------
    # CASE 1: SVS → dùng OpenSlide
    # -------------------------------
    if ext in [".svs", ".tif", ".tiff"]:
        print(">>> Loading SVS bằng OpenSlide...")

        try:
            slide = openslide.OpenSlide(path)

            level = slide.get_best_level_for_downsample(16)
            print(">>> SVS levels:", slide.level_dimensions)
            print(">>> Using level:", level)
            
            # Calculate scale factor
            original_width = slide.level_dimensions[0][0]  # Level 0 width
            downsampled_width = slide.level_dimensions[level][0]
            scale_factor = original_width / downsampled_width

            img = slide.read_region(
                (0, 0),
                level,
                slide.level_dimensions[level]
            ).convert("RGB")

            img_np = np.array(img)
            print(f">>> Scale factor: {scale_factor:.2f}x (original: {slide.level_dimensions[0]}, using: {slide.level_dimensions[level]})")
            return img_np, scale_factor

        except Exception as e:
            print(">>> ERROR load SVS bằng OpenSlide:", e)
            print(">>> Thử load bằng pyvips...")

            try:
                img_vips = pyvips.Image.new_from_file(path)
                img_np = np.ndarray(buffer=img_vips.write_to_memory(),
                                    dtype=np.uint8,
                                    shape=[img_vips.height, img_vips.width, img_vips.bands])
                if img_vips.bands > 3:
                    img_np = img_np[:, :, :3]
                return img_np, 1.0  # No downsampling with pyvips

            except Exception as e2:
                raise RuntimeError(f"Không mở được file SVS: {e2}")

    # -------------------------------
    # CASE 2: JPG / PNG
    # -------------------------------
    else:
        print(">>> Loading JPG/PNG bằng OpenCV...")
        img = cv2.imread(path)
        if img is None:
            raise ValueError(f"Không mở được ảnh: {path}")
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        return img, 1.0  # No downsampling for regular images


# =========================================
# CLASSIFY NUCLEUS (HEURISTIC)
# =========================================
def classify_nucleus_heuristic(img, x, y, w, h, contour):
    """
    Phân loại nucleus dựa trên heuristics đơn giản.
    
    Args:
        img: Ảnh gốc (RGB)
        x, y, w, h: Bounding box của nucleus
        contour: Contour của nucleus
    
    Returns:
        str: "HSIL", "LSIL", "ASC-H", "ASC-US", hoặc None
    """
    # Extract region of interest
    roi = img[y:y+h, x:x+w]
    if roi.size == 0:
        return None
    
    # Feature 1: SIZE (area)
    area = w * h
    
    # Feature 2: INTENSITY (darkness) - lower value = darker
    gray_roi = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
    mean_intensity = np.mean(gray_roi)
    
    # Feature 3: CIRCULARITY (shape regularity)
    perimeter = cv2.arcLength(contour, True)
    if perimeter > 0:
        circularity = 4 * np.pi * cv2.contourArea(contour) / (perimeter ** 2)
    else:
        circularity = 0
    
    # Feature 4: ASPECT RATIO
    aspect_ratio = float(w) / h if h > 0 else 1.0
    
    # ========================================
    # HEURISTIC CLASSIFICATION RULES
    # ========================================
    # Dựa trên đặc điểm tế bào học:
    
    # N:C Ratio estimate: area càng lớn ~ N:C cao
    # Chromatin density: mean_intensity thấp = đậm (hyperchromasia)
    # Nuclear irregularity: circularity thấp = màng nhân không đều
    
    # ----------------------------------------
    # HSIL: Tiền ung thư (CIN2/3)
    # ----------------------------------------
    # - Nhân chiếm ≥50% diện tích tế bào → area rất lớn
    # - Chromatin đậm, thô, không đều → intensity rất thấp (<90)
    # - Màng nhân không đều, răng cưa → circularity rất thấp (<0.65)
    if area > 900 and mean_intensity < 90 and circularity < 0.65:
        return "HSIL"
    
    # ----------------------------------------
    # ASC-H: Nghi ngờ HSIL nhưng chưa chắc chắn
    # ----------------------------------------
    # - Nhân lớn, N:C tăng nhưng không cực kỳ cao
    # - Chromatin đậm (<100) 
    # - Màng nhân bất thường (circularity < 0.7)
    # - Hoặc có 2/3 đặc điểm của HSIL
    elif (area > 700 and mean_intensity < 100 and circularity < 0.7) or \
         (area > 800 and mean_intensity < 95) or \
         (area > 750 and circularity < 0.65):
        return "ASC-H"
    
    # ----------------------------------------
    # LSIL: HPV infection (CIN1)
    # ----------------------------------------
    # - Nhân phình to nhưng không cực độ (400-900)
    # - Chromatin tương đối đậm (75-110)
    # - N:C tăng nhưng thấp hơn HSIL
    # - Có thể có koilocytosis (perinuclear halo) → circularity trung bình
    elif 400 < area < 900 and 75 < mean_intensity < 110:
        return "LSIL"
    
    # ----------------------------------------
    # ASC-US: Bất thường nhưng không xác định
    # ----------------------------------------
    # - Nhân hơi to nhưng không vượt ngưỡng LSIL (<600)
    # - N:C < 50% → area nhỏ-trung bình
    # - Chromatin hơi thô nhưng không đậm (>85)
    # - Màng nhân tương đối tròn (circularity > 0.65)
    elif area < 600 and mean_intensity > 85 and circularity > 0.65:
        return "ASC-US"
    
    # ----------------------------------------
    # Default: ASC-US (uncertain cases)
    # ----------------------------------------
    else:
        return "ASC-US"


# =========================================
# DETECT CELL + NUCLEUS
# =========================================
def detect_multiclass(img, mode="both"):
    """
    Phát hiện nhân và/hoặc tế bào trong ảnh.
    
    Args:
        img: Ảnh đầu vào (numpy array, RGB)
        mode: Chế độ phát hiện
            - "both": Phát hiện cả nhân và tế bào (mặc định)
            - "nucleus_only": Chỉ phát hiện nhân
            - "cell_only": Chỉ phát hiện tế bào
    
    Returns:
        List of detections với format: {"label": str, "x": int, "y": int, "w": int, "h": int}
    """
    results = []

    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)

    # ===== Detect NUCLEI =====
    if mode in ["both", "nucleus_only"]:
        lower_nucleus = np.array([100, 40, 20])
        upper_nucleus = np.array([140, 255, 200])
        mask_nucleus = cv2.inRange(hsv, lower_nucleus, upper_nucleus)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask_nucleus = cv2.morphologyEx(mask_nucleus, cv2.MORPH_OPEN, kernel)

        contours_nucleus, _ = cv2.findContours(mask_nucleus, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours_nucleus:
            x, y, w, h = cv2.boundingRect(cnt)
            if 5 < w < 80 and 5 < h < 80:
                # Classify nucleus using heuristics
                classification = classify_nucleus_heuristic(img, x, y, w, h, cnt)
                
                results.append({
                    "label": "nucleus",
                    "x": int(x),
                    "y": int(y),
                    "w": int(w),
                    "h": int(h),
                    "classification": classification  # Auto-classification
                })

    # ===== Detect CELL AREA =====
    if mode in ["both", "cell_only"]:
        blurred = cv2.GaussianBlur(img, (11, 11), 0)
        gray = cv2.cvtColor(blurred, cv2.COLOR_RGB2GRAY)
        thresh = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            51, 2
        )

        contours_cell, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours_cell:
            x, y, w, h = cv2.boundingRect(cnt)
            if 30 < w < 300 and 30 < h < 300:
                results.append({
                    "label": "cell",
                    "x": int(x),
                    "y": int(y),
                    "w": int(w),
                    "h": int(h)
                })

    return results


# =========================================
# MAIN
# =========================================
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Phát hiện nhân và tế bào trong ảnh SVS/PNG/JPG")
    parser.add_argument("image_path", nargs="?", default="uploads/ASC-H_12-EES0348478.svs",
                        help="Đường dẫn đến file ảnh (SVS, PNG, JPG)")
    parser.add_argument("--mode", "-m", choices=["both", "nucleus_only", "cell_only"],
                        default="both",
                        help="Chế độ phát hiện: both (cả 2), nucleus_only (chỉ nhân), cell_only (chỉ tế bào)")
    
    args = parser.parse_args()
    image_path = args.image_path
    mode = args.mode

    in_path = Path(image_path)
    base_name = in_path.stem

    # File output
    json_output = f"{base_name}.json"
    png_output = f"{base_name}.png"

    print(">>> Đọc ảnh...")
    img, scale_factor = load_image_any(image_path)

    print(f">>> Detect multi-class (mode: {mode})...")
    detections = detect_multiclass(img, mode=mode)

    print(">>> Tổng số phát hiện:", len(detections))
    
    # Count by type
    nucleus_count = sum(1 for d in detections if d.get('label') == 'nucleus')
    cell_count = sum(1 for d in detections if d.get('label') == 'cell')
    print(f">>> - Nucleus: {nucleus_count}")
    print(f">>> - Cell: {cell_count}")

    # -------------------------
    # SCALE COORDINATES BACK TO ORIGINAL IMAGE SIZE
    # -------------------------
    if scale_factor > 1.0:
        print(f">>> Scaling coordinates back to original size (x{scale_factor:.2f})...")
        for det in detections:
            det['x'] = int(det['x'] * scale_factor)
            det['y'] = int(det['y'] * scale_factor)
            det['w'] = int(det['w'] * scale_factor)
            det['h'] = int(det['h'] * scale_factor)

    # -------------------------
    # SAVE JSON
    # -------------------------
    with open(json_output, "w", encoding="utf-8") as f:
        json.dump({"detections": detections}, f, indent=4, ensure_ascii=False)

    print(f">>> Saved JSON: {json_output}")

    # -------------------------
    # DRAW OUTPUT (no label text)
    # Note: Drawing on downsampled image for visualization
    # -------------------------
    img_draw = img.copy()

    for det in detections:
        # Use original (downsampled) coordinates for drawing
        x = int(det['x'] / scale_factor) if scale_factor > 1.0 else det['x']
        y = int(det['y'] / scale_factor) if scale_factor > 1.0 else det['y']
        w = int(det['w'] / scale_factor) if scale_factor > 1.0 else det['w']
        h = int(det['h'] / scale_factor) if scale_factor > 1.0 else det['h']
        
        cls = det["label"]
        color = (255, 0, 0) if cls == "cell" else (0, 255, 0)
        cv2.rectangle(img_draw, (x, y), (x + w, y + h), color, 2)

    cv2.imwrite(png_output, cv2.cvtColor(img_draw, cv2.COLOR_RGB2BGR))
    print(f">>> Saved PNG: {png_output}")