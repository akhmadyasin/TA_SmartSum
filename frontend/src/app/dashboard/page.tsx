"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import s from "@/app/styles/dashboard.module.css";
import VoicePanel from "@/app/components/VoicePanel";
import ProfileModal from "@/app/components/ProfileModal";
import { supabaseBrowser } from "@/app/lib/supabaseClient";

type UserMeta = {
  username?: string;
  avatar_url?: string;
  [k: string]: any;
};

type RecentSummary = {
  id: string;
  title: string;
  description: string;
  time: string; // human readable, e.g., "10 minutes ago"
};

export default function Dashboard() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  // auth/session
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [meta, setMeta] = useState<UserMeta>({});
  const [userId, setUserId] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");

  // ui state
  const [listening, setListening] = useState(false);
  const toggleListening = () => setListening((v) => !v);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // statistics
  const [totalSessions, setTotalSessions] = useState(0);
  const [wordsTranscribed, setWordsTranscribed] = useState(0);
  const [summariesCreated, setSummariesCreated] = useState(0);

  // recent summaries
  const [recentSummaries, setRecentSummaries] = useState<RecentSummary[]>([]);

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
      setUserId(session.user.id);
      setMeta((session.user.user_metadata as UserMeta) || {});
      
      // Fetch full_name from profiles table
      try {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", session.user.id)
          .single();

        if (!profileError && profileData) {
          setFullName(profileData.full_name || "");
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      }
      
      // Fetch collections data from Supabase
      try {
        const { data, error } = await supabase
          .from("collections")
          .select("original_text, summary_result, created_at, id")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false });

        if (!error && data) {
          // Calculate stats
          const sessions = data.length;
          let totalWords = 0;
          let summaries = 0;

          data.forEach((item: any) => {
            if (item.original_text) {
              totalWords += (item.original_text as string).split(/\s+/).length;
            }
            if (item.summary_result && item.summary_result.trim() !== "") {
              summaries += 1;
            }
          });

          setTotalSessions(sessions);
          setWordsTranscribed(totalWords);
          setSummariesCreated(summaries);

          // Set recent summaries (top 3)
          const recent = data.slice(0, 3).map((item: any) => ({
            id: item.id,
            title: `Session ${new Date(item.created_at).toLocaleDateString("id-ID")}`,
            description: item.original_text?.substring(0, 100) || "No transcript",
            time: new Date(item.created_at).toLocaleDateString("id-ID", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          }));
          setRecentSummaries(recent);
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

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const toggleProfileDropdown = () => {
    setShowProfileDropdown(!showProfileDropdown);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const closeProfileDropdown = () => {
    setShowProfileDropdown(false);
  };

  const username = fullName || meta.username || "User";
  const avatar   = meta.avatar_url || "https://i.pravatar.cc/64?img=12";

  if (loading) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card}>Memuat dashboard…</div>
        </main>
      </div>
    );
  }

  return (
    <div className={s.app}>
      {/* SIDEBAR */}
      <aside className={s.sidebar} id="sidebar">
        {/* ... (isi sidebar Anda tetap sama, tidak perlu diubah) ... */}
        <div className={s.sbInner}>
          <div className={s.brand}>
            <Image
              src="/logo-smartsum.png" alt="Logo SmartSum" width={40} height={40} className={s.brandImg}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                const next = target.nextElementSibling as HTMLElement | null;
                if (next) next.style.display = "grid";
              }}
            />
            <div className={s.brandLogo} style={{ display: "none" }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#07131f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.5 6H8.5L12 2Z"></path><path d="M12 22l-3.5-6h7L12 22Z"></path><path d="M2 12l6-3.5v7L2 12Z"></path><path d="M22 12l-6 3.5v-7L22 12Z"></path></svg>
            </div>
            <div className={s.brandName}>SmartSum</div>
          </div>
          <nav className={s.nav} aria-label="Sidebar">
            <a className={`${s.navItem} ${s.active}`} href="/dashboard"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9,22 9,12 15,12 15,22"></polyline></svg><span>Dashboard</span></a>
            <a className={s.navItem} href="/collections"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12,6 12,12 16,14"></polyline></svg><span>Collections</span></a>
            <a className={s.navItem} href="/settings"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg><span>Settings</span></a>
          </nav>
          <div className={s.sbFooter}>
            <div style={{ opacity: 0.6 }}>© 2025 SmartSum</div>
          </div>
        </div>
      </aside>

      {/* TOPBAR */}
      <header className={s.topbar}>
        {/* ... (isi topbar Anda tetap sama, tidak perlu diubah) ... */}
        <div className={s.tbWrap}>
          <div className={s.leftGroup}>
            <div className={s.search} role="search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
              <input type="search" placeholder="Search something..." />
            </div>
          </div>
          <div className={s.rightGroup}>
            <button className={s.listenBtn} aria-pressed={listening} onClick={toggleListening}>
              <span className={s.dot} aria-hidden />
              <span className={s.btnLabel}>{listening ? "Close Panel" : "Start Listening"}</span>
            </button>
            <div className={s.avatar} onClick={toggleProfileDropdown}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #ac7f5e 0%, #8b6749 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontWeight: "700",
                  fontSize: "16px",
                }}
              >
                {getInitials(username)}
              </div>
              <div className={s.meta}>
                <div className={s.name}>{username}</div>
                <div className={s.role}></div>
              </div>
              {showProfileDropdown && (
                <div className={s.profileDropdown}>
                  <button className={s.dropdownItem} onClick={() => { closeProfileDropdown(); setShowProfileModal(true); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Profile</button>
                  <button className={s.dropdownItem} onClick={onLogout}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16,17 21,12 16,7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> Logout</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* KONTEN UTAMA */}
      <main className={s.content}>
        {/* Tampilan Dashboard Utama */}
        <div className={s.dashboardContainer} style={{ display: listening ? 'none' : 'block' }}>
          {/* ... (seluruh isi dashboard Anda yang sebelumnya ada di dalam {!listening ? (...)}) ... */}
          <div className={s.topCards}>
            <div className={s.statsCard}><div className={s.cardIcon}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></div><div className={s.cardContent}><h3>Total Sessions</h3><div className={s.cardValue}>{totalSessions}</div><div className={s.cardSubtext} style={{color: '#10b981'}}>Total input videos</div></div></div>
            <div className={s.statsCard}><div className={s.cardIcon}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg></div><div className={s.cardContent}><h3>Words Transcribed</h3><div className={s.cardValue}>{wordsTranscribed.toLocaleString()}</div><div className={s.cardSubtext}>Total words transcript</div></div></div>
            <div className={s.statsCard}><div className={s.cardIcon}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7z"></path></svg></div><div className={s.cardContent}><h3>Summaries Created</h3><div className={s.cardValue}>{summariesCreated}</div><div className={s.cardSubtext}>Total summaries</div></div></div>
          </div>
          <div className={s.activitySection} style={{padding: 0}}>
            {/* Slide Container with Side Navigation */}
            <div className={s.slideWrapper}>
              <button 
                className={s.slideBtnSide}
                onClick={() => setCurrentSlide((prev) => (prev - 1 + 3) % 3)}
                aria-label="Previous slide"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>

              <div className={s.slideContainer}>
                {/* Slide 1: Transcript */}
                <div className={`${s.slide} ${currentSlide === 0 ? s.active : ''}`} style={{display: currentSlide === 0 ? 'block' : 'none'}}>
                  <div className={s.slideContent}>
                    <Image 
                      src="/input-slide.png" 
                      alt="Quick Transcript" 
                      width={800} 
                      height={240}
                      style={{ width: '100%', height: 'auto' }}
                    />
                  </div>
                </div>

                {/* Slide 2: Summarize */}
                <div className={`${s.slide} ${currentSlide === 1 ? s.active : ''}`} style={{display: currentSlide === 1 ? 'block' : 'none'}}>
                  <div className={s.slideContent}>
                    <Image 
                      src="/summary-slide.png" 
                      alt="Instant Summarize" 
                      width={800} 
                      height={240}
                      style={{ width: '100%', height: 'auto' }}
                    />
                  </div>
                </div>

                {/* Slide 3: Save & Manage */}
                <div className={`${s.slide} ${currentSlide === 2 ? s.active : ''}`} style={{display: currentSlide === 2 ? 'block' : 'none'}}>
                  <div className={s.slideContent}>
                    <Image 
                      src="/save-slide.png" 
                      alt="Save & Manage" 
                      width={800} 
                      height={240}
                      style={{ width: '100%', height: 'auto' }}
                    />
                  </div>
                </div>
              </div>

              <button 
                className={s.slideBtnSide}
                onClick={() => setCurrentSlide((prev) => (prev + 1) % 3)}
                aria-label="Next slide"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>

            {/* Dots Navigation */}
            <div className={s.slideDots}>
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  className={`${s.dot} ${currentSlide === i ? s.active : ''}`}
                  onClick={() => setCurrentSlide(i)}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
          <div className={s.recentSection}>
            <h2><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', display: 'inline-block', verticalAlign: 'middle'}}><circle cx="12" cy="12" r="10"></circle><polyline points="12,6 12,12 16,14"></polyline></svg> Recent Summaries</h2>
            <div className={s.recentList}>{recentSummaries.map((item) => (<div key={item.id} className={s.recentItem} onClick={() => router.push(`/detail/${item.id}`)} style={{cursor: 'pointer'}}><div className={s.recentIcon}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg></div><div className={s.recentContent}><div className={s.recentTitle}>{item.title}</div><div className={s.recentDesc}>{item.description}</div><div className={s.recentTime}>{item.time}</div></div></div>))}</div>
          </div>
        </div>

        {/* Tampilan Voice Panel */}
        <div className={s.voiceWrap} style={{ display: listening ? 'block' : 'none' }}>
          <div className={s.voiceFrame}>
            <VoicePanel />
          </div>
        </div>
      </main>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        email={email}
        username={username}
        userId={userId}
        onSaveSuccess={(newName) => setFullName(newName)}
      />
    </div>
  );
}