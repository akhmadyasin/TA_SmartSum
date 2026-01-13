"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabaseClient";
import { generateShareToken } from "@/app/lib/shareUtils";
import s from "@/app/styles/dashboard.module.css"; // reuse layout styles
import h from "@/app/styles/collections.module.css";   // styles khusus collections

type UserMeta = {
  username?: string;
  avatar_url?: string;
  [k: string]: any;
};

type CollectionItem = {
  id: string;
  date: string;       
  duration: string;   
  transcript: string;
  summary: string;
};

const SAMPLE: CollectionItem[] = [
  {
    id: "1",
    date: "15 Januari 2025, 14:30",
    duration: "2 menit 15 detik",
    transcript:
      'Halo, ini adalah contoh transkrip dari sesi voice to text. Sistem ini bekerja dengan baik untuk mengkonversi suara menjadi teks secara real-time. Kemudian AI akan meringkas konten ini menjadi format yang lebih mudah dibaca.',
    summary:
      "Sesi voice to text berhasil mengkonversi suara menjadi teks dengan baik. Sistem bekerja real-time dan AI merangkum konten menjadi format yang mudah dibaca.",
  },
  {
    id: "2",
    date: "15 Januari 2025, 10:15",
    duration: "1 menit 45 detik",
    transcript:
      "Testing sistem voice recognition untuk memastikan semua fitur berfungsi dengan baik. Ini adalah uji coba kedua untuk memverifikasi kualitas transkripsi dan ringkasan AI.",
    summary:
      "Uji coba sistem voice recognition berhasil. Fitur transkripsi dan ringkasan AI berfungsi dengan baik.",
  },
];

export default function CollectionsPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  // auth/session
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [meta, setMeta] = useState<UserMeta>({});
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CollectionItem[]>(SAMPLE);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!session) {
        router.replace("/login");
        return;
      }
      setEmail(session.user.email || "");
      setMeta((session.user.user_metadata as UserMeta) || {});
      setUserId(session.user.id);

      // Fetch collections from Supabase
      try {
        const { data, error } = await supabase
          .from("collections")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching collections:", error);
        } else if (data) {
          // Map Supabase data to CollectionItem format
          const mapped: CollectionItem[] = data.map((item: any) => ({
            id: item.id,
            date: new Date(item.created_at).toLocaleDateString("id-ID", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            duration: item.metadata?.duration || "-",
            transcript: item.original_text,
            summary: item.summary_result,
          }));
          setItems(mapped);
        }
      } catch (err) {
        console.error("Error fetching collections:", err);
      }

      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (!sess) router.replace("/login");
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, supabase]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showProfileDropdown) {
        const target = event.target as Element;
        if (!target.closest(`.${s.avatar}`)) {
          setShowProfileDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileDropdown]);

  const username = meta.username || email.split("@")[0] || "User";
  const avatar = meta.avatar_url || "https://i.pravatar.cc/64?img=12";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.date.toLowerCase().includes(q) ||
        it.duration.toLowerCase().includes(q) ||
        it.transcript.toLowerCase().includes(q) ||
        it.summary.toLowerCase().includes(q)
    );
  }, [items, query]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Transkrip tersalin ✅");
    } catch {
      alert("Gagal menyalin.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus riwayat ini?")) return;

    try {
      // Delete from Supabase
      const { error } = await supabase
        .from("collections")
        .delete()
        .eq("id", id);

      if (error) {
        alert("Gagal menghapus: " + error.message);
        return;
      }

      // Update UI
      setItems((prev) => prev.filter((x) => x.id !== id));
      alert("Koleksi berhasil dihapus");
    } catch (err: any) {
      alert("Error saat menghapus: " + (err?.message || err));
    }
  };

  const handleShare = async (historyId: string, userId: string) => {
    try {
      // Generate unique token
      const shareToken = generateShareToken();
      
      // Insert ke share_tokens table
      const { error } = await supabase
        .from("share_tokens")
        .insert({
          token: shareToken,
          collection_id: historyId,
          created_by: userId,
          is_active: true,
        });

      if (error) {
        alert("Failed to create share link. Please try again.");
        return;
      }

      // Generate share URL dengan token
      const shareUrl = `${window.location.origin}/share/${shareToken}`;
      
      // Copy ke clipboard
      await navigator.clipboard.writeText(shareUrl);
      alert(`Share link copied!\n\n${shareUrl}`);
    } catch (err: any) {
      alert(`Error: ${err?.message || "Failed to create share link"}`);
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const toggleProfileDropdown = () => {
    setShowProfileDropdown(!showProfileDropdown);
  };

  const closeProfileDropdown = () => {
    setShowProfileDropdown(false);
  };

  if (loading) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card}>Loading history...</div>
        </main>
      </div>
    );
  }

  return (
    <div className={s.app}>
      {/* SIDEBAR */}
      <aside className={s.sidebar}>
        <div className={s.sbInner}>
          <div className={s.brand}>
            <Image
              src="/logo_neurabot.jpg"
              alt="Logo Neurabot"
              width={36}
              height={36}
              className={s.brandImg}
            />
            <div className={s.brandName}>Neurabot</div>
          </div>

          <nav className={s.nav} aria-label="Sidebar">
            <a className={s.navItem} href="/dashboard">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9,22 9,12 15,12 15,22"></polyline>
              </svg>
              <span>Dashboard</span>
            </a>
            <a className={`${s.navItem} ${s.active}`} href="/collections">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12,6 12,12 16,14"></polyline>
              </svg>
              <span>Collections</span>
            </a>
            <a className={s.navItem} href="/settings">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Settings</span>
            </a>
          </nav>

          <div className={s.sbFooter}>
            <div style={{ opacity: 0.6 }}>© 2025 Neurabot</div>
          </div>
        </div>
      </aside>

      {/* TOPBAR */}
      <header className={s.topbar}>
        <div className={s.tbWrap}>
          <div className={s.leftGroup}>
            <div className={s.search} role="search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="search"
                placeholder="Search collections..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search collections"
              />
            </div>
          </div>

          <div className={s.rightGroup}>
            <div className={s.avatar} onClick={toggleProfileDropdown}>
              <Image
                src={avatar}
                alt="Foto profil"
                width={36}
                height={36}
                unoptimized
              />
              <div className={s.meta}>
                <div className={s.name}>{username}</div>
              </div>
              
              {showProfileDropdown && (
                <div className={s.profileDropdown}>
                  <button className={s.dropdownItem} onClick={closeProfileDropdown}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Profile
                  </button>
                  <button className={s.dropdownItem} onClick={onLogout}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16,17 21,12 16,7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className={s.content}>
        <div className={h.collectionsContainer}>
          <div className={h.collectionsHeader}>
            <h2 className={h.title}>Transcription Collections</h2>
          </div>

          {filtered.length === 0 ? (
            <div className={h.emptyState}>
              <div className={h.emptyIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v5l4 2"></path>
                  <path d="M21 12A9 9 0 1 1 3 12"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
              </div>
              <h3>No Collections Yet</h3>
              <p>Start using Voice to Text to see your transcription collections and summaries here.</p>
            </div>
          ) : (
            <div className={h.collectionsGrid}>
              {filtered.map((it) => (
                <article key={it.id} className={h.collectionCard}>
                  <div className={h.cardHeader}>
                    <div className={h.cardDate}>
                      <span className={h.dateIcon}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                      </span>
                      {it.date}
                    </div>
                    <div className={h.cardTopActions}>
                      <button className={h.exportBtn} onClick={() => alert('Export functionality coming soon!')} title="Export">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7,10 12,15 17,10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                      </button>
                      <button className={h.shareBtn} onClick={() => userId && handleShare(it.id, userId)} title="Share">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3"></circle>
                          <circle cx="6" cy="12" r="3"></circle>
                          <circle cx="18" cy="19" r="3"></circle>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className={h.cardContent}>
                    <div className={h.transcriptSection}>
                      <h4 className={h.sectionTitle}>
                        <span className={h.sectionIcon}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                          </svg>
                        </span>
                        Transcript
                      </h4>
                      <div className={h.transcriptText}>
                        {it.transcript}
                      </div>
                    </div>

                    <div className={h.summarySection}>
                      <h4 className={h.sectionTitle}>
                        <span className={h.sectionIcon}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14,2 14,8 20,8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10,9 9,9 8,9"></polyline>
                          </svg>
                        </span>
                        Summary
                      </h4>
                      <div className={h.summaryText}>
                        {it.summary}
                      </div>
                    </div>
                  </div>

                  <div className={h.cardActions}>
                          <button className={`${h.actionBtn} ${h.secondaryBtn}`} onClick={() => router.push(`/detail/${it.id}`)}>
                            <span className={h.btnIcon}>
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                              </svg>
                            </span>
                            View Details
                          </button>
                    <button className={`${h.actionBtn} ${h.secondaryBtn}`} onClick={() => handleCopy(it.transcript)}>
                      <span className={h.btnIcon}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        </svg>
                      </span>
                      Copy
                    </button>
                    <button className={`${h.actionBtn} ${h.dangerBtn}`} onClick={() => handleDelete(it.id)}>
                      <span className={h.btnIcon}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3,6 5,6 21,6"></polyline>
                          <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </span>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

