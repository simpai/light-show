import struct
import math
import numpy as np
import zipfile
import os

class ProjectExporter:
    def __init__(self, project_data):
        self.project = project_data
        self.step_time_ms = 20
        self.frame_interval = self.step_time_ms / 1000.0
        self.channel_count = 48
        
        # Determine duration from project or analysis
        if 'duration' in self.project and self.project['duration'] > 0:
            self.duration = self.project['duration'] / 1000.0
        elif 'analysis' in self.project and 'duration' in self.project['analysis']:
            self.duration = self.project['analysis']['duration']
        else:
            self.duration = 10.0 # Default
            
        self.frame_count = int(self.duration / self.frame_interval)

    def export(self, output_path, matrix_mode=False, matrix_config=None):
        """
        Export project to FSEQ file(s)
        If matrix_mode is True, creates a .zip with multiple .fseq files
        """
        if matrix_mode and matrix_config:
            return self.export_matrix(output_path, matrix_config)
        else:
            return self.export_single(output_path)

    def export_single(self, output_path):
        """Export a single FSEQ file"""
        # Initialize data grid
        data = np.zeros((self.frame_count, self.channel_count), dtype=np.uint8)
        
        # Render Layers
        for layer in self.project.get('layers', []):
            if layer.get('muted'): continue
            
            for clip in layer.get('clips', []):
                self._render_clip(clip, data)
                
        # Write FSEQ
        self._write_fseq(data, output_path)
        return output_path

    def export_matrix(self, output_path, matrix_config):
        """Export matrix mode as a .zip file with multiple .fseq files"""
        rows = matrix_config.get('rows', 10)
        cols = matrix_config.get('cols', 10)
        
        # Create temp directory for fseq files
        import tempfile
        temp_dir = tempfile.mkdtemp()
        
        try:
            # Generate base frame data (same for all cars for now)
            data = np.zeros((self.frame_count, self.channel_count), dtype=np.uint8)
            
            for layer in self.project.get('layers', []):
                if layer.get('muted'): continue
                for clip in layer.get('clips', []):
                    self._render_clip(clip, data)
            
            # Create .fseq file for each position
            fseq_files = []
            for r in range(rows):
                for c in range(cols):
                    # Position-based filename
                    filename = f"x{c}_y{r}.fseq"
                    filepath = os.path.join(temp_dir, filename)
                    
                    # For now, all cars get the same data
                    # In the future, we can add position-based variations
                    self._write_fseq(data, filepath)
                    fseq_files.append((filename, filepath))
            
            # Create zip file
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for filename, filepath in fseq_files:
                    zipf.write(filepath, filename)
            
            return output_path
            
        finally:
            # Cleanup temp files
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _render_clip(self, clip, data):
        start_ms = clip.get('startTime', 0)
        dur_ms = clip.get('duration', 1000)
        
        start_frame = int(start_ms / self.step_time_ms)
        end_frame = int((start_ms + dur_ms) / self.step_time_ms)
        
        # Clamp to bounds
        start_frame = max(0, start_frame)
        end_frame = min(self.frame_count, end_frame)
        
        if start_frame >= end_frame: return
        
        clip_type = clip.get('type', 'effect')
        channels = clip.get('channels', [])
        
        # Pre-calc fade
        fade_in_ms = clip.get('fadeIn', 0)
        fade_out_ms = clip.get('fadeOut', 0)
        
        for f in range(start_frame, end_frame):
            rel_time_ms = (f * self.step_time_ms) - start_ms
            
            # Intensity
            intensity = 1.0
            if rel_time_ms < fade_in_ms:
                intensity = rel_time_ms / fade_in_ms
            elif rel_time_ms > (dur_ms - fade_out_ms):
                intensity = (dur_ms - rel_time_ms) / fade_out_ms
                
            val = int(255 * intensity)
            
            # Effect Logic
            if clip_type == 'effect':
                eff_type = clip.get('effectType', 'flash')
                
                if eff_type == 'pulse':
                    freq = clip.get('speed', 1)
                    sine = (math.sin(rel_time_ms / 1000.0 * math.pi * 2 * freq) + 1) / 2
                    val = int(val * sine)
                elif eff_type == 'strobe':
                    # 10Hz strobe
                    if (f % 6) < 3: val = 0
                
                # Apply
                for ch in channels:
                    if ch < self.channel_count:
                        # Max blending
                        data[f, ch] = max(data[f, ch], val)
                        
            elif clip_type == 'pattern':
                # TODO: Implement Pattern/GIF logic backend side if needed
                # For now, just flash
                for ch in channels:
                    if ch < self.channel_count:
                        data[f, ch] = max(data[f, ch], val)

    def _write_fseq(self, data, path):
         with open(path, "wb") as f:
            f.write(b"PSEQ")
            f.write(struct.pack("<H", 24))
            f.write(struct.pack("<B", 0))
            f.write(struct.pack("<B", 2))
            f.write(struct.pack("<H", 0))
            f.write(struct.pack("<I", self.channel_count))
            f.write(struct.pack("<I", len(data)))
            f.write(struct.pack("<B", self.step_time_ms))
            f.write(struct.pack("<B", 0))
            f.write(struct.pack("<H", 0))
            f.write(struct.pack("<B", 0))
            f.write(struct.pack("<B", 0))
            f.write(data.tobytes())
