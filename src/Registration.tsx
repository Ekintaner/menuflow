import { useEffect, useRef, useState, type FormEvent } from "react";
export function RegistrationRequest() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/auth/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_name: f.get("name"),
          email: f.get("email"),
          business_name: f.get("business"),
          phone: f.get("phone"),
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.message || "Başvuru alınamadı.");
      setMessage(b.message);
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="flex justify-between">
        <a href="/login" className="text-xl font-bold">
          MenuFlow.
        </a>
        <a href="/login">Girişe dön</a>
      </header>
      <section className="card mx-auto mt-10 max-w-lg">
        <p className="eyebrow">İŞLETMENİZİ MENUFLOW İLE TANIŞTIRIN</p>
        <h1>Erişim başvurusu</h1>
        <p className="my-5 text-stone-600">
          Başvurunuz platform yöneticisi tarafından incelenir. Onaydan sonra
          size özel bağlantıyla hesabınızı etkinleştirebilirsiniz.
        </p>
        {message ? (
          <p role="status">{message}</p>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <label>
              Adınız
              <input name="name" autoComplete="name" maxLength={120} required />
            </label>
            <label>
              E-posta
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <label>
              İşletme adı
              <input
                name="business"
                autoComplete="organization"
                maxLength={120}
                required
              />
            </label>
            <label>
              Telefon (isteğe bağlı)
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={32}
              />
            </label>
            <p className="text-sm text-stone-600">
              Başvuru sırasında parola alınmaz. Başvuru otomatik hesap veya
              üyelik açmaz.
            </p>
            <button disabled={busy}>Başvuruyu gönder</button>
          </form>
        )}
        {error && (
          <p role="alert" className="my-4 text-red-800">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
export function Activation() {
  const [fragment] = useState(
      () => new URLSearchParams(location.hash.slice(1)),
    ),
    boot = useRef<Promise<void> | null>(null),
    [ready, setReady] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    history.replaceState(null, "", location.pathname);
    boot.current ??= (async () => {
      const r = await fetch("/api/v1/auth/activation-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token_hash: fragment.get("token_hash"),
          type: fragment.get("type"),
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.message || "Bağlantı geçersiz.");
    })();
    let current = true;
    boot.current
      .then(() => {
        if (current) setReady(true);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [fragment]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    if (f.get("password") !== f.get("confirm")) {
      setError("Parolalar eşleşmiyor.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: f.get("password") }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.message || "Etkinleştirme tamamlanamadı.");
      form.reset();
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header>
        <a href="/login">MenuFlow.</a>
      </header>
      <section className="card mx-auto mt-12 max-w-md">
        <h1>Hesabınızı etkinleştirin.</h1>
        <p className="my-5 text-stone-600">
          Size özel bağlantı doğrulandıktan sonra parolanızı kendiniz
          belirleyin.
        </p>
        {done ? (
          <div role="status">
            <p>Hesabınız hazır.</p>
            <a className="mt-5 inline-block underline" href="/login">
              Giriş yap
            </a>
          </div>
        ) : ready ? (
          <form className="space-y-4" onSubmit={submit}>
            <label>
              Yeni parola
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <label>
              Parola tekrarı
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <button disabled={busy}>Hesabı etkinleştir</button>
          </form>
        ) : (
          !error && <p>Bağlantı doğrulanıyor…</p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-red-800">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
