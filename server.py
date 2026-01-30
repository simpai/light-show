from flask import Flask, request, send_file, jsonify, send_from_directory
from flask_cors import CORS
import os
import uuid
from generator import TeslaLightShowGenerator

app = Flask(__name__, static_folder='dist', static_url_path='/')
CORS(app)

UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

generator = TeslaLightShowGenerator()

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.route('/generate', methods=['POST'])
def generate():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # Save uploaded file
    file_id = str(uuid.uuid4())
    audio_ext = os.path.splitext(audio_file.filename)[1]
    audio_path = os.path.join(UPLOAD_FOLDER, f"{file_id}{audio_ext}")
    audio_file.save(audio_path)
    
    try:
        # Analyze and generate
        analysis = generator.analyze_audio(audio_path)
        output_filename = f"{file_id}.fseq"
        output_path = os.path.join(OUTPUT_FOLDER, output_filename)
        generator.generate_fseq(analysis, output_path)
        
        return jsonify({
            "success": True,
            "file_id": file_id,
            "duration": analysis["duration"],
            "frame_count": analysis["frame_count"]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/download/<file_id>', methods=['GET'])
def download(file_id):
    output_path = os.path.join(OUTPUT_FOLDER, f"{file_id}.fseq")
    if not os.path.exists(output_path):
        return jsonify({"error": "File not found"}), 404
    
    return send_file(output_path, as_attachment=True, download_name="lightshow.fseq")

if __name__ == '__main__':
    app.run(debug=True, port=5000)
