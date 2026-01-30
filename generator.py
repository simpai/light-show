import os
import struct
import numpy as np
import librosa
import soundfile as sf
import datetime

class TeslaLightShowGenerator:
    def __init__(self, step_time_ms=20):
        self.step_time_ms = step_time_ms
        self.frame_interval = step_time_ms / 1000.0
        self.channel_count = 48 # Base channels for standard models
        
    def analyze_audio(self, audio_path):
        print(f"Analyzing audio: {audio_path}")
        y, sr = librosa.load(audio_path, sr=44100)
        
        # Get duration and frame count
        duration = librosa.get_duration(y=y, sr=sr)
        frame_count = int(duration / self.frame_interval)
        
        # Extract features
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beats, sr=sr)
        
        # Onsets (sharp peaks like snares/claps)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        onset_times = librosa.frames_to_time(onsets, sr=sr)
        
        # RMS Energy (loudness)
        rms = librosa.feature.rms(y=y)[0]
        rms_times = librosa.frames_to_time(range(len(rms)), sr=sr)
        
        # Spectral Centroid (brightness/high freq)
        cent = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        
        return {
            "frame_count": int(frame_count),
            "beat_times": beat_times.tolist(),
            "onset_times": onset_times.tolist(),
            "rms": rms.tolist(),
            "rms_times": rms_times.tolist(),
            "spectral_centroid": cent.tolist(),
            "duration": float(duration)
        }

    def generate_fseq(self, analysis, output_path):
        frame_count = analysis["frame_count"]
        # Light data: frame_count rows, channel_count columns
        # Initialize with zeros
        data = np.zeros((frame_count, self.channel_count), dtype=np.uint8)
        
        # 1. Map Beats to Tail Lights (Channels 26, 27) and Signature (5, 6)
        for t in analysis["beat_times"]:
            frame = int(t / self.frame_interval)
            if frame < frame_count:
                # Flash for 5 frames (100ms)
                end_frame = min(frame + 5, frame_count)
                data[frame:end_frame, 25] = 255 # Tail L (0-indexed 25)
                data[frame:end_frame, 26] = 255 # Tail R (0-indexed 26)
                data[frame:end_frame, 4] = 255  # Signature L (0-indexed 4)
                data[frame:end_frame, 5] = 255  # Signature R (0-indexed 5)

        # 2. Map Onsets to Main Beams (Channels 1-4)
        for t in analysis["onset_times"]:
            frame = int(t / self.frame_interval)
            if frame < frame_count:
                # Short flash for 3 frames (60ms)
                end_frame = min(frame + 3, frame_count)
                data[frame:end_frame, 0:4] = 255 # Beams

        # 3. Use RMS for Fog Lights (Channels 15, 16) - threshold-based
        # Resample RMS to match frame count
        rms_resampled = np.interp(
            np.linspace(0, analysis["duration"], frame_count),
            analysis["rms_times"],
            analysis["rms"]
        )
        rms_threshold = np.mean(rms_resampled) * 1.5
        for f in range(frame_count):
            if rms_resampled[f] > rms_threshold:
                data[f, 14] = 255 # Fog L (0-indexed 14)
                data[f, 15] = 255 # Fog R (0-indexed 15)

        # 4. Use Spectral Centroid for Turn Signals (Channels 13, 14)
        # Highly "bright" sounds trigger turn signals
        cent_resampled = np.interp(
            np.linspace(0, analysis["duration"], frame_count),
            analysis["rms_times"],
            analysis["spectral_centroid"]
        )
        cent_threshold = np.percentile(cent_resampled, 90)
        for f in range(frame_count):
            if cent_resampled[f] > cent_threshold:
                # Alternate L/R
                if (f // 10) % 2 == 0:
                    data[f, 12] = 255 # Turn L (0-indexed 12)
                else:
                    data[f, 13] = 255 # Turn R (0-indexed 13)

        # Write binary file
        # Header: PSEQ (4), start_offset (2), minor (1), major (1), fixed (2), 
        # channel_count (4), frame_count (4), step_time (1), others...
        # Total header size should be 24 (min)
        
        with open(output_path, "wb") as f:
            f.write(b"PSEQ")
            f.write(struct.pack("<H", 24)) # Start offset
            f.write(struct.pack("<B", 0))  # Minor version
            f.write(struct.pack("<B", 2))  # Major version
            f.write(struct.pack("<H", 0))  # Fixed
            f.write(struct.pack("<I", self.channel_count))
            f.write(struct.pack("<I", frame_count))
            f.write(struct.pack("<B", self.step_time_ms))
            f.write(struct.pack("<B", 0))  # Encoding
            f.write(struct.pack("<H", 0))  # Reserved
            f.write(struct.pack("<B", 0))  # Compression
            f.write(struct.pack("<B", 0))  # Reserved
            
            # Data: Row-major (all channels for frame 0, then frame 1...)
            # We want to ensure it's V2 Uncompressed
            f.write(data.tobytes())
            
        print(f"Successfully generated {output_path}")
        print(f"Total frames: {frame_count}, Duration: {datetime.timedelta(seconds=analysis['duration'])}")

    def generate_matrix_show(self, analysis, output_dir, rows=10, cols=10):
        frame_count = analysis["frame_count"]
        # Grid state: [frames, rows, cols]
        # We'll use a simplified normalized intensity 0.0-1.0
        grid_intensity = np.zeros((frame_count, rows, cols))
        
        center_r, center_c = rows / 2, cols / 2
        max_dist = np.sqrt(center_r**2 + center_c**2)
        
        # 1. Beat Ripple Effect
        # For each beat, expand a ring
        beat_frames = [int(t / self.frame_interval) for t in analysis["beat_times"]]
        for t_frame in beat_frames:
            # Effect lasts 20 frames (~400ms)
            for i in range(20):
                curr_frame = t_frame + i
                if curr_frame >= frame_count: break
                
                # Radius expands
                radius = (i / 20.0) * max_dist * 1.5
                thickness = 1.5
                
                # Check all cells
                for r in range(rows):
                    for c in range(cols):
                        dist = np.sqrt((r - center_r)**2 + (c - center_c)**2)
                        if abs(dist - radius) < thickness:
                            grid_intensity[curr_frame, r, c] += 0.8

        # 2. Spectral Centroid Vertical Sweep
        # Map centroid to horizontal position or vertical sweep
        cent_resampled = np.interp(
            np.linspace(0, analysis["duration"], frame_count),
            analysis["rms_times"],
            analysis["spectral_centroid"]
        )
        # Normalize centroid 0-1
        cent_min, cent_max = np.min(cent_resampled), np.max(cent_resampled)
        if cent_max > cent_min:
            cent_norm = (cent_resampled - cent_min) / (cent_max - cent_min)
        else:
            cent_norm = np.zeros(frame_count)
            
        for f in range(frame_count):
            # Bar moves from left to right based on frequency height
            # Or simplified: Active column based on frequency
            active_col = int(cent_norm[f] * (cols - 1))
            grid_intensity[f, :, active_col] += 0.5

        # 3. RMS Global Flash
        rms_resampled = np.interp(
            np.linspace(0, analysis["duration"], frame_count),
            analysis["rms_times"],
            analysis["rms"]
        )
        rms_threshold = np.mean(rms_resampled) * 2.0
        
        # Clamp values
        np.clip(grid_intensity, 0, 1, out=grid_intensity)

        # Generate files for each car
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        print(f"Generating matrix show {rows}x{cols}...")
        
        for r in range(rows):
            for c in range(cols):
                # Init car data
                data = np.zeros((frame_count, self.channel_count), dtype=np.uint8)
                
                for f in range(frame_count):
                    val = grid_intensity[f, r, c]
                    
                    # Global RMS override for high energy
                    if rms_resampled[f] > rms_threshold:
                        val = 1.0
                        
                    if val > 0.1:
                        # Map intensity to different lights based on threshold
                        # Low intensity: Signature lights
                        data[f, 4] = 255 # Sig L
                        data[f, 5] = 255 # Sig R
                        
                        # High intensity: Main Beams + Fog
                        if val > 0.5:
                            data[f, 0:4] = 255 # Beams
                            data[f, 14] = 255 # Fog L
                            data[f, 15] = 255 # Fog R
                
                # Write individual file
                filename = f"{r}_{c}.fseq"
                path = os.path.join(output_dir, filename)
                self._write_fseq_file(data, path)
                
    def _write_fseq_file(self, data, path):
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

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python generator.py <audio_file>")
        sys.exit(1)
        
    generator = TeslaLightShowGenerator()
    audio_file = sys.argv[1]
    output_fseq = "lightshow.fseq"
    
    analysis = generator.analyze_audio(audio_file)
    generator.generate_fseq(analysis, output_fseq)
