import { useState } from 'react'
import JSZip from 'jszip'
import EditorApp from './components/EditorApp'
import FseqViewer from './components/FseqViewer'
import './App.css'

function App() {
  const [mode, setMode] = useState(() => {
    return window.location.pathname === '/fseq-viewer' ? 'fseq-viewer' : 'editor';
  });

  // States used by Editor/Viewer
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)

  const handleBundleChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.name.endsWith('.ls')) {
      setLoading(true);
      setError(null);
      try {
        const zip = await JSZip.loadAsync(selectedFile);

        // 1. Load project.json
        const jsonFile = zip.file("project.json");
        if (!jsonFile) throw new Error("Not a valid lightshow bundle (missing project.json)");

        const jsonText = await jsonFile.async("string");
        const data = JSON.parse(jsonText);

        // 2. Load Audio from bundle
        const audioName = data.audioFileName;
        if (audioName) {
          const audioInZip = zip.file(audioName);
          if (audioInZip) {
            const audioBlob = await audioInZip.async("blob");
            const audioFileObj = new File([audioBlob], audioName, { type: audioBlob.type });
            setFile(audioFileObj);
          }
        }

        setAnalysisData(data);
        setMode('editor');
      } catch (err) {
        setError("Failed to load project bundle: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  if (mode === 'editor') {
    return (
      <EditorApp
        audioFile={file}
        analysis={analysisData}
        bundledData={analysisData}
        onExit={() => setMode('fseq-viewer')}
        onChangeMode={setMode}
      />
    );
  }

  if (mode === 'fseq-viewer') {
    return (
      <FseqViewer />
    );
  }

  return (
    <div className="editor-fallback">
      Redirecting to editor...
    </div>
  )
}

export default App
