"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabaseClient";
import s from "@/app/styles/dashboard.module.css";
import d from "@/app/styles/detail.module.css";

type CollectionItem = {
  id: string;
  date: string;
  transcript: string;
  summary: string;
  mode_used?: string;
};

type ShareToken = {
  id: string;
  token: string;
  collection_id: string;
  expires_at: string | null;
  max_views: number | null;
  view_count: number;
  is_active: boolean;
};

export default function SharePage() {
  const router = useRouter();
  const params = useParams();
  const supabase = supabaseBrowser();
  const token = params.id as string;

  const [loading, setLoading] = useState(true);
  const [detailData, setDetailData] = useState<CollectionItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchSharedData = async () => {
      try {
        // 1. Validasi share token
        const { data: shareTokenData, error: tokenError } = await supabase
          .from("share_tokens")
          .select("*")
          .eq("token", token)
          .single();

        if (tokenError || !shareTokenData) {
          setError("Invalid or expired share link");
          setLoading(false);
          return;
        }

        const shareToken = shareTokenData as ShareToken;

        // 2. Cek apakah token masih aktif
        if (!shareToken.is_active) {
          setError("This share link has been deactivated");
          setLoading(false);
          return;
        }

        // 3. Cek apakah token sudah expired
        if (shareToken.expires_at) {
          const expiresAt = new Date(shareToken.expires_at);
          if (new Date() > expiresAt) {
            setError("This share link has expired");
            setLoading(false);
            return;
          }
        }

        // 4. Cek apakah sudah melebihi max views
        if (shareToken.max_views && shareToken.view_count >= shareToken.max_views) {
          setError("This share link has reached maximum view limit");
          setLoading(false);
          return;
        }

        // 5. Fetch collection data menggunakan collection_id
        const { data: historyData, error: historyError } = await supabase
          .from("collections")
          .select("*")
          .eq("id", shareToken.collection_id)
          .single();

        if (historyError || !historyData) {
          setError("Transcription not found or has been deleted");
          setLoading(false);
          return;
        }

        // 6. Increment view count
        const newViewCount = shareToken.view_count + 1;
        await supabase
          .from("share_tokens")
          .update({ view_count: newViewCount })
          .eq("id", shareToken.id);

        // 7. Map data
        if (historyData) {
          const mappedData: CollectionItem = {
            id: historyData.id,
            date: new Date(historyData.created_at).toLocaleDateString("id-ID", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            transcript: historyData.original_text,
            summary: historyData.summary_result,
            mode_used: historyData.mode_used,
          };
          setDetailData(mappedData);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load shared transcription");
      } finally {
        setLoading(false);
      }
    };

    fetchSharedData();
  }, [token, supabase]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const handleExport = () => {
    if (detailData) {
      const content = `Transcription Detail\n\nDate: ${detailData.date}\n${detailData.mode_used ? `Mode: ${detailData.mode_used}\n` : ""}\n\nTranscript:\n${detailData.transcript}\n\nSummary:\n${detailData.summary}`;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcription-${detailData.id}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#666",
            }}
          >
            <div style={{ fontSize: "18px", marginBottom: "10px" }}>
              Loading transcription...
            </div>
            <div style={{ fontSize: "14px", opacity: 0.7 }}>
              Please wait while we retrieve the shared transcription.
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !detailData) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#d32f2f",
            }}
          >
            <div style={{ fontSize: "18px", marginBottom: "10px", fontWeight: "bold" }}>
              {error || "Transcription not found"}
            </div>
            <div style={{ fontSize: "14px", opacity: 0.7, marginTop: "10px" }}>
              The transcription you are looking for does not exist or has been deleted.
            </div>
            <button
              onClick={() => router.push("/")}
              style={{
                marginTop: "20px",
                padding: "10px 20px",
                backgroundColor: "#1976d2",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Back to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
      }}
    >
      {/* TOPBAR - SIMPLE VERSION */}
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #e0e0e0",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <Image
            src="/logo_neurabot.jpg"
            alt="Logo Neurabot"
            width={36}
            height={36}
            style={{ borderRadius: "4px" }}
          />
          <div
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              color: "#333",
            }}
          >
            Neurabot
          </div>
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "#999",
            padding: "6px 12px",
            backgroundColor: "#f0f0f0",
            borderRadius: "4px",
          }}
        >
          Shared Transcription
        </div>
      </header>

      {/* CONTENT */}
      <main
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "40px 20px",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "32px",
              borderBottom: "1px solid #e0e0e0",
              backgroundColor: "#fafafa",
            }}
          >
            <h1
              style={{
                fontSize: "28px",
                fontWeight: "bold",
                color: "#333",
                marginBottom: "16px",
                margin: 0,
              }}
            >
              Transcription Details
            </h1>
            <div
              style={{
                display: "flex",
                gap: "24px",
                marginTop: "16px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  color: "#666",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                {detailData.date}
              </div>
              {detailData.mode_used && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "14px",
                    color: "#666",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                    <line x1="9" y1="9" x2="9.01" y2="9"></line>
                    <line x1="15" y1="9" x2="15.01" y2="9"></line>
                  </svg>
                  Mode: {detailData.mode_used}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              <button
                onClick={handleExport}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  backgroundColor: "#1976d2",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1565c0")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1976d2")}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7,10 12,15 17,10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: "32px" }}>
            {/* Transcript Section */}
            <section style={{ marginBottom: "40px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  paddingBottom: "12px",
                  borderBottom: "2px solid #e0e0e0",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: "#333",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    margin: 0,
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  Full Transcript
                </h2>
                <button
                  onClick={() => handleCopy(detailData.transcript)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    backgroundColor: "#f0f0f0",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "13px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#e0e0e0")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "#f0f0f0")
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  </svg>
                  Copy
                </button>
              </div>
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#fafafa",
                  borderRadius: "6px",
                  lineHeight: "1.6",
                  color: "#333",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "14px",
                }}
              >
                {detailData.transcript}
              </div>
            </section>

            {/* Summary Section */}
            <section>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  paddingBottom: "12px",
                  borderBottom: "2px solid #e0e0e0",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: "#333",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    margin: 0,
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14,2 14,8 20,8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10,9 9,9 8,9"></polyline>
                  </svg>
                  AI Summary
                </h2>
                <button
                  onClick={() => handleCopy(detailData.summary)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    backgroundColor: "#f0f0f0",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "13px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#e0e0e0")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "#f0f0f0")
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  </svg>
                  Copy
                </button>
              </div>
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#fafafa",
                  borderRadius: "6px",
                  lineHeight: "1.6",
                  color: "#333",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "14px",
                }}
              >
                {detailData.summary}
              </div>
            </section>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "20px 32px",
              backgroundColor: "#fafafa",
              borderTop: "1px solid #e0e0e0",
              fontSize: "12px",
              color: "#999",
              textAlign: "center",
            }}
          >
            © 2025 Neurabot - Shared Transcription
          </div>
        </div>
      </main>
    </div>
  );
}
