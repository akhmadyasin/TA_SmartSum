# backend/api.py
import os
import time
import re
import uuid
import traceback
import textwrap
from threading import Event, Thread
from datetime import datetime
import whisper # <-- NEW: For transcription
import threading # <-- NEW: For background jobs
import requests # <-- NEW: For downloading from URL
import yt_dlp # <-- NEW: For YouTube support

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from groq import Groq
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException
from werkzeug.utils import secure_filename # <-- NEW: For safe filenames

# =========================
# NEW: Video Upload Config
# =========================
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'mkv', 'mov', 'avi', 'flv', 'webm', 'mp3', 'wav', 'm4a', 'mpeg', 'mpga'}
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# simple in-memory collections store (newest first)
collections_store = []
# NEW: In-memory store for upload job status
jobs = {} 
# NEW: Load whisper model once on startup to save time
whisper_model = None
try:
    print("[Whisper] Loading model...")
    whisper_model = whisper.load_model("base") # Use "base" for speed, or "medium" for better accuracy
    print("[Whisper] Model loaded successfully.")
except Exception as e:
    print(f"[Whisper] ERROR: Could not load model. Transcription will fail. Error: {e}")


def _now_iso():
    return datetime.utcnow().isoformat() + "Z"


# =========================
# Config & Init
# =========================
load_dotenv()
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER # <-- NEW
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

stop_flags = {}  # {sid: Event}


# =========================
# Helpers
# =========================
def strip_think(text: str) -> str:
    """Hapus blok <think>...</think> bila ada."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()

def build_prompt(transcript_text: str, template_mode: str = "default") -> str:
    """
    Membangun prompt untuk model AI berdasarkan template ringkasan yang dipilih.

    Args:
        transcript_text (str): Teks transkrip lengkap yang akan diringkas.
        template_mode (str, optional): Mode template ringkasan.
                                       Pilihan: "default" (Ringkasan Eksekutif) atau "cornell" (Peta Konsep Cornell).
                                       Defaults to "default".

    Returns:
        str: Prompt lengkap yang siap dikirim ke API model AI (misal: OpenAI GPT).
    """

    # Normalisasi input mode agar huruf kecil semua dan menangani input None/kosong
    mode = (template_mode or "default").lower().strip()

    # --------------------------------------------------------------------------
    # TEMPLATE 1: MODE DEFAULT (RINGKASAN EKSEKUTIF)
    # Fokus: Review cepat, padat, poin-poin kunci. Cocok untuk kuliah umum.
    # --------------------------------------------------------------------------
    if mode == "default":
        # Menggunakan textwrap.dedent agar penulisan prompt di kode rapi (tidak ada indentasi berlebih)
        prompt_content = textwrap.dedent(f"""
            Peran: Anda adalah asisten belajar mahasiswa yang sangat efisien dan cerdas.

            Tugas: Bacalah transkrip kuliah yang diberikan di bawah ini. Tugas utama Anda adalah membuat **Ringkasan Eksekutif** yang padat, jelas, dan mudah dipahami mahasiswa dalam waktu singkat (kurang dari 5 menit membaca).

            Instruksi Format Output (PENTING):
            Output HARUS mengikuti struktur di bawah ini secara ketat. Jangan tambahkan teks pengantar atau penutup di luar struktur ini.

            **INTISARI UTAMA (The Big Idea)**
            [Tuliskan satu paragraf pendek di sini, maksimal 3 kalimat. Jelaskan ide paling penting atau "pesan utama" dari seluruh rekaman ini. Apa satu hal yang harus diingat mahasiswa?]

            **POIN-POIN KUNCI (Key Takeaways)**
            [Buatlah daftar bullet points berisi 5-7 poin paling penting dari materi.]
            * Gunakan format: **[Istilah/Konsep Kunci]**: [Penjelasan singkat dan jelas tentang konsep tersebut].
            * Pastikan penjelasan akurat secara akademis namun menggunakan bahasa Indonesia yang mudah dimengerti mahasiswa.
            * Jangan bertele-tele. Fokus pada definisi, fungsi, atau hubungan antar konsep.

            Aturan Ketat:
            1. HANYA ekstrak informasi dan fakta yang ada pada teks transkrip sumber. Jangan berhalusinasi atau menambah fakta dari luar.
            2. Pertahankan angka, satuan, atau istilah teknis penting persis seperti yang tertulis jika relevan.
            3. Gunakan Bahasa Indonesia yang baku, akademis, namun tidak kaku.
            4. Langsung berikan hasil ringkasan final, TANPA menampilkan proses berpikir Anda.

            ---
            TEKS TRANSKRIP SUMBER:
            {transcript_text}
            ---

            RINGKASAN EKSEKUTIF:
        """)
        return prompt_content.strip() # Menghapus spasi kosong di awal/akhir string

    # --------------------------------------------------------------------------
    # TEMPLATE 2: MODE CORNELL (PETA KONSEP / STUDY GUIDE)
    # Fokus: Pemahaman mendalam, persiapan ujian, memisahkan konsep dan detail.
    # --------------------------------------------------------------------------
    elif mode == "cornell":
        prompt_content = textwrap.dedent(f"""
            Peran: Anda adalah tutor akademik ahli yang berspesialisasi dalam membuat catatan belajar yang efektif menggunakan metode Cornell Notes.

            Tugas: Bacalah transkrip kuliah di bawah ini. Analisis materi tersebut untuk mengidentifikasi konsep-konsep kunci, istilah penting, atau pertanyaan utama yang dibahas. Kemudian, strukturkan informasi tersebut ke dalam format catatan Cornell.

            Instruksi Format Output (PENTING):
            Output HARUS mengikuti struktur di bawah ini secara ketat untuk memisahkan antara "Kata Kunci/Pertanyaan Pemicu" (kolom kiri Cornell) dan "Penjelasan Detail" (kolom kanan Cornell).

            **KATA KUNCI / PERTANYAAN PEMICU 1:**
            [Tuliskan satu istilah teknis penting, konsep utama, atau pertanyaan besar yang dijawab di bagian ini. Ini berfungsi sebagai "judul kecil" atau pemicu ingatan.]

            **PENJELASAN DETAIL 1:**
            [Berikan penjelasan yang komprehensif namun ringkas untuk poin di atas. Gunakan bullet points jika ada sub-poin, langkah-langkah, atau rincian penting.]
            * [Sub-poin detail...]
            * [Sub-poin detail...]

            ---
            (Ulangi blok "KATA KUNCI/PERTANYAAN" dan "PENJELASAN DETAIL" ini untuk 3-5 konsep utama lainnya yang Anda temukan dalam transkrip. Pisahkan setiap blok dengan garis pemisah "---" seperti di atas.)
            ---

            **KESIMPULAN (SUMMARY):**
            [Di bagian paling bawah, tuliskan satu paragraf pendek (maksimal 2-3 kalimat) yang merangkum inti sari dari keseluruhan materi kuliah ini dalam bahasa yang sangat sederhana.]

            Aturan Ketat:
            1. Fokus pada mengidentifikasi struktur logis dari materi kuliah.
            2. Penjelasan harus AKURAT secara materi berdasarkan transkrip.
            3. Jangan membuat konsep sendiri; semua harus berasal dari transkrip.
            4. Langsung berikan hasil catatan format Cornell final, TANPA proses berpikir.

            ---
            TEKS TRANSKRIP SUMBER:
            {transcript_text}
            ---

            CATATAN CORNELL NOTES:
        """)
        return prompt_content.strip()

    # --------------------------------------------------------------------------
    # FALLBACK (JIKA MODE TIDAK DIKENALI)
    # Jika ada typo pada input mode, kembalikan ke mode default agar aman.
    # --------------------------------------------------------------------------
    else:
        # Secara rekursif panggil fungsi ini lagi dengan mode "default"
        return build_prompt(transcript_text, template_mode="default")


def _parse_retry_after_seconds(message: str):
    try:
        m = re.search(r"in\s+(?:(\d+)m)?(\d+(?:\.\d+)?)s", message)
        if not m:
            return None
        minutes = float(m.group(1)) if m.group(1) else 0.0
        seconds = float(m.group(2))
        return minutes * 60.0 + seconds
    except Exception:
        return None

# =========================
# NEW: Background Job for Transcription & Summarization
# =========================
def _summarize_text_internal(text: str, mode: str) -> str:
    """Internal helper to call Groq for summarization."""
    if not client:
        raise Exception("Groq client not initialized")
    prompt = build_prompt(text, mode)
    resp = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=MODEL,
        temperature=0.3,
    )
    summary_raw = (resp.choices[0].message.content or "").strip()
    return strip_think(summary_raw)

def process_video_job(job_id: str, filepath: str, mode: str):
    """The background worker function."""
    try:
        # 1. Transcribe
        print(f"[Job {job_id}] Starting transcription for {filepath}")
        jobs[job_id]['status'] = 'transcribing'
        if not whisper_model:
            raise Exception("Whisper model not loaded")
        
        result = whisper_model.transcribe(filepath, fp16=False) # fp16=False for CPU
        transcript = result["text"].strip()
        jobs[job_id]['transcript'] = transcript
        print(f"[Job {job_id}] Transcription complete, length: {len(transcript)}")

        # 2. Summarize
        print(f"[Job {job_id}] Starting summarization...")
        jobs[job_id]['status'] = 'summarizing'
        summary = _summarize_text_internal(transcript, mode)
        jobs[job_id]['summary'] = summary
        print(f"[Job {job_id}] Summarization complete.")

        # 3. Finish
        jobs[job_id]['status'] = 'complete'

    except Exception as e:
        print(f"[Job {job_id}] FAILED. Error: {e}")
        traceback.print_exc()
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error'] = str(e)
    finally:
        # 4. Cleanup
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
                print(f"[Job {job_id}] Cleaned up temp file {filepath}")
            except Exception as e:
                print(f"[Job {job_id}] Error cleaning up file {filepath}: {e}")


# =========================
# Error handler global
# =========================
@app.errorhandler(Exception)
def handle_exception(e):
    code = 500
    msg = str(e)
    if isinstance(e, HTTPException):
        code = e.code or 500
        msg = e.description
    return jsonify({"error": msg}), code


# =========================
# Routes (Pages)
# =========================
@app.route("/")
def base_page():
    return render_template("base.html")


@app.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html")


@app.route("/voice")
def voice_page():
    return render_template("index.html")


@app.route("/index")
def index_alias():
    return render_template("index.html")


@app.route("/collections")
def collections_page():
    return render_template("collections.html", collections=collections_store)


@app.route("/settings")
def settings_page():
    return render_template("settings.html")

# di bagian atas file api.py (global)
current_summary_mode = "default"  # default


@app.route("/set_summary_mode", methods=["POST"])
def set_summary_mode():
    """Set mode ringkasan global."""
    global current_summary_mode
    try:
        data = request.get_json(force=True, silent=True) or {}
        mode = (data.get("mode") or "").strip().lower()
        allowed = ["default", "cornell"]
        if mode not in allowed:
            return jsonify({"error": "mode_invalid", "allowed": allowed}), 400
        current_summary_mode = mode
        print("[/set_summary_mode] set to", current_summary_mode)
        return jsonify({"status": "ok", "mode": current_summary_mode})
    except Exception as e:
        print("ERROR /set_summary_mode:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/get_summary_mode", methods=["GET"])
def get_summary_mode():
    return jsonify({"mode": current_summary_mode})


# =========================
# Routes (APIs)
# =========================
@app.route("/test", methods=["GET"])
def test():
    return jsonify({"status": "connected", "message": "Backend is running"})

# =========================
# Rute Tes Diagnostik Baru
# =========================
@app.route("/test_groq_http", methods=["GET"])
def test_groq_http():
    print("\n--- [DIAGNOSTIK] Memulai tes via HTTP ---")
    try:
        if not client:
            print("--- [DIAGNOSTIK] Client Groq tidak terinisialisasi.")
            return jsonify({"error": "Groq client not initialized"}), 500

        print("--- [DIAGNOSTIK] Menghubungi Groq via HTTP... ---")
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": "Hello world"}],
            model=MODEL,
            temperature=0.5,
        )
        
        result = chat_completion.choices[0].message.content
        print(f"--- [DIAGNOSTIK] Berhasil! Respons: {result} ---")
        return jsonify({"status": "sukses", "response": result})

    except Exception as e:
        print(f"--- [DIAGNOSTIK] GAGAL! Error: {type(e).__name__} - {e} ---")
        return jsonify({"error": f"{type(e).__name__}: {e}"}), 500
        
# =========================
# NEW: Video Upload Routes
# =========================
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def is_youtube_url(url: str) -> bool:
    """Check if URL is from YouTube."""
    url_lower = url.lower()
    return any(x in url_lower for x in ['youtube.com', 'youtu.be', 'youtube-nocookie.com'])


def download_youtube_audio(url: str, job_id: str) -> tuple:
    """
    Download audio from YouTube video.
    Returns: (filepath, file_ext) or (None, None) if failed
    """
    try:
        print(f"[YouTube] Downloading from: {url}")
        
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], f"yt_{job_id}")
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': output_path,
            'quiet': False,
            'no_warnings': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get('title', 'video')
            print(f"[YouTube] Downloaded: {title}")
        
        # Find the downloaded file
        filepath = f"{output_path}.mp3"
        if os.path.exists(filepath):
            file_size = os.path.getsize(filepath)
            print(f"[YouTube] File saved: {filepath}, size: {file_size} bytes")
            return filepath, 'mp3'
        else:
            print(f"[YouTube] ERROR: File not found at {filepath}")
            return None, None
            
    except Exception as e:
        print(f"[YouTube] ERROR: {e}")
        traceback.print_exc()
        return None, None


@app.route('/upload_video', methods=['POST'])
def upload_video():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{uuid.uuid4()}_{filename}")
    file.save(filepath)

    job_id = str(uuid.uuid4())
    jobs[job_id] = {'status': 'queued'}
    
    # Start background job
    mode = request.form.get("mode", current_summary_mode)
    thread = Thread(target=process_video_job, args=(job_id, filepath, mode))
    thread.start()
    
    print(f"[/upload_video] Queued job {job_id} for file {filepath}")
    return jsonify({'job_id': job_id})

@app.route('/upload_status/<job_id>', methods=['GET'])
def get_upload_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)


@app.route('/test', methods=['GET'])
def test_endpoint():
    """Simple test endpoint to verify backend is working."""
    return jsonify({'status': 'ok', 'message': 'Backend is running'})


@app.route('/upload_from_url', methods=['POST', 'OPTIONS'])
def upload_from_url():
    """Download video/audio from URL and process it (supports YouTube, direct links, etc)."""
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        print("[/upload_from_url] Request received")
        
        # Get request data
        try:
            data = request.get_json(force=True, silent=True) or {}
            print(f"[/upload_from_url] Data received: {data}")
        except Exception as e:
            print(f"[/upload_from_url] Error parsing JSON: {e}")
            return jsonify({'error': f'Invalid JSON: {str(e)}'}), 400
            
        url = (data.get('url') or '').strip()
        
        if not url:
            return jsonify({'error': 'URL tidak diberikan'}), 400
        
        # Validate URL format
        if not url.startswith(('http://', 'https://')):
            return jsonify({'error': 'URL harus dimulai dengan http:// atau https://'}), 400
        
        # Create job ID first
        job_id = str(uuid.uuid4())
        jobs[job_id] = {'status': 'queued', 'source_url': url}
        
        print(f"[/upload_from_url] Processing URL: {url}")
        
        filepath = None
        file_ext = None
        
        # Check if it's YouTube URL
        if is_youtube_url(url):
            print(f"[/upload_from_url] Detected YouTube URL")
            jobs[job_id]['status'] = 'downloading'
            filepath, file_ext = download_youtube_audio(url, job_id)
            
            if not filepath:
                jobs[job_id]['status'] = 'error'
                jobs[job_id]['error'] = 'Gagal mendownload video YouTube. Pastikan URL valid dan video dapat diakses.'
                return jsonify({'error': 'Gagal mendownload video YouTube. Pastikan URL valid dan video dapat diakses.'}), 400
        else:
            # Handle direct URL download
            print(f"[/upload_from_url] Downloading from direct URL")
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
                print(f"[/upload_from_url] Sending request to download...")
                response = requests.get(url, timeout=60, stream=True, headers=headers, allow_redirects=True)
                print(f"[/upload_from_url] Response status: {response.status_code}")
                response.raise_for_status()
            except requests.exceptions.Timeout:
                jobs[job_id]['status'] = 'error'
                jobs[job_id]['error'] = 'Timeout: URL terlalu lama merespons (>60 detik)'
                return jsonify({'error': 'Timeout: URL terlalu lama merespons (>60 detik)'}), 408
            except requests.exceptions.ConnectionError as e:
                jobs[job_id]['status'] = 'error'
                jobs[job_id]['error'] = f'Connection error: Tidak dapat terhubung ke URL'
                return jsonify({'error': f'Connection error: Tidak dapat terhubung ke URL'}), 400
            except requests.exceptions.RequestException as e:
                jobs[job_id]['status'] = 'error'
                jobs[job_id]['error'] = f'Gagal mengunduh URL: {str(e)}'
                return jsonify({'error': f'Gagal mengunduh URL: {str(e)}'}), 400
            
            # Check content type and size
            content_type = response.headers.get('content-type', '').lower()
            content_length = response.headers.get('content-length')
            print(f"[/upload_from_url] Content-Type: {content_type}")
            print(f"[/upload_from_url] Content-Length: {content_length}")
            
            # Determine file extension
            file_ext = None
            
            # 1. Try to extract from URL path
            url_path = url.split('?')[0].lower()
            if '.' in url_path:
                potential_ext = url_path.split('.')[-1].strip('/')
                if len(potential_ext) < 10 and potential_ext in ALLOWED_EXTENSIONS:
                    file_ext = potential_ext
                    print(f"[/upload_from_url] Detected extension from URL: {file_ext}")
            
            # 2. If not found, use content-type mapping
            if not file_ext:
                ext_map = {
                    'video/mp4': 'mp4',
                    'video/quicktime': 'mov',
                    'video/x-msvideo': 'avi',
                    'video/x-mkv': 'mkv',
                    'video/x-matroska': 'mkv',
                    'video/webm': 'webm',
                    'audio/mpeg': 'mp3',
                    'audio/wav': 'wav',
                    'audio/x-wav': 'wav',
                    'audio/mp4': 'm4a',
                    'audio/x-m4a': 'm4a',
                    'audio/aac': 'm4a',
                    'application/octet-stream': 'mp4',
                }
                
                for mime, ext in ext_map.items():
                    if mime in content_type:
                        file_ext = ext
                        print(f"[/upload_from_url] Detected extension from content-type: {file_ext}")
                        break
            
            # 3. Fallback to mp4
            if not file_ext:
                file_ext = 'mp4'
                print(f"[/upload_from_url] Using default extension: mp4")
            
            # Save downloaded file
            filename = f"{uuid.uuid4()}.{file_ext}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            try:
                print(f"[/upload_from_url] Saving to {filepath}")
                bytes_downloaded = 0
                with open(filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            bytes_downloaded += len(chunk)
                
                file_size = os.path.getsize(filepath)
                print(f"[/upload_from_url] File saved successfully. Downloaded: {bytes_downloaded} bytes, File size: {file_size} bytes")
                
                if file_size == 0:
                    os.remove(filepath)
                    jobs[job_id]['status'] = 'error'
                    jobs[job_id]['error'] = 'File kosong atau tidak dapat diunduh'
                    return jsonify({'error': 'File kosong atau tidak dapat diunduh'}), 400
                    
            except Exception as e:
                print(f"[/upload_from_url] Error saving file: {e}")
                traceback.print_exc()
                jobs[job_id]['status'] = 'error'
                jobs[job_id]['error'] = f'Gagal menyimpan file: {str(e)}'
                return jsonify({'error': f'Gagal menyimpan file: {str(e)}'}), 500
        
        # Queue job for processing
        jobs[job_id]['status'] = 'queued'
        mode = data.get('mode', current_summary_mode)
        thread = Thread(target=process_video_job, args=(job_id, filepath, mode))
        thread.daemon = True
        thread.start()
        
        print(f"[/upload_from_url] Successfully queued job {job_id}")
        return jsonify({'job_id': job_id})
        
    except Exception as e:
        print(f"[/upload_from_url] Unexpected ERROR: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500


# ---------- HTTP summarize ----------
@app.route("/summarize", methods=["POST"])
def summarize():
    try:
        data = request.get_json(force=True, silent=True) or {}
        text = (data.get("text") or "").strip()
        mode = (data.get("mode") or current_summary_mode).strip().lower()
        if not text:
            return jsonify({"error": "Teks kosong"}), 400

        if not client:
            return jsonify({"error": "groq_api_key_missing", "message": "GROQ_API_KEY not configured"}), 500

        prompt = build_prompt(text, mode)
        print("[/summarize] text_len=", len(text), "mode=", mode)

        max_retries = 3
        base_sleep = 3.0
        attempt = 0
        while True:
            try:
                resp = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=MODEL,
                    temperature=0.3,
                )
                summary_raw = (resp.choices[0].message.content or "").strip()
                summary = strip_think(summary_raw)
                return jsonify({"summary": summary})
            except Exception as e:
                msg = f"{type(e).__name__}: {e}"
                print("[/summarize] ERROR:", msg)
                low = str(e).lower()
                is_rate = "rate limit" in low or "rate_limit" in low
                is_conn = any(k in low for k in ["connection", "timeout", "timed out", "temporarily"])
                retry_after = _parse_retry_after_seconds(str(e)) or base_sleep
                attempt += 1

                if (is_rate or is_conn) and attempt <= max_retries:
                    sleep_for = retry_after * (2 ** (attempt - 1))
                    print(f"[/summarize] retry in {sleep_for:.1f}s (attempt {attempt}/{max_retries})")
                    time.sleep(sleep_for)
                    continue

                if is_rate:
                    return jsonify({"error": "rate_limit", "message": str(e), "retry_after": max(5, int(retry_after))}), 429
                if is_conn:
                    return jsonify({"error": "upstream_connection", "message": str(e)}), 502
                return jsonify({"error": str(e)}), 500

    except Exception as e:
        print("ERROR /summarize (outer):", f"{type(e).__name__}: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ---------- SAVE (collections) ----------
@app.route("/save", methods=["POST"])
def save_summary():
    try:
        try:
            print("\n[/save] === request headers ===")
            for k, v in request.headers.items():
                print(f"{k}: {v}")
        except Exception:
            print("[/save] failed to print headers")

        try:
            raw = request.get_data(as_text=True)
            print("[/save] raw body (first 2000 chars):", raw[:2000])
        except Exception as e:
            print("[/save] could not read raw body:", e)

        payload = {}
        try:
            payload = request.get_json(force=True, silent=False) or {}
            print("[/save] parsed JSON keys:", list(payload.keys()))
        except Exception as e:
            print("[/save] get_json failed:", type(e).__name__, e)
            return jsonify({"error": "invalid_json", "message": str(e)}), 400

        text = (payload.get("text") or "").strip()
        meta = payload.get("meta") or {}

        if not text:
            print("[/save] empty text -> 400")
            return jsonify({"error": "empty_text"}), 400

        entry = {
            "id": str(uuid.uuid4()),
            "text": text,
            "meta": meta,
            "created_at": _now_iso()
        }

        collections_store.insert(0, entry)  # newest first
        print(f"[/save] saved entry id={entry['id']} len={len(text)} created_at={entry['created_at']}")
        return jsonify({"status": "ok", "entry": entry}), 200

    except Exception as e:
        print("ERROR /save (exception):", type(e).__name__, e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/save_echo", methods=["POST"])
def save_echo():
    try:
        raw = request.get_data(as_text=True)
        print("[/save_echo] got raw:", raw[:2000])
        return jsonify({"ok": True, "echo": raw[:2000]}), 200
    except Exception as e:
        print("ERROR /save_echo:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/collections", methods=["GET"])
def api_collections():
    return jsonify({"collections": collections_store})


# ---------- STREAM summarize (SocketIO) ----------
@socketio.on("summarize_stream")
def handle_summarize_stream(data):
    sid = request.sid
    text = (data.get("text") or "").strip()
    mode = (data.get("mode") or current_summary_mode).strip().lower()
    if not text:
        emit("summary_stream", {"error": "Teks kosong"})
        return

    if not client:
        emit("summary_stream", {"error": "groq_api_key_missing"})
        return

    prompt = build_prompt(text, mode)
    print(f"[stream] start SID={sid} text_len={len(text)} mode={mode}")

    stop_evt = Event()
    stop_flags[sid] = stop_evt

    try:
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=MODEL,
            temperature=0.3,
            stream=True
        )

        token_count = 0
        collected = []
        for chunk in response:
            if stop_evt.is_set():
                print(f"[stream] stopped by client SID={sid}")
                break

            try:
                choice = chunk.choices[0]
            except Exception:
                continue

            text_piece = None
            delta = getattr(choice, "delta", None)
            if delta and getattr(delta, "content", None):
                text_piece = delta.content
            if not text_piece:
                message_obj = getattr(choice, "message", None)
                if message_obj and getattr(message_obj, "content", None):
                    text_piece = message_obj.content

            if text_piece:
                token_count += len(text_piece)
                collected.append(text_piece)
                emit("summary_stream", {"token": text_piece})

        final_raw = "".join(collected).strip()
        final_fmt = strip_think(final_raw)
        emit("summary_stream", {"final": final_fmt, "end": True})
        print(f"[stream] end SID={sid} tokens={token_count}")

    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        print(f"[stream] error SID={sid}: {msg}")
        emit("summary_stream", {"error": str(e)})
    finally:
        stop_flags.pop(sid, None)


@socketio.on("stop_stream")
def handle_stop_stream():
    sid = request.sid
    if sid in stop_flags:
        stop_flags[sid].set()
    emit("stop_stream")


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    if sid in stop_flags:
        stop_flags[sid].set()
    print(f"[socket] disconnect SID={sid}")


# =========================
# Main
# =========================
if __name__ == "__main__":
    socketio.run(app, debug=True, use_reloader=False,
                 host="127.0.0.1", port=int(os.environ.get("PORT", 5001)),
                 allow_unsafe_werkzeug=True)