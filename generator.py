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
            "frame_count": frame_count,
            "beat_times": beat_times,
            "onset_times": onset_times,
            "rms": rms,
            "rms_times": rms_times,
            "spectral_centroid": cent,
            "duration": duration
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
