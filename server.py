from flask import Flask, request, send_file, jsonify, send_from_directory
from flask_cors import CORS
import os
import uuid
import zipfile
import shutil
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
    
    mode = request.form.get('mode', 'single')
    
    # Save uploaded file
    file_id = str(uuid.uuid4())
    audio_ext = os.path.splitext(audio_file.filename)[1]
    audio_path = os.path.join(UPLOAD_FOLDER, f"{file_id}{audio_ext}")
    audio_file.save(audio_path)
    
    try:
        # Analyze
        analysis = generator.analyze_audio(audio_path)
        
        if mode == 'matrix':
            rows = int(request.form.get('rows', 10))
            cols = int(request.form.get('cols', 10))
            
            matrix_dir = os.path.join(OUTPUT_FOLDER, f"{file_id}_matrix")
            generator.generate_matrix_show(analysis, matrix_dir, rows, cols)
            
            # Zip the result
            zip_path = os.path.join(OUTPUT_FOLDER, f"{file_id}.zip")
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(matrix_dir):
                    for file in files:
                        zipf.write(os.path.join(root, file), file)
            
            # Cleanup raw files
            shutil.rmtree(matrix_dir)
            
        else:
            output_filename = f"{file_id}.fseq"
            output_path = os.path.join(OUTPUT_FOLDER, output_filename)
            generator.generate_fseq(analysis, output_path)
        
        return jsonify({
            "success": True,
            "file_id": file_id,
            "duration": analysis["duration"],
            "frame_count": analysis["frame_count"],
            "mode": mode
        })
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze():
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
        analysis = generator.analyze_audio(audio_path)
        return jsonify({
            "success": True,
            "file_id": file_id,
            "analysis": analysis
        })
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/download/<file_id>', methods=['GET'])
def download_file(file_id):
    # Try both extensions
    for ext in ['.fseq', '.zip']:
        file_path = os.path.join(OUTPUT_FOLDER, f"{file_id}{ext}")
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True, download_name=f"lightshow{ext}")
    
    return jsonify({"error": "File not found"}), 404

from exporter import ProjectExporter

@app.route('/export', methods=['POST'])
def export_show():
    data = request.json
    if not data or 'project' not in data:
        return jsonify({"error": "Invalid project data"}), 400
        
    project = data['project']
    matrix_mode = data.get('matrixMode', False)
    matrix_config = data.get('matrixConfig', {'rows': 10, 'cols': 10})
    
    # Generate ID
    file_id = str(uuid.uuid4())
    
    # Choose file extension based on mode
    ext = '.zip' if matrix_mode else '.fseq'
    output_path = os.path.join(OUTPUT_FOLDER, f"{file_id}{ext}")
    
    try:
        exporter = ProjectExporter(project)
        exporter.export(output_path, matrix_mode=matrix_mode, matrix_config=matrix_config)
        
        return jsonify({
            "success": True,
            "file_id": file_id,
            "extension": ext
        })
    except Exception as e:
        print(e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
