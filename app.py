import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pyvips
import uuid

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

UPLOAD_FOLDER = 'uploads'
STATIC_FOLDER = 'static'

# Tạo folder nếu chưa tồn tại
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(STATIC_FOLDER, exist_ok=True)

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

    # Lưu file upload với tên random để tránh trùng
    file_ext = os.path.splitext(file.filename)[1]
    unique_id = str(uuid.uuid4())
    svs_path = os.path.join(UPLOAD_FOLDER, unique_id + file_ext)
    file.save(svs_path)

    # Convert sang DZI
    # DZI base name (NO .dzi)
    dzi_base = f"image_{unique_id}"
    dzi_path = os.path.join(STATIC_FOLDER, dzi_base)

    # Convert SVS -> DZI
    convert_svs_to_dzi(svs_path, dzi_path)

    # The .dzi file created is: static/image_<id>.dzi
    dzi_url = f"http://127.0.0.1:5000/static/{dzi_base}.dzi"

    return jsonify({"dzi_url": dzi_url})

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_FOLDER, filename)

if __name__ == '__main__':
    app.run(debug=True)