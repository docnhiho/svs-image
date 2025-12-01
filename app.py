import os
import shutil
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pyvips
import uuid
# Temporarily commented until opencv is installed in venv
# from ai_detector import detect_cells_demo

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
            annotations = json.load(f)
        return jsonify(annotations)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/static/<path:filename>')
def serve_static(filename):
    response = send_from_directory(STATIC_FOLDER, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
    return response

@app.route('/predict', methods=['POST'])
def predict_cells():
    """AI-powered cell detection endpoint"""
    data = request.json
    filename = data.get('filename')
    
    if not filename:
        return jsonify({"error": "Missing filename"}), 400
    
    image_path = os.path.join(UPLOAD_FOLDER, filename)
    
    if not os.path.exists(image_path):
        return jsonify({"error": "Image file not found"}), 404
    
    try:
        # Import here to avoid startup error
        try:
            from ai_detector import detect_cells_demo
        except ImportError as e:
            return jsonify({
                "error": "OpenCV not installed. Run: pip install opencv-python numpy",
                "predictions": [],
                "count": 0
            }), 500
        
        # Run AI detection
        predictions = detect_cells_demo(image_path)
        
        return jsonify({
            "predictions": predictions,
            "count": len(predictions)
        })
    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)
