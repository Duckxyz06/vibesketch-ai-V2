import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { Button } from './components/Button';
import { 
  AppStep, 
  GenerationConfig, 
  GeneratedTitle, 
  Scene 
} from './types';
import { 
  generateViralTitles, 
  generateScriptScenes, 
  generateDoodleImage,
  generateThumbnailImage,
  rewriteScript,
  generateSpeech
} from './services/openrouterService';

import { StepInput } from './components/StepInput';
import { StepTitles } from './components/StepTitles';
import { StepScript } from './components/StepScript';
import { StepVisuals } from './components/StepVisuals';
import { StepThumbnail } from './components/StepThumbnail';
import { StepAudio } from './components/StepAudio';

const App: React.FC = () => {
  // State
  const [step, setStep] = useState<AppStep>(AppStep.INPUT_TOPIC);
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Data State
  const [config, setConfig] = useState<GenerationConfig>({
    topic: '',
    tone: 'Stoic',
    duration: 'Short (60s)',
    aspectRatio: '9:16', // Default to Vertical/TikTok style
    language: 'Vietnamese'
  });
  const [titles, setTitles] = useState<GeneratedTitle[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  
  // Audio & Full Script State
  const [fullScript, setFullScript] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  
  // Cache State (To prevent regeneration on Next if not changed)
  const [lastGeneratedTopic, setLastGeneratedTopic] = useState<string>('');
  const [lastGeneratedTitleId, setLastGeneratedTitleId] = useState<string>('');
  
  // Thumbnail State
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(undefined);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);

  // Check API Key on Mount — support both env var and user-entered key
  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_api_key') || '';
    const envKey = process.env.OPENROUTER_API_KEY || '';
    const active = savedKey || envKey;
    if (active && active !== 'YOUR_OPENROUTER_API_KEY_HERE') {
      setApiKey(active);
      setApiKeyInput(active);
      setHasApiKey(true);
      // Inject into process.env so service can read it
      (window as any).__OPENROUTER_API_KEY__ = active;
    }
  }, []);

  const handleSaveKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    localStorage.setItem('openrouter_api_key', trimmed);
    setApiKey(trimmed);
    (window as any).__OPENROUTER_API_KEY__ = trimmed;
    setHasApiKey(true);
  };

  const handleClearKey = () => {
    localStorage.removeItem('openrouter_api_key');
    setApiKey('');
    setApiKeyInput('');
    setHasApiKey(false);
    (window as any).__OPENROUTER_API_KEY__ = '';
  };

  const handleConnectKey = () => {
    // scroll to key input on the landing screen - handled by renderContent
    setHasApiKey(false);
  };

  // --- IMPORT / EXPORT LOGIC ---

  const handleExportJSON = () => {
    const projectData = {
      version: "1.1",
      timestamp: new Date().toISOString(),
      state: {
        step,
        config,
        titles,
        scenes,
        thumbnailUrl,
        lastGeneratedTopic,
        lastGeneratedTitleId,
        fullScript // Saving text script
      }
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibesketch_${config.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'project'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (data && data.state) {
          const s = data.state;
          setConfig(s.config);
          setTitles(s.titles || []);
          setScenes((s.scenes || []).map((sc: Scene) => ({ ...sc, isGeneratingImage: false })));
          setThumbnailUrl(s.thumbnailUrl);
          setLastGeneratedTopic(s.lastGeneratedTopic || s.config.topic);
          setLastGeneratedTitleId(s.lastGeneratedTitleId || '');
          setFullScript(s.fullScript || '');
          setAudioUrl(undefined); // Cannot restore blob from JSON
          setAudioBlob(null);
          setStep(s.step);
          alert("Đã tải dự án thành công!");
        } else {
          alert("File JSON không hợp lệ.");
        }
      } catch (err) {
        console.error("Import error", err);
        alert("Lỗi khi đọc file.");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // --- GENERATION HANDLERS ---

  const handleGenerateTitles = async () => {
    if (titles.length > 0 && config.topic.trim() === lastGeneratedTopic.trim()) {
      setStep(AppStep.SELECT_TITLE);
      return;
    }

    setIsLoading(true);
    try {
      const generated = await generateViralTitles(config.topic, config.tone, config.language);
      setTitles(generated.map((t, i) => ({ id: `title-${i}`, text: t, selected: false })));
      setLastGeneratedTopic(config.topic.trim());
      setStep(AppStep.SELECT_TITLE);
    } catch (e) {
      alert("Lỗi tạo tiêu đề. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTitle = (id: string) => {
    setTitles(prev => prev.map(t => ({ ...t, selected: t.id === id })));
  };

  const handleGenerateScript = async () => {
    const selectedTitle = titles.find(t => t.selected);
    if (!selectedTitle) return;

    if (scenes.length > 0 && selectedTitle.id === lastGeneratedTitleId) {
      setStep(AppStep.REVIEW_SCRIPT);
      return;
    }

    setIsLoading(true);
    try {
      const generatedScenes = await generateScriptScenes(selectedTitle.text, config.duration, config.language);
      setScenes(generatedScenes);
      setLastGeneratedTitleId(selectedTitle.id);
      setStep(AppStep.REVIEW_SCRIPT);
    } catch (e) {
      alert("Lỗi tạo kịch bản.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartVisualGeneration = async () => {
    setStep(AppStep.GENERATE_VISUALS);
    
    for (const scene of scenes) {
        if (!scene.imageUrl) {
            setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, isGeneratingImage: true } : s));
            try {
                const imageUrl = await generateDoodleImage(scene.visualPrompt, scene.keywords, config.aspectRatio, config.language);
                setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, imageUrl, isGeneratingImage: false } : s));
                await new Promise(r => setTimeout(r, 2000));
            } catch (e: any) {
                console.error(`Error generating scene ${scene.id}`, e);
                setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, isGeneratingImage: false } : s));
            }
        }
    }
  };

  const handleRegenerateImage = async (id: string, prompt: string, keywords: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, isGeneratingImage: true } : s));
    try {
        const imageUrl = await generateDoodleImage(prompt, keywords, config.aspectRatio, config.language);
        setScenes(prev => prev.map(s => s.id === id ? { ...s, imageUrl, isGeneratingImage: false } : s));
    } catch (e) {
        console.error(e);
        alert("Máy chủ OpenRouter đang quá tải. Vui lòng thử lại sau giây lát.");
        setScenes(prev => prev.map(s => s.id === id ? { ...s, isGeneratingImage: false } : s));
    }
  };
  
  const handleMoveToThumbnail = async () => {
      setStep(AppStep.GENERATE_THUMBNAIL);
      if (!thumbnailUrl) {
          handleGenerateThumbnail();
      }
  };

  const handleGenerateThumbnail = async () => {
      setIsGeneratingThumbnail(true);
      const selectedTitle = titles.find(t => t.selected);
      const visualMetaphor = scenes.length > 0 ? scenes[0].visualPrompt : "";
      
      try {
          const url = await generateThumbnailImage(selectedTitle?.text || config.topic, visualMetaphor, config.aspectRatio);
          setThumbnailUrl(url);
      } catch (e) {
          console.error(e);
          alert("Lỗi tạo thumbnail.");
      } finally {
          setIsGeneratingThumbnail(false);
      }
  };

  // --- AUDIO LOGIC ---

  const handleMoveToAudio = () => {
    setStep(AppStep.GENERATE_AUDIO);
    // If no full script exists yet, create it from scenes
    if (!fullScript) {
      const combined = scenes.map(s => s.voiceover).join(' ');
      setFullScript(combined);
    }
  };

  const handleRewriteScript = async (mode: 'longer' | 'shorter') => {
    setIsRewriting(true);
    try {
      const newText = await rewriteScript(fullScript, mode, config.language);
      setFullScript(newText);
    } catch (e) {
      alert("Lỗi viết lại kịch bản.");
    } finally {
      setIsRewriting(false);
    }
  };

  const handleGenerateAudio = async () => {
    setIsLoading(true);
    try {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      const blob = await generateSpeech(fullScript, config.language);
      if (blob) {
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      } else {
        alert("Không thể tạo âm thanh. Thử lại sau.");
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi khi tạo audio.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportZip = async () => {
    const zip = new JSZip();
    const folderName = config.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folder = zip.folder(folderName);
    
    if (!folder) return;

    // 1. Script File
    let scriptContent = `TITLE: ${titles.find(t=>t.selected)?.text}\n`;
    scriptContent += `LANGUAGE: ${config.language}\n`;
    scriptContent += `ASPECT RATIO: ${config.aspectRatio}\n\n`;
    scriptContent += `--- FULL VOICEOVER SCRIPT ---\n${fullScript}\n\n`;
    scriptContent += `--- SCENES ---\n`;
    scenes.forEach((scene, idx) => {
        scriptContent += `SCENE ${idx + 1} (${scene.keywords}):\nVOICEOVER: ${scene.voiceover}\nPROMPT: ${scene.visualPrompt}\n\n`;
    });
    folder.file("script.txt", scriptContent);

    // 2. Images
    scenes.forEach((scene, idx) => {
        if (scene.imageUrl) {
            const base64Data = scene.imageUrl.split(',')[1];
            folder.file(`scene_${idx + 1}.png`, base64Data, { base64: true });
        }
    });

    // 3. Thumbnail
    if (thumbnailUrl) {
        const base64Data = thumbnailUrl.split(',')[1];
        folder.file("thumbnail.png", base64Data, { base64: true });
    }

    // 4. Audio
    if (audioBlob) {
      folder.file("voiceover.wav", audioBlob);
    }

    try {
        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${folderName}_vibe_project.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Error creating zip", e);
        alert("Có lỗi khi nén file.");
    }
  };

  const renderContent = () => {
    if (!hasApiKey) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-16 animate-fade-in">
                <div className="bg-white/70 backdrop-blur-sm border-2 border-ink/10 rounded-2xl p-10 shadow-lg max-w-md w-full flex flex-col gap-6">
                    {/* Logo */}
                    <div className="text-center">
                        <div className="w-16 h-16 bg-ink rounded-xl flex items-center justify-center mx-auto mb-4 transform -rotate-3 shadow-md">
                            <svg className="w-8 h-8 text-paper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </div>
                        <h2 className="font-hand text-3xl font-bold text-ink">Nhập API Key</h2>
                        <p className="font-sans text-sm text-gray-500 mt-1">
                            Lấy key miễn phí tại{' '}
                            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline text-accent font-semibold">openrouter.ai/keys</a>
                        </p>
                    </div>

                    {/* Input */}
                    <div className="flex flex-col gap-3">
                        <label className="font-hand text-lg text-ink font-bold">OpenRouter API Key</label>
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                            placeholder="sk-or-v1-..."
                            className="w-full px-4 py-3 rounded-xl border-2 border-ink/20 bg-paper font-sans text-sm focus:border-ink outline-none transition-colors shadow-inner"
                        />
                        <Button onClick={handleSaveKey} disabled={!apiKeyInput.trim()} className="w-full">
                            🚀 Bắt đầu tạo video
                        </Button>
                    </div>

                    {/* Info */}
                    <div className="bg-ink/5 rounded-xl p-4 font-sans text-xs text-gray-500 space-y-1">
                        <p>🔒 Key được lưu trong trình duyệt của bạn (localStorage), không gửi đi đâu khác.</p>
                        <p>💡 Hỗ trợ cả Gemini Flash, GPT-4o, FLUX.1 và hơn 300 model khác qua OpenRouter.</p>
                    </div>
                </div>
            </div>
        );
    }

    switch (step) {
      case AppStep.INPUT_TOPIC:
        return (
          <StepInput 
            config={config} 
            setConfig={setConfig} 
            onNext={handleGenerateTitles} 
            isLoading={isLoading} 
          />
        );
      case AppStep.SELECT_TITLE:
        return (
          <StepTitles 
            titles={titles} 
            onSelect={handleSelectTitle} 
            onNext={handleGenerateScript} 
            onBack={() => setStep(AppStep.INPUT_TOPIC)}
            isLoading={isLoading} 
          />
        );
      case AppStep.REVIEW_SCRIPT:
        return (
          <StepScript 
            scenes={scenes} 
            setScenes={setScenes} 
            onNext={handleStartVisualGeneration} 
            onBack={() => setStep(AppStep.SELECT_TITLE)}
            isLoading={isLoading} 
          />
        );
      case AppStep.GENERATE_VISUALS:
        return (
          <StepVisuals 
            scenes={scenes}
            regenerateImage={handleRegenerateImage}
            onNext={handleMoveToThumbnail}
            onBack={() => setStep(AppStep.REVIEW_SCRIPT)}
            aspectRatio={config.aspectRatio}
          />
        );
      case AppStep.GENERATE_THUMBNAIL:
        return (
            <StepThumbnail 
                thumbnailUrl={thumbnailUrl}
                isGenerating={isGeneratingThumbnail}
                onRegenerate={handleGenerateThumbnail}
                onExportZip={handleMoveToAudio} // Change: Go to Audio instead of immediate zip
                onBack={() => setStep(AppStep.GENERATE_VISUALS)}
                aspectRatio={config.aspectRatio}
            />
        );
      case AppStep.GENERATE_AUDIO:
        return (
          <StepAudio 
            script={fullScript}
            setScript={setFullScript}
            audioUrl={audioUrl}
            onGenerateAudio={handleGenerateAudio}
            onRewrite={handleRewriteScript}
            onExportZip={handleExportZip}
            onBack={() => setStep(AppStep.GENERATE_THUMBNAIL)}
            isLoading={isLoading}
            isRewriting={isRewriting}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen paper-texture flex flex-col">
      <header className="w-full p-6 border-b-2 border-gray-200/50 flex justify-between items-center bg-white/60 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-ink rounded-lg flex items-center justify-center transform -rotate-3">
            <svg className="w-6 h-6 text-paper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <h1 className="font-hand text-3xl font-bold text-ink tracking-wide">VibeSketch AI</h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
             {/* Import/Export Buttons */}
             <div className="flex gap-2 mr-2">
               <input 
                 type="file" 
                 ref={fileInputRef} 
                 onChange={handleFileChange} 
                 accept=".json" 
                 className="hidden" 
               />
               <button 
                 onClick={handleImportClick}
                 className="p-2 text-ink hover:bg-black/5 rounded-full transition-colors tooltip"
                 title="Mở Project (JSON)"
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
               </button>
               <button 
                 onClick={handleExportJSON}
                 className="p-2 text-ink hover:bg-black/5 rounded-full transition-colors tooltip"
                 title="Lưu Project (JSON)"
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-4 4m0 0l-4-4m4 4V4"></path></svg>
               </button>
             </div>

             {hasApiKey && (
                 <div className="hidden lg:flex gap-4 text-sm font-sans font-semibold text-gray-500 mr-4">
                    <span className={step === AppStep.INPUT_TOPIC ? "text-ink underline decoration-2 underline-offset-4" : ""}>1. Chủ đề</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.SELECT_TITLE ? "text-ink underline decoration-2 underline-offset-4" : ""}>2. Tiêu đề</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.REVIEW_SCRIPT ? "text-ink underline decoration-2 underline-offset-4" : ""}>3. Kịch bản</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.GENERATE_VISUALS ? "text-ink underline decoration-2 underline-offset-4" : ""}>4. Hình ảnh</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.GENERATE_THUMBNAIL ? "text-ink underline decoration-2 underline-offset-4" : ""}>5. Bìa</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.GENERATE_AUDIO ? "text-ink underline decoration-2 underline-offset-4" : ""}>6. Audio</span>
                 </div>
             )}
             
             <button
               onClick={handleClearKey}
               title="Đổi API Key"
               className="flex items-center gap-1.5 text-xs font-sans text-gray-400 hover:text-accent transition-colors px-3 py-1.5 rounded-full border border-gray-200 hover:border-accent/40"
             >
               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
               {hasApiKey ? 'Đổi Key' : 'Nhập Key'}
             </button>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-start p-6 md:p-12 w-full">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;