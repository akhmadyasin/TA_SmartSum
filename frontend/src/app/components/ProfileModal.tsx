import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseClient";

type ProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  username: string;
  userId: string;
  onSaveSuccess?: (newName: string) => void;
};

export default function ProfileModal({
  isOpen,
  onClose,
  email,
  username,
  userId,
  onSaveSuccess,
}: ProfileModalProps) {
  const supabase = supabaseBrowser();
  const [fullName, setFullName] = useState("");
  const [editName, setEditName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Fetch full_name on mount
  useEffect(() => {
    if (isOpen && userId) {
      const fetchProfile = async () => {
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .single();

          if (!error && data) {
            setFullName(data.full_name || "");
            setEditName(data.full_name || "");
          }
        } catch (err) {
          console.error("Error fetching profile:", err);
        }
      };

      fetchProfile();
    }
  }, [isOpen, userId, supabase]);

  const handleSave = async () => {
    if (!editName.trim()) {
      setMessage({ type: "error", text: "Nama tidak boleh kosong" });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: editName })
        .eq("id", userId);

      if (error) {
        setMessage({ type: "error", text: "Gagal menyimpan profil" });
      } else {
        setFullName(editName);
        setMessage({ type: "success", text: "Profil berhasil diperbarui" });
        onSaveSuccess?.(editName);
        setTimeout(() => {
          setMessage(null);
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error("Error saving profile:", err);
      setMessage({ type: "error", text: "Terjadi kesalahan" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 999,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          zIndex: 1000,
          maxWidth: "500px",
          width: "90%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            color: "#6b7280",
            padding: "4px",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>

        {/* Content */}
        <div style={{ padding: "32px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937", margin: "0 0 32px" }}>
            Profil Saya
          </h2>

          {/* Avatar Section */}
          <div style={{ marginBottom: "32px" }}>
            <div
              style={{
                width: "100px",
                height: "100px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #ac7f5e 0%, #8b6749 100%)",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: "700",
                fontSize: "40px",
                border: "4px solid #e5e7eb",
              }}
            >
              {getInitials(fullName || username)}
            </div>
          </div>

          {/* Full Name */}
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: "600",
                color: "#6b7280",
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Nama Lengkap
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "16px",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: "600",
                color: "#6b7280",
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Email
            </label>
            <p style={{ fontSize: "14px", color: "#374151", margin: "0", wordBreak: "break-all" }}>
              {email}
            </p>
          </div>

          {/* Message */}
          {message && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "24px",
                fontSize: "14px",
                fontWeight: "500",
                backgroundColor: message.type === "success" ? "#d1fae5" : "#fee2e2",
                color: message.type === "success" ? "#065f46" : "#991b1b",
              }}
            >
              {message.text}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: "10px 16px",
                backgroundColor: "#f3f4f6",
                color: "#374151",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = "#e5e7eb";
              }}
              onMouseLeave={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = "#f3f4f6";
              }}
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                flex: 1,
                padding: "10px 16px",
                backgroundColor: "#ac7f5e",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: isSaving ? "not-allowed" : "pointer",
                opacity: isSaving ? 0.7 : 1,
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                const target = e.target as HTMLButtonElement;
                if (!isSaving) {
                  target.style.transform = "translateY(-2px)";
                  target.style.boxShadow = "0 6px 20px rgba(172, 127, 94, 0.3)";
                }
              }}
              onMouseLeave={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.transform = "translateY(0)";
                target.style.boxShadow = "none";
              }}
            >
              {isSaving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
