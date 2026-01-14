// frontend/components/VoicePanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { diffWords } from "diff";
import { supabaseBrowser } from "@/app/lib/supabaseClient";
import "@/app/styles/voice.css"; // Pastikan file CSS ini ada dan sesuai

type ToastType = "success" | "error" | "info";
type Maybe<T> = T | null;
// NEW: Define upload status types
type UploadStatus = "idle" | "uploading" | "queued" | "transcribing" | "summarizing" | "complete" | "error";


const BACKEND_ORIGIN =
  process.env.NEXT_PUBLIC_BACKEND_ORIGIN || "http://127.0.0.1:5001";

const LS_LAST_SUMMARY_KEY = "vt2_last_summary";
const AUTO_CLEAR_HL_MS = 8000;

function mdToHtml(text: string) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function renderDiff(prev: string, next: string, el: HTMLElement, clearTimerRef: React.MutableRefObject<any>) {
  if (!el) return;
  if ((prev || "") === (next || "")) {
    el.innerHTML = mdToHtml(next || "");
    return;
  }
  let start = 0;
  while (start < prev.length && prev[start] === next[start]) start++;
  let endPrev = prev.length - 1;
  let endNext = next.length - 1;
  while (endPrev >= start && endNext >= start && prev[endPrev] === next[endNext]) {
    endPrev--;
    endNext--;
  }
  const prefix = next.slice(0, start);
  const mid = next.slice(start, endNext + 1);
  const suffix = next.slice(endNext + 1);

  let html = mdToHtml(prefix);
  if (mid) html += `<span class="hl-add">${mdToHtml(mid)}</span>`;
  html += mdToHtml(suffix);
  el.innerHTML = html;
}

function replaceSpokenPunctuation(text: string) {
  return (text || "")
    .replace(/\btitik\b/gi, ".")
    .replace(/\bkoma\b/gi, ",")
    .replace(/\btanda tanya\b/gi, "?")
    .replace(/\btanda seru\b/gi, "!")
    .replace(/\btitik dua\b/gi, ":")
    .replace(/\btitik koma\b/gi, ";");
}

export default function VoicePanel() {
  const router = useRouter();
  const socketRef = useRef<Maybe<Socket>>(null);
  const recognitionRef = useRef<any>(null);
  const summaryEditorRef = useRef<HTMLDivElement>(null);
  const fullTranscriptRef = useRef<string>("");
  const lastFinalSummaryRef = useRef<string>("");
  const clearHlTimerRef = useRef<any>(null);
  const autoSummarizeTimerRef = useRef<any>(null);
  const summarizeInFlightRef = useRef<boolean>(false);
  const currentModeRef = useRef<string>("default");
  // NEW: Ref for polling interval
  const pollIntervalRef = useRef<any>(null);


  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Menyambungkan...");
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  // NEW: State for upload process
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadJobId, setUploadJobId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("default");
  
  const showToast = (msg: string, type: ToastType = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const scheduleAutoSummarize = (text: string) => {
    if (autoSummarizeTimerRef.current) clearTimeout(autoSummarizeTimerRef.current);
    autoSummarizeTimerRef.current = setTimeout(() => {
      const currentTranscript = text.trim();
      if (currentTranscript.length > 50 && !summarizeInFlightRef.current) {
        requestSummarize(currentTranscript, false);
      }
    }, 1000);
  };
  
  useEffect(() => {
    let mounted = true;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted && user) {
        setUserId(user.id);
      }
    })();
    
    fetch(`${BACKEND_ORIGIN}/get_summary_mode`)
      .then((r) => r.json())
      .then((data) => { if (data.mode) { currentModeRef.current = data.mode; setSelectedMode(data.mode); } })
      .catch((err) => console.error("Gagal mengambil mode:", err));

    const socket = io(BACKEND_ORIGIN, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnectionStatus("🟢 Terhubung"));
    socket.on("disconnect", () => setConnectionStatus("🔴 Terputus"));
    socket.on("connect_error", () => setConnectionStatus("🟡 Gagal"));

    socket.on("summary_stream", (data: any) => {
      const editor = summaryEditorRef.current;
      if (!editor) return;
      
      if (data.error) {
        showToast(`Error: ${data.error}`, "error");
        summarizeInFlightRef.current = false;
        return;
      }

      let nextSummary = lastFinalSummaryRef.current;
      if (data.token) nextSummary += data.token;
      if (data.final) nextSummary = data.final.trim();
      
      renderDiff(lastFinalSummaryRef.current, nextSummary, editor, clearHlTimerRef);
      lastFinalSummaryRef.current = nextSummary;
      
      if (data.end) {
        summarizeInFlightRef.current = false;
        localStorage.setItem(LS_LAST_SUMMARY_KEY, nextSummary.trim());
      }
    });
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "id-ID";
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const chunk = event.results[i][0].transcript || "";
          if (event.results[i].isFinal) {
            fullTranscriptRef.current += replaceSpokenPunctuation(chunk) + " ";
          } else {
            interim += chunk;
          }
        }
        const currentTranscript = fullTranscriptRef.current + interim;
        setTranscript(currentTranscript);
        scheduleAutoSummarize(currentTranscript);
      };
      
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
        if (recognitionRef.current && !recognitionRef.current.isManuallyStopped) {
          try { recognition.start(); } catch {}
        }
      };
      recognition.onerror = (e: any) => {
        console.error("SpeechRecognition error:", e.error);
        setIsListening(false);
      };
      recognitionRef.current = recognition;
    } else {
      alert("Browser Anda tidak mendukung Web Speech API. Coba gunakan Google Chrome.");
    }
    
    return () => {
      mounted = false;
      socket.disconnect(); 
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleStartListening = () => {
    if (recognitionRef.current) {
      fullTranscriptRef.current = "";
      lastFinalSummaryRef.current = "";
      setTranscript("");
      if (summaryEditorRef.current) summaryEditorRef.current.innerHTML = "";
      
      try {
        recognitionRef.current.isManuallyStopped = false;
        recognitionRef.current.start();
      } catch(e) { showToast("Gagal memulai. Coba lagi.", "error"); }
    }
  };

  const handleStopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.isManuallyStopped = true;
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleSubmitVideoUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!videoUrl.trim()) {
      showToast("Masukkan URL video terlebih dahulu", "error");
      return;
    }

    // Reset previous state
    setUploadStatus("uploading");
    setUploadError(null);
    setTranscript("");
    if (summaryEditorRef.current) summaryEditorRef.current.innerHTML = "";

    // Set video preview from URL
    setVideoPreview(videoUrl);
    showToast("Mengunduh file... Ini mungkin memakan waktu beberapa menit", "info");

    try {
      console.log(`[Frontend] Sending URL to ${BACKEND_ORIGIN}/upload_from_url:`, videoUrl);
      
      const res = await fetch(`${BACKEND_ORIGIN}/upload_from_url`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ url: videoUrl, mode: currentModeRef.current }),
      });
      
      console.log(`[Frontend] Response status: ${res.status}`);
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errorMsg = errData.error || `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(errorMsg);
      }
      
      const data = await res.json();
      console.log(`[Frontend] Job ID received:`, data.job_id);
      setUploadJobId(data.job_id);
      showToast("File berhasil diunduh, memproses...", "success");
      pollStatus(data.job_id);
    } catch (err: any) {
      console.error(`[Frontend] Error:`, err);
      setUploadStatus('error');
      const errorMsg = err.message || 'Unknown error occurred';
      setUploadError(errorMsg);
      showToast(`Error: ${errorMsg}`, "error");
      setVideoPreview(null);
    }
  };

  const requestSummarize = (text: string, showUI: boolean = true) => {
    if (summarizeInFlightRef.current || !text || !socketRef.current?.connected) return;

    summarizeInFlightRef.current = true;
    
    if (showUI && summaryEditorRef.current) {
        summaryEditorRef.current.innerHTML = "<i>Memproses ringkasan...</i>";
    }
    
    socketRef.current.emit("summarize_stream", { text, mode: currentModeRef.current });
  };
  
    // ===================================
    // NEW: Video Upload Handlers
    // ===================================
    const pollStatus = (jobId: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
        pollIntervalRef.current = setInterval(async () => {
          try {
            const res = await fetch(`${BACKEND_ORIGIN}/upload_status/${jobId}`);
            if (!res.ok) throw new Error("Failed to fetch status");
    
            const data = await res.json();
            setUploadStatus(data.status);
    
            if (data.status === 'complete') {
                clearInterval(pollIntervalRef.current);
                setTranscript(data.transcript || "");
                if (summaryEditorRef.current) {
                    summaryEditorRef.current.innerHTML = mdToHtml(data.summary || "");
                }
                showToast("Proses file selesai!", "success");
                setUploadStatus("idle");
            } else if (data.status === 'error') {
                clearInterval(pollIntervalRef.current);
                setUploadError(data.error || "Terjadi kesalahan tidak diketahui.");
                showToast(`Error: ${data.error}`, "error");
                setUploadStatus("error");
            }
          } catch (err: any) {
            clearInterval(pollIntervalRef.current);
            setUploadError(err.message);
            showToast(`Error: ${err.message}`, "error");
            setUploadStatus("error");
          }
        }, 2500); // Poll every 2.5 seconds
      };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset previous state
        setUploadStatus("uploading");
        setUploadError(null);
        setTranscript("");
        if (summaryEditorRef.current) summaryEditorRef.current.innerHTML = "";

        // Create preview for video/audio file
        setVideoFile(file);
        const fileUrl = URL.createObjectURL(file);
        setVideoPreview(fileUrl);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('mode', currentModeRef.current);

        try {
            const res = await fetch(`${BACKEND_ORIGIN}/upload_video`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Upload failed');
            }
            const data = await res.json();
            setUploadJobId(data.job_id);
            pollStatus(data.job_id); // Start polling
        } catch (err: any) {
            setUploadStatus('error');
            setUploadError(err.message);
            showToast(`Upload Error: ${err.message}`, "error");
        }
    }
    
    const isProcessing = isListening || uploadStatus !== 'idle';
    
    const handleSave = async () => {
      if (!userId) {
        showToast("User belum terauthentikasi", "error");
        return;
      }

      const transcriptText = fullTranscriptRef.current || transcript;
      const summaryText = lastFinalSummaryRef.current || summaryEditorRef.current?.textContent || "";

      if (!transcriptText.trim()) {
        showToast("Tidak ada transkrip untuk disimpan", "error");
        return;
      }

      setIsSaving(true);
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from("collections")
          .insert({
            user_id: userId,
            original_text: transcriptText,
            summary_result: summaryText || "(Tidak ada ringkasan)",
            mode_used: currentModeRef.current,
            metadata: {
              save_at: new Date().toISOString(),
            },
          })
          .select();

        if (error) {
          showToast(`Gagal menyimpan: ${error.message}`, "error");
          setIsSaving(false);
          return;
        }

        showToast("Transkrip berhasil disimpan!", "success");
        setTranscript("");
        fullTranscriptRef.current = "";
        lastFinalSummaryRef.current = "";
        if (summaryEditorRef.current) summaryEditorRef.current.innerHTML = "";
        setIsSaving(false);
        
        // Navigate to detail page of newly created collection
        if (data && data.length > 0) {
          const newId = data[0].id;
          router.push(`/detail/${newId}`);
        }
      } catch (err: any) {
        showToast(`Error saat menyimpan: ${err?.message || err}`, "error");
        setIsSaving(false);
      }
    };
    // ===================================

  return (
    <>
      <div className="vtt-main-container">
        {/* Controls Section - ABOVE VIDEO */}
        <div className="controls-section">
          <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Video URL Input */}
            <form onSubmit={handleSubmitVideoUrl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input 
                type="text"
                placeholder="URL video/audio atau YouTube (misal: https://youtu.be/...)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                disabled={isProcessing}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d9e6',
                  fontSize: '14px',
                  minWidth: '300px',
                  backgroundColor: isProcessing ? '#f0f0f0' : '#fff',
                  cursor: isProcessing ? 'not-allowed' : 'text',
                }}
              />
              <button
                type="submit"
                disabled={isProcessing}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: isProcessing ? '#b0d4ff' : '#007bff',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => !isProcessing && (e.currentTarget.style.backgroundColor = '#0056b3')}
                onMouseLeave={(e) => !isProcessing && (e.currentTarget.style.backgroundColor = '#007bff')}
              >
                Submit
              </button>
            </form>
            
            {/* =================================== */}
            {/* Separator */}
            {/* =================================== */}
            <div style={{ borderLeft: '1px solid #d1d9e6', height: '30px' }}></div>
            
            {/* Upload Button */}
            <label htmlFor="videoUpload" 
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, background: isProcessing ? '#e2e8f0' : '#f4f6fa', color: '#4a5568',
                  fontWeight: 500, border: '1px solid #d1d9e6', borderRadius: 24, padding: '8px 22px', fontSize: 16,
                  cursor: isProcessing ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
                }}
            >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: 6}}>
                    <circle cx="10" cy="10" r="10" fill="#d6bcfa"/>
                    <path d="M10 6V14M6 10H14" stroke="#6b46c1" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Upload File
            </label>
            <input 
              type="file" 
              id="videoUpload" 
              style={{ display: 'none' }}
              accept=".mp4,.mkv,.mov,.avi,.flv,.webm,.mp3,.wav"
              onChange={handleFileChange}
              disabled={isProcessing}
            />

            {uploadStatus !== 'idle' && (
                <div style={{ fontSize: 14, color: '#4a5568', marginLeft: 8 }}>
                    {uploadStatus === 'error' ? `Error: ${uploadError}` : `Status: ${uploadStatus}...`}
                </div>
            )}

            {/* =================================== */}
            {/* Separator */}
            {/* =================================== */}
            <div style={{ borderLeft: '1px solid #d1d9e6', height: '30px' }}></div>
            
            {/* Format Selector */}
            <select
              value={selectedMode}
              onChange={(e) => {
                setSelectedMode(e.target.value);
                currentModeRef.current = e.target.value;
                fetch(`${BACKEND_ORIGIN}/set_summary_mode`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mode: e.target.value }),
                }).catch(err => console.error("Gagal set mode:", err));
              }}
              disabled={isProcessing}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d9e6',
                backgroundColor: isProcessing ? '#f0f0f0' : '#fff',
                fontSize: '14px',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="default">Ringkasan Eksekutif (Default)</option>
              <option value="cornell">Peta Konsep Cornell</option>
            </select>
             {/* =================================== */}
          </div>
        </div>

        {/* Video Section */}
        <div className="video-section">
          {videoPreview ? (
            <video 
              width="100%" 
              height="360" 
              controls 
              style={{ borderRadius: '8px', objectFit: 'contain', backgroundColor: '#000' }}
            >
              <source src={videoPreview} type={videoFile?.type || 'video/mp4'} />
              Browser Anda tidak mendukung video player.
            </video>
          ) : (
            <div className="video-placeholder">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="2" stroke="currentColor" strokeWidth="2"/>
                <polygon points="10,7 10,17 17,12" fill="currentColor"/>
              </svg>
              <p>Video akan ditampilkan di sini</p>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="vtt-flex-container">
          {/* Kolom Kiri */}
          <div className="column transcript-col">
            <div className="summary-header">Transkrip</div>

            <div
              className="editor"
              style={{ minHeight: 120, flexGrow: 1, marginBottom: 0, overflow: 'auto' }}
            >
              <textarea
                value={transcript}
                placeholder="Transkrip suara atau file akan muncul di sini..."
                readOnly
                id="transcript"
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 120,
                  border: 'none',
                  background: 'transparent',
                  resize: 'none',
                  fontSize: '16px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                  padding: 0,
                  overflow: 'hidden',
                  scrollbarWidth: 'thin',
                }}
              />
            </div>
          </div>

          {/* Kolom Kanan */}
          <div className="column summary-col">
            <div className="summary-header">
              <span className="connection-status">{connectionStatus}</span>
            </div>
            <div
              ref={summaryEditorRef}
              id="summaryEditor"
              className="editor"
              contentEditable
              data-placeholder="Ringkasan akan muncul di sini..."
              style={{ minHeight: 120, flexGrow: 1, marginBottom: 0, overflow: 'auto' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                id="saveBtn"
                type="button"
                style={{ /* ... existing styles ... */ }}
                onClick={handleSave}
                disabled={isSaving || !transcript.trim()}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: 6}}>
                  <circle cx="10" cy="10" r="10" fill="#bee3f8"/>
                  <path d="M7 10.5L9.5 13L13 7" stroke="#3182ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {isSaving ? "Menyimpan..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {toast && (
        <div className={`toast show ${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}