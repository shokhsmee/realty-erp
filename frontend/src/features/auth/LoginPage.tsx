import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@realty.uz");
  const [password, setPassword] = useState("admin12345");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kirishда xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-7 shadow-lg"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-8 w-8 flex-none rounded border-[1.5px] border-accent" />
          <div>
            <div className="text-lg font-extrabold leading-none">Blueprint OS</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
              Realty ERP
            </div>
          </div>
        </div>

        <label className="mb-1 block text-[11.5px] font-semibold text-ink-2">Email</label>
        <input
          className="mb-3 w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <label className="mb-1 block text-[11.5px] font-semibold text-ink-2">Parol</label>
        <input
          type="password"
          className="mb-4 w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && (
          <div className="mb-3 rounded-sm border border-crit-line bg-crit-bg px-3 py-2 text-[12.5px] text-crit">
            {error}
          </div>
        )}

        <Button type="submit" disabled={busy} className="w-full justify-center">
          {busy ? "Kirilmoqda…" : "Kirish"}
        </Button>
      </form>
    </div>
  );
}
