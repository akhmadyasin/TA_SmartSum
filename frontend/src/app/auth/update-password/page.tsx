"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabaseClient";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);

  useEffect(() => {
    // Cek apakah user sudah authenticated dengan recovery token
    // Supabase otomatis membaca #access_token dari URL hash
    const checkSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setErr("Invalid or missing reset token. Please request a new password reset.");
        } else {
          setIsValidToken(true);
        }
      } catch (error) {
        setErr("Invalid or missing reset token. Please request a new password reset.");
      }
    };
    
    checkSession();
  }, [supabase.auth]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    // Validasi
    if (!password || !confirm) {
      setErr("Please fill in all fields.");
      return;
    }

    if (password !== confirm) {
      setErr("Password confirmation does not match.");
      return;
    }

    if (password.length < 6) {
      setErr("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      setLoading(false);

      if (error) {
        setErr(error.message);
        return;
      }

      setSuccess(true);
      setPassword("");
      setConfirm("");

      // Redirect ke login setelah 2 detik
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setLoading(false);
      setErr("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <div className="auth-container">
      <div className="form-side">
        <div className="form-box">
          <h1>Reset Password</h1>
          <p style={{ textAlign: "center", color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
            Enter your new password to regain access to your account
          </p>

          {err && <div className="alert error">{err}</div>}
          {success && (
            <div className="alert success">
              Password updated successfully! Redirecting to login...
            </div>
          )}

          {isValidToken && !err && (
            <form onSubmit={onSubmit}>
              <label>New Password</label>
              <input
                type="password"
                placeholder="Enter your new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />

              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />

              <button className="btn primary" type="submit" disabled={loading || success}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}

          <p className="muted center" style={{ marginTop: 24 }}>
            Remember your password? <a href="/login">Back to login</a>
          </p>
        </div>
      </div>

      <div className="image-side">
        <img src="/login.jpg" alt="Reset Password Illustration" />
      </div>
    </div>
  );
}
