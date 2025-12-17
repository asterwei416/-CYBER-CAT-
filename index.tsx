import { GoogleGenAI, Schema, Type } from "@google/genai";

// --- Configuration & State ---
let stream: MediaStream | null = null;
let isProcessing = false;
let chartInstance: any = null;
let lastAnalysisData: any = null;

// Initialize Google GenAI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

// DOM Elements (Matches index.html IDs)
const video = document.getElementById('videoElement') as HTMLVideoElement;
const canvas = document.getElementById('snapshotCanvas') as HTMLCanvasElement;
const ctx = canvas?.getContext('2d');
const placeholder = document.getElementById('cameraPlaceholder');
const scanOverlay = document.getElementById('scanOverlay');
const flashOverlay = document.getElementById('flashOverlay');
const snapBtn = document.getElementById('snapBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const activateCamBtn = document.getElementById('activateCamBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const resultCard = document.getElementById('resultCard');

// Image Generation Elements
const generatedImageContainer = document.getElementById('generatedImageContainer');
const generatedImage = document.getElementById('generatedImage') as HTMLImageElement;
const imageLoader = document.getElementById('imageLoader');

// Schema for Structured Output
const catAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    isCat: { type: Type.BOOLEAN },
    title: { type: Type.STRING, description: "Traditional Chinese. Cool Sci-Fi Title for cat, or funny title for non-cat." },
    emoji: { type: Type.STRING },
    description: { 
      type: Type.STRING, 
      description: "Traditional Chinese. Analyze facial features/expressions and explain the combat power stats. Provide a detailed analysis, must be AT LEAST 100 characters." 
    },
    visualTraits: { type: Type.STRING, description: "Concise English description of visual appearance for image generation." },
    stats: {
      type: Type.OBJECT,
      properties: {
        cuteness: { type: Type.INTEGER },
        ferocity: { type: Type.INTEGER },
        agility: { type: Type.INTEGER },
        chaos: { type: Type.INTEGER },
        hunger: { type: Type.INTEGER },
        defense: { type: Type.INTEGER },
      }
    }
  },
  required: ["isCat", "title", "emoji", "description", "visualTraits", "stats"]
};

// --- Chart.js Setup ---
function initChart() {
  const chartEl = document.getElementById('radarChart') as HTMLCanvasElement;
  if (!chartEl) return;
  
  const chartCtx = chartEl.getContext('2d');
  // @ts-ignore
  const ChartRef = window.Chart;

  if (!ChartRef) {
      console.error("Chart.js not loaded");
      return;
  }

  ChartRef.defaults.font.family = "'Microsoft JhengHei', 'Orbitron', sans-serif";
  ChartRef.defaults.color = '#00f3ff';

  chartInstance = new ChartRef(chartCtx, {
    type: 'radar',
    data: {
      labels: ['萌殺力', '兇猛度', '敏捷度', '混沌值', '飢餓度', '防禦力'],
      datasets: [{
        label: 'SYNC RATE',
        data: [0, 0, 0, 0, 0, 0],
        backgroundColor: 'rgba(255, 0, 255, 0.2)',
        borderColor: '#ff00ff',
        pointBackgroundColor: '#000',
        pointBorderColor: '#00f3ff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: 'rgba(0, 243, 255, 0.2)' },
          grid: { color: 'rgba(0, 243, 255, 0.1)' },
          pointLabels: { font: { size: 10 }, color: '#00f3ff' },
          ticks: { display: false, backdropColor: 'transparent' },
          suggestedMin: 0,
          suggestedMax: 100
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// --- Camera Logic ---
async function startCamera() {
  try {
    updateStatus("初始化視覺傳感器...", "text-cyan-400");
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    // Wait for video to be ready
    video.onloadedmetadata = () => {
        video.play();
        placeholder!.classList.add('hidden');
        canvas.classList.add('hidden');
        video.classList.remove('hidden');
        snapBtn.disabled = false;
        updateStatus("視覺傳感器線上", "text-green-400");
    };
  } catch (err) {
    console.error(err);
    updateStatus("傳感器存取被拒", "text-red-500");
    alert("無法存取攝影機，請檢查權限");
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

function handleFileUpload() {
  if (fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx!.drawImage(img, 0, 0);
        canvas.classList.remove('hidden');
        video.classList.add('hidden');
        placeholder!.classList.add('hidden');
        stopCamera();
        snapBtn.disabled = false;
        updateStatus("外部檔案已載入", "text-yellow-400");
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(fileInput.files[0]);
  }
}

// --- Main Application Logic ---

async function snapAndAnalyze() {
  if (isProcessing) return;
  isProcessing = true;
  snapBtn.disabled = true;

  // 1. Capture Frame
  if (!video.classList.contains('hidden')) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx!.save();
    ctx!.scale(-1, 1); // Mirror for selfie cam
    ctx!.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx!.restore();
    video.pause();
  }

  // FX
  if(flashOverlay) {
      flashOverlay.style.opacity = '0.8';
      setTimeout(() => flashOverlay.style.opacity = '0', 150);
  }
  if(scanOverlay) scanOverlay.classList.remove('hidden');
  updateStatus("分析神經數據中...", "text-yellow-400");

  // 2. Process
  const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  
  try {
    // A. Text Analysis
    const analysisResult = await analyzeImageText(base64Image);
    renderAnalysisResult(analysisResult);
    
    // B. Auto Image Generation
    if(scanOverlay) scanOverlay.classList.add('hidden'); // Stop scanning effect
    await generateAvatar(analysisResult);

  } catch (error: any) {
    console.error(error);
    updateStatus("分析失敗: " + error.message, "text-red-500");
    alert("系統錯誤: " + error.message);
    // Only partial reset on error so user can try again
    isProcessing = false;
    snapBtn.disabled = false;
  } finally {
    isProcessing = false;
  }
}

async function analyzeImageText(base64: string) {
  // Enhanced prompt: explicitly asks for facial feature analysis linked to stats, AT LEAST 100 chars
  const prompt = `Analyze this image. If it's a cat (or human/pet), assign Cyberpunk RPG stats. 
  For the 'description' (Traditional Chinese):
  1. Analyze specific facial features or expressions.
  2. Explain why these features lead to the assigned stats.
  3. Be very descriptive and ensure the analysis is AT LEAST 100 characters long.`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/jpeg", data: base64 } }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: catAnalysisSchema
    }
  });
  
  if(!response.text) throw new Error("No response from AI");
  return JSON.parse(response.text);
}

async function generateAvatar(data: any) {
  if (!generatedImageContainer || !imageLoader || !generatedImage) return;

  generatedImageContainer.classList.remove('hidden');
  generatedImageContainer.classList.add('flex'); // Ensure flex for alignment
  imageLoader.classList.remove('hidden');
  generatedImage.classList.add('hidden');
  updateStatus("正在建構全息影像...", "text-pink-400");

  try {
    const visualTraits = data.visualTraits || "cyberpunk creature";
    
    const prompt = `A high-quality, vibrant cyberpunk cartoon sticker of ${visualTraits}. 
    Neon colors, bold lines, futuristic HUD elements in background. 
    Character: Cyberpunk Style. 
    Style: Vector art, Sticker style, detailed. 
    IMPORTANT: NO TEXT, NO CHARACTERS, NO WORDS in the image. Pure visual art only.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    let foundImage = false;
    for (const part of response.candidates![0].content.parts) {
      if (part.inlineData) {
        generatedImage.src = `data:image/png;base64,${part.inlineData.data}`;
        generatedImage.onload = () => {
           imageLoader.classList.add('hidden');
           generatedImage.classList.remove('hidden');
           updateStatus("全息影像完成", "text-green-400");
        };
        foundImage = true;
        break;
      }
    }
    if (!foundImage) throw new Error("No image data generated");

  } catch (err) {
    console.error("Image gen failed", err);
    updateStatus("影像生成失敗", "text-red-500");
    generatedImageContainer.classList.add('hidden');
  }
}

function renderAnalysisResult(data: any) {
  lastAnalysisData = data;
  
  if(resultCard) {
      resultCard.classList.remove('opacity-50', 'pointer-events-none');
  }
  
  resetBtn.disabled = false;
  resetBtn.classList.remove('bg-gray-900', 'text-gray-500');
  resetBtn.classList.add('bg-cyan-900', 'text-cyan-400');

  const titleEl = document.getElementById('catTitle');
  const emojiEl = document.getElementById('catEmoji');
  const descEl = document.getElementById('catDesc');
  const threatEl = document.getElementById('threatLevel');

  if(titleEl) titleEl.innerText = data.title;
  if(emojiEl) emojiEl.innerText = data.emoji;
  if(descEl) descEl.innerText = data.description;

  const threat = (data.stats.ferocity + data.stats.chaos) / 2;
  
  if(threatEl) {
      if (!data.isCat) {
        threatEl.innerText = "TRASH // 戰五渣";
        threatEl.className = "text-xl tech-font text-gray-500";
      } else if (threat > 80) {
        threatEl.innerText = "EXTREME // 極危";
        threatEl.className = "text-xl tech-font text-red-500 animate-pulse";
      } else {
        threatEl.innerText = "STABLE // 穩定";
        threatEl.className = "text-xl tech-font text-green-400";
      }
  }

  if (chartInstance) {
      chartInstance.data.datasets[0].data = [
        data.stats.cuteness, data.stats.ferocity, data.stats.agility,
        data.stats.chaos, data.stats.hunger, data.stats.defense
      ];
      chartInstance.update();
  }
}

function resetApp(fullReset = true) {
  if(scanOverlay) scanOverlay.classList.add('hidden');
  if(resultCard) resultCard.classList.add('opacity-50', 'pointer-events-none');
  if(generatedImageContainer) {
      generatedImageContainer.classList.add('hidden');
      generatedImageContainer.classList.remove('flex');
  }
  if(generatedImage) generatedImage.src = "";
  
  snapBtn.disabled = false;
  resetBtn.disabled = true;
  resetBtn.classList.add('bg-gray-900', 'text-gray-500');
  resetBtn.classList.remove('bg-cyan-900', 'text-cyan-400');

  if (fullReset) {
    if (stream) {
        video.play();
        video.classList.remove('hidden');
        canvas.classList.add('hidden');
    } else {
      video.classList.add('hidden');
      canvas.classList.add('hidden');
      if(placeholder) placeholder.classList.remove('hidden');
    }
  }
  updateStatus("系統待機中", "text-cyan-400");
}

function updateStatus(msg: string, colorClass: string) {
  const text = document.getElementById('statusText');
  if (text) {
    text.className = `font-bold text-sm bg-cyan-900/30 px-2 py-1 ${colorClass}`;
    text.innerText = msg;
  }
}

// Event Listeners
window.addEventListener('load', initChart);
if (activateCamBtn) activateCamBtn.addEventListener('click', startCamera);
if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput.click());
if (fileInput) fileInput.addEventListener('change', handleFileUpload);
if (snapBtn) snapBtn.addEventListener('click', snapAndAnalyze);
if (resetBtn) resetBtn.addEventListener('click', () => resetApp(true));
