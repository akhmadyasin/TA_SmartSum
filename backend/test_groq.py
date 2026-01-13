import os
from groq import Groq
from dotenv import load_dotenv
import time

# Muat environment variable dari file .env
load_dotenv()

print("--- Memulai Tes Koneksi Groq ---")

# 1. Cek apakah API key berhasil dimuat
api_key = os.environ.get("GROQ_API_KEY")
if not api_key:
    print("❌ GAGAL: Variabel GROQ_API_KEY tidak ditemukan di file .env")
    exit()

print(f"✅ API Key ditemukan. (Awal: {api_key[:4]}..., Akhir: ...{api_key[-4:]})")

# 2. Inisialisasi client Groq
try:
    client = Groq(api_key=api_key, timeout=20.0) # Set timeout 20 detik
    print("✅ Client Groq berhasil diinisialisasi.")
except Exception as e:
    print(f"❌ GAGAL inisialisasi client: {e}")
    exit()

# 3. Lakukan panggilan API sederhana
print("\n📞 Menghubungi server Groq... (Ini mungkin butuh waktu hingga 20 detik)")
start_time = time.time()

try:
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "Sebutkan satu fakta menarik tentang Indonesia dalam satu kalimat.",
            }
        ],
        model="deepseek-r1-distill-llama-70b", # Menggunakan model yang lebih kecil & cepat untuk tes
    )
    
    end_time = time.time()
    duration = end_time - start_time
    
    print(f"\n✅ BERHASIL! Respons diterima dalam {duration:.2f} detik.")
    print("-" * 20)
    print("Respons dari Groq:")
    print(chat_completion.choices[0].message.content)
    print("-" * 20)

except Exception as e:
    end_time = time.time()
    duration = end_time - start_time
    print(f"\n❌ GAGAL setelah {duration:.2f} detik.")
    print(f"Error: {type(e).__name__} - {e}")

print("\n--- Tes Selesai ---")