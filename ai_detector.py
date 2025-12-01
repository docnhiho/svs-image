import cv2
import numpy as np
from PIL import Image
import io
import pyvips

def detect_cells_demo(image_path):
    """
    Demo cell detection using computer vision (not real AI)
    Detects dark regions that might be cells
    Replace this with real AI model inference later
    """
    try:
        # Use pyvips to load large images (works for SVS, TIFF, etc.)
        img_vips = pyvips.Image.new_from_file(image_path)
        
        # Get image dimensions
        width = img_vips.width
        height = img_vips.height
        
        print(f"Original image size: {width} x {height}")
        
        # Downsample if image is too large (to avoid memory issues)
        max_dimension = 4000  # Maximum width or height for processing
        
        if width > max_dimension or height > max_dimension:
            scale = max_dimension / max(width, height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            
            print(f"Downsampling to: {new_width} x {new_height}")
            
            # Resize image
            img_vips = img_vips.resize(scale)
        else:
            new_width = width
            new_height = height
        
        # Convert to numpy array (RGB format)
        # Write to memory buffer first
        img_buffer = img_vips.write_to_memory()
        
        # Create numpy array from buffer
        img = np.frombuffer(img_buffer, dtype=np.uint8)
        img = img.reshape(img_vips.height, img_vips.width, img_vips.bands)
        
        # Convert RGB to BGR for OpenCV
        if img_vips.bands >= 3:
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        
        # Now process with OpenCV
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply threshold to find dark regions (cells are usually darker)
        _, thresh = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)
        
        # Apply morphological operations to clean up
        kernel = np.ones((5, 5), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Convert contours to bounding boxes in viewport coordinates (0-1 range)
        predictions = []
        cell_types = ['LSIL', 'HSIL', 'ASC-US', 'ASC-H', 'Normal', 'Abnormal']
        
        for i, contour in enumerate(contours):
            # Get bounding box
            x, y, w, h = cv2.boundingRect(contour)
            
            # Filter by size (cells should be reasonable size)
            area = w * h
            if area < 100 or area > 50000:  # Adjust based on image resolution
                continue
            
            # Convert to viewport coordinates (0-1 range)
            # Use original dimensions for viewport coordinates
            vp_x = (x / new_width) if new_width > 0 else 0
            vp_y = (y / new_height) if new_height > 0 else 0
            vp_w = (w / new_width) if new_width > 0 else 0
            vp_h = (h / new_height) if new_height > 0 else 0
            
            # Generate random confidence and cell type for demo
            confidence = np.random.uniform(0.7, 0.98)
            cell_type = np.random.choice(cell_types, p=[0.15, 0.1, 0.15, 0.1, 0.3, 0.2])
            
            prediction = {
                'geometry': {
                    'x': float(vp_x),
                    'y': float(vp_y),
                    'width': float(vp_w),
                    'height': float(vp_h)
                },
                'data': {
                    'id': f'ai_pred_{i}',
                    'type': 'ai_prediction',
                    'class': cell_type,
                    'confidence': float(confidence)
                }
            }
            predictions.append(prediction)
        
        print(f"Found {len(predictions)} potential cells")
        return predictions
        
    except Exception as e:
        print(f"Error in detect_cells_demo: {str(e)}")
        raise


def detect_cells_from_bytes(image_bytes):
    """
    Detect cells from image bytes
    """
    # Convert bytes to numpy array
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Cannot decode image")
    
    # Get image dimensions
    height, width = img.shape[:2]
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Apply threshold to find dark regions
    _, thresh = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)
    
    # Apply morphological operations
    kernel = np.ones((5, 5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Convert contours to bounding boxes
    predictions = []
    cell_types = ['LSIL', 'HSIL', 'ASC-US', 'ASC-H', 'Normal', 'Abnormal']
    
    for i, contour in enumerate(contours):
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        
        if area < 100 or area > 50000:
            continue
        
        vp_x = x / width
        vp_y = y / height
        vp_w = w / width
        vp_h = h / height
        
        confidence = np.random.uniform(0.7, 0.98)
        cell_type = np.random.choice(cell_types, p=[0.15, 0.1, 0.15, 0.1, 0.3, 0.2])
        
        prediction = {
            'geometry': {
                'x': float(vp_x),
                'y': float(vp_y),
                'width': float(vp_w),
                'height': float(vp_h)
            },
            'data': {
                'id': f'ai_pred_{i}',
                'type': 'ai_prediction',
                'class': cell_type,
                'confidence': float(confidence)
            }
        }
        predictions.append(prediction)
    
    return predictions
