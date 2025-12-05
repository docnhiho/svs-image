import os
import shutil
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pyvips
import uuid


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

UPLOAD_FOLDER = 'uploads'
STATIC_FOLDER = 'static'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(STATIC_FOLDER, exist_ok=True)

def cleanup_folders():
    for folder in [UPLOAD_FOLDER, STATIC_FOLDER]:
        if not os.path.exists(folder):
            continue
        for filename in os.listdir(folder):
            file_path = os.path.join(folder, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                print(f'Failed to delete {file_path}. Reason: {e}')

def convert_svs_to_dzi(svs_path, dzi_path, tile_size=256, overlap=1):
    svs_image = pyvips.Image.new_from_file(svs_path)
    pyvips.Image.dzsave(svs_image, dzi_path, tile_size=tile_size, overlap=overlap)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Cleanup old files before saving new one -> DISABLED per user request
    # cleanup_folders()

    # Use original filename
    filename = file.filename
    # Get file extension
    file_ext = os.path.splitext(filename)[1].lower()
    name_without_ext = os.path.splitext(filename)[0]
    
    # Supported formats
    supported_formats = ['.svs', '.tif', '.tiff', '.jpg', '.jpeg', '.png', '.bmp', '.ndpi', '.vms', '.vmu', '.scn']
    
    if file_ext not in supported_formats:
        return jsonify({"error": f"Unsupported file format. Supported: {', '.join(supported_formats)}"}), 400
    
    image_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(image_path)

    try:
        # Convert sang DZI
        # DZI base name (NO .dzi)
        dzi_base = name_without_ext
        dzi_path = os.path.join(STATIC_FOLDER, dzi_base)

        # Convert image -> DZI (works for all pyvips supported formats)
        convert_svs_to_dzi(image_path, dzi_path)

        # The .dzi file created is: static/<name>.dzi
        dzi_url = f"http://127.0.0.1:5000/static/{dzi_base}.dzi"

        return jsonify({"dzi_url": dzi_url})
    except Exception as e:
        return jsonify({"error": f"Failed to convert image: {str(e)}"}), 500

@app.route('/save_annotations', methods=['POST'])
def save_annotations():
    data = request.json
    filename = data.get('filename')
    annotations = data.get('annotations')

    if not filename or not annotations:
        return jsonify({"error": "Missing filename or annotations"}), 400

    # Create JSON filename from SVS filename
    name_without_ext = os.path.splitext(filename)[0]
    json_filename = f"{name_without_ext}.json"
    json_path = os.path.join(UPLOAD_FOLDER, json_filename)

    import json
    try:
        with open(json_path, 'w') as f:
            json.dump(annotations, f, indent=2)
        return jsonify({"message": "Annotations saved successfully", "path": json_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/load_annotations', methods=['GET'])
def load_annotations():
    filename = request.args.get('filename')
    if not filename:
        return jsonify({"error": "Missing filename"}), 400

    name_without_ext = os.path.splitext(filename)[0]
    json_filename = f"{name_without_ext}.json"
    json_path = os.path.join(UPLOAD_FOLDER, json_filename)

    if not os.path.exists(json_path):
        return jsonify({"error": "Annotations not found"}), 404

    import json
    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
        
        # Get image dimensions for coordinate conversion
        image_path = os.path.join(UPLOAD_FOLDER, filename)
        if os.path.exists(image_path):
            try:
                img_vips = pyvips.Image.new_from_file(image_path)
                img_width = img_vips.width
                img_height = img_vips.height
            except:
                img_width = 1.0
                img_height = 1.0
        else:
            img_width = 1.0
            img_height = 1.0
        
        # Check for NEW format from detectSVS.py: {"detections": [...]}
        if isinstance(data, dict) and 'detections' in data:
            detections = data['detections']
            converted_annotations = []
            
            for i, det in enumerate(detections):
                label = det.get('label', 'nucleus')  # "nucleus" or "cell"
                x = det.get('x', 0)
                y = det.get('y', 0)
                w = det.get('w', 0)
                h = det.get('h', 0)
                
                # Convert to viewport coordinates (OpenSeadragon)
                # Normalize by img_width for both x and y
                converted = {
                    'geometry': {
                        'x': float(x) / img_width,
                        'y': float(y) / img_width,  # Divide by width!
                        'width': float(w) / img_width,
                        'height': float(h) / img_width  # Divide by width!
                    },
                    'data': {
                        'id': f'loaded_{i}',
                        'type': 'ai_prediction',
                        'class': 'Nucleus' if label == 'nucleus' else 'Cell',
                        'confidence': 0.95 if label == 'nucleus' else 0.90
                    }
                }
                converted_annotations.append(converted)
            
            print(f"Loaded {len(converted_annotations)} detections from detectSVS format")
            return jsonify(converted_annotations)
        
        # OLD format with confidence threshold
        CONFIDENCE_THRESHOLD = 0.8
        annotations = data  # data is already the list
        
        # Check if annotations are in bbox array format
        if annotations and isinstance(annotations, list) and len(annotations) > 0:
            first_item = annotations[0]
            
            # bbox format: {bbox: [x1, y1, x2, y2], score: float, class: int}
            if 'bbox' in first_item and isinstance(first_item['bbox'], list):
                converted_annotations = []
                class_names = {
                    0: 'Normal',
                    1: 'Abnormal', 
                    2: 'LSIL',
                    3: 'HSIL',
                    4: 'ASC-US',
                    5: 'ASC-H'
                }
                
                for i, item in enumerate(annotations):
                    score = item.get('score', 0.0)
                    if score < CONFIDENCE_THRESHOLD:
                        continue
                    
                    class_id = item.get('class', 0)
                    if class_id < 3:
                        continue
                    
                    bbox = item['bbox']
                    x1, y1, x2, y2 = bbox[0], bbox[1], bbox[2], bbox[3]
                    
                    x = x1
                    y = y1
                    width = x2 - x1
                    height = y2 - y1
                    
                    vp_x = x / img_width if img_width > 1 else x
                    vp_y = y / img_height if img_height > 1 else y
                    vp_w = width / img_width if img_width > 1 else width
                    vp_h = height / img_height if img_height > 1 else height
                    
                    class_name = class_names.get(class_id, 'Nucleus')
                    
                    converted = {
                        'geometry': {
                            'x': float(vp_x),
                            'y': float(vp_y),
                            'width': float(vp_w),
                            'height': float(vp_h)
                        },
                        'data': {
                            'id': f'loaded_{len(converted_annotations)}',
                            'type': 'nucleus',
                            'class': class_name,
                            'confidence': float(score)
                        }
                    }
                    converted_annotations.append(converted)
                
                print(f"Loaded {len(converted_annotations)} annotations (bbox format)")
                return jsonify(converted_annotations)
        
        # Frontend format or old format
        if annotations and isinstance(annotations, list):
            filtered = []
            for ann in annotations:
                # Already in frontend format? Just return as-is
                if 'geometry' in ann and 'data' in ann:
                    filtered.append(ann)
                    continue
                
                # Filter by confidence
                confidence = ann.get('data', {}).get('confidence', 1.0)
                if confidence < CONFIDENCE_THRESHOLD:
                    continue
                
                class_name = ann.get('data', {}).get('class', '')
                if class_name not in ['HSIL', 'ASC-US', 'ASC-H']:
                    continue
                
                filtered.append(ann)
            
            print(f"Loaded {len(filtered)} annotations")
            return jsonify(filtered)
        
        return jsonify(annotations if isinstance(annotations, list) else [])
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/static/<path:filename>')
def serve_static(filename):
    response = send_from_directory(STATIC_FOLDER, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
    return response

@app.route('/predict', methods=['POST'])
def predict_cells():
    """AI-powered nucleus and cell detection endpoint using detectSVS logic"""
    data = request.json
    filename = data.get('filename')
    
    if not filename:
        return jsonify({"error": "Missing filename"}), 400
    
    image_path = os.path.join(UPLOAD_FOLDER, filename)
    
    if not os.path.exists(image_path):
        return jsonify({"error": "Image file not found"}), 404
    
    try:
        # Import from detectSVS.py
        try:
            from detectSVS import load_image_any, detect_multiclass
        except ImportError as e:
            return jsonify({
                "error": "Required modules not installed. Run: pip install opencv-python openslide-python pyvips",
                "predictions": [],
                "count": 0
            }), 500
        
        # Load image (supports SVS, JPG, PNG, etc.)
        try:
            img, scale_factor = load_image_any(image_path)
        except Exception as e:
            return jsonify({"error": f"Failed to load image: {str(e)}"}), 500
        
        # Run detection (cell only - no nucleus)
        detections = detect_multiclass(img, mode="nucleus_only")
        
        # # Run detection
        # detections = detect_multiclass(img)

        # Scale coordinates back to original image size if needed
        if scale_factor > 1.0:
            for det in detections:
                det['x'] = int(det['x'] * scale_factor)
                det['y'] = int(det['y'] * scale_factor)
                det['w'] = int(det['w'] * scale_factor)
                det['h'] = int(det['h'] * scale_factor)
        
        # Get ORIGINAL image dimensions for coordinate conversion
        # We need to load the original image to get its actual dimensions
        try:
            img_vips_original = pyvips.Image.new_from_file(image_path)
            original_width = img_vips_original.width
            original_height = img_vips_original.height
        except:
            # Fallback: use detected image dimensions (already scaled)
            img_height, img_width = img.shape[:2]
            if scale_factor > 1.0:
                original_width = int(img_width * scale_factor)
                original_height = int(img_height * scale_factor)
            else:
                original_width = img_width
                original_height = img_height
        
        # Convert detections to frontend annotation format
        # OpenSeadragon uses viewport coordinates where width=1.0
        predictions = []
        
        for i, det in enumerate(detections):
            label = det.get('label', 'nucleus')
            x = det.get('x', 0)
            y = det.get('y', 0)
            w = det.get('w', 0)
            h = det.get('h', 0)
            classification = det.get('classification')  # Get auto-classification
            
            # Convert to viewport coordinates (normalize by original_width)
            prediction_data = {
                "geometry": {
                    "x": float(x) / original_width,
                    "y": float(y) / original_width,
                    "width": float(w) / original_width,
                    "height": float(h) / original_width
                },
                "data": {
                    "id": f"{label}_{i}_{hash((x, y, w, h))}",
                    "type": "ai_prediction",
                    "class": "Nucleus" if label == "nucleus" else "Cell",
                    "confidence": 0.95 if label == "nucleus" else 0.90
                }
            }
            
            # Add classification if it exists (for nucleus)
            if classification:
                prediction_data["data"]["classification"] = classification
            
            predictions.append(prediction_data)
        
        # Count by type
        nucleus_count = sum(1 for d in detections if d.get('label') == 'nucleus')
        cell_count = sum(1 for d in detections if d.get('label') == 'cell')
        
        return jsonify({
            "predictions": predictions,
            "count": len(predictions),
            "nucleus_count": nucleus_count,
            "cell_count": cell_count
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)
