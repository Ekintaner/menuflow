import { useEffect, useState, type FormEvent } from "react";
const destination = (value: unknown) =>
  value === "/platform" ? "/platform" : "/admin";
export function PanelLogin() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Giriş yapılamadı.");
      form.reset();
      window.location.replace(destination(result.destination));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card mx-auto mt-8 max-w-md">
      <p className="eyebrow">MENUFLOW YÖNETİM</p>
      <h2 className="mt-3">Panel girişi</h2>
      <p className="my-4 text-stone-600">
        Platform yöneticisi ve işletmeler aynı yerden giriş yapar. Hesabınızın
        yetkisine göre kendi paneliniz açılır.
      </p>
      {error && (
        <p role="alert" className="my-4 text-red-800">
          {error}
        </p>
      )}
      <form onSubmit={login} className="space-y-4">
        <label className="block">
          E-posta
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label className="block">
          Parola
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button disabled={busy}>
          {busy ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>
      <p className="mt-5 text-sm">
        Hesap ve işletme üyelikleri platform yöneticisi onayıyla açılır.
      </p>
      <a className="mt-4 inline-block text-sm underline" href="/register">
        Kayıt ol / Erişim iste
      </a>
      <p className="mt-3 text-xs text-stone-500">
        QR menüden sipariş vermek için hesap gerekmez.
      </p>
    </section>
  );
}
export function LoginPage() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/auth/session", { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (!controller.signal.aborted)
            window.location.replace(destination(data.destination));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <header>
        <a href="/" className="text-2xl font-bold">
          MenuFlow.
        </a>
      </header>
      <h1 className="mt-10 text-center">Yönetim tek yerde.</h1>
      <PanelLogin />
    </main>
  );
}
