import { useEffect, useState, type FormEvent } from "react";
type Member = {
  id: string;
  user_id: string;
  role: "owner" | "staff";
  active: boolean;
};
export function PlatformMembers({
  tenant,
  demo,
}: {
  tenant: string;
  demo: boolean;
}) {
  const [members, setMembers] = useState<Member[]>(
      demo
        ? [
            {
              id: "demo-owner",
              user_id: "Örnek işletme sahibi",
              role: "owner",
              active: true,
            },
          ]
        : [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function api(path: string, data?: unknown, method = "POST") {
    const r = await fetch(
      `/api/v1${path}`,
      data === undefined
        ? {}
        : {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          },
    );
    const result = await r.json();
    if (!r.ok) {
      if ([401, 403].includes(r.status)) setMembers([]);
      throw new Error(result.message || "İşlem tamamlanamadı.");
    }
    return result;
  }
  const endpoint = `/platform/restaurants/${tenant}/memberships`;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    void fetch(`/api/v1${endpoint}`, { signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "Üyelikler alınamadı.");
        if (!controller.signal.aborted) setMembers(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [demo, endpoint]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function grant(event: FormEvent<HTMLFormElement>, create: boolean) {
    event.preventDefault();
    const form = event.currentTarget,
      f = new FormData(form),
      role = f.get("role") as "owner" | "staff";
    await run(async () => {
      if (demo) {
        setMembers([
          ...members,
          {
            id: crypto.randomUUID(),
            user_id: String(create ? f.get("email") : f.get("user_id")),
            role,
            active: true,
          },
        ]);
        setNotice(
          "Örnek üyelik eklendi. Gerçek hesap veya e-posta oluşturulmadı.",
        );
        form.reset();
        return;
      }
      try {
        if (create) {
          const result = await api("/platform/accounts", {
            tenant_id: tenant,
            email: f.get("email"),
            password: f.get("password"),
            role,
          });
          setNotice(
            result.membership_assigned
              ? `Hesap ve üyelik açıldı. Hesap UUID: ${result.user_id}`
              : `${result.message} Hesap UUID: ${result.user_id}`,
          );
        } else {
          await api(endpoint, { user_id: f.get("user_id"), role });
          setNotice("Üyelik verildi.");
        }
        setMembers(await api(endpoint));
      } finally {
        form.reset();
      }
    });
  }
  async function toggle(member: Member) {
    await run(async () => {
      if (demo) {
        if (
          member.role === "owner" &&
          member.active &&
          members.filter((m) => m.role === "owner" && m.active).length === 1
        )
          throw new Error("Son aktif işletme sahibi kapatılamaz.");
        setMembers(
          members.map((m) =>
            m.id === member.id ? { ...m, active: !m.active } : m,
          ),
        );
      } else {
        await api(
          endpoint,
          { user_id: member.user_id, active: !member.active },
          "PATCH",
        );
        setMembers(await api(endpoint));
      }
      setNotice("Üyelik durumu güncellendi.");
    });
  }
  return (
    <section className="card mt-6" aria-label="Hesap ve üyelik yönetimi">
      <h2>Hesaplar ve üyelikler</h2>
      <p className="my-3 text-sm">
        Yalnız platform yöneticisi hesap açabilir ve işletme sahibi/çalışan
        üyeliği verebilir. Parolayı ilgili kişiye güvenli kanaldan iletin;
        e-posta gönderilmez.
      </p>
      {demo && (
        <p className="my-3 text-sm">
          Bu örnekte gerçek e-posta veya parola kullanmayın; değişiklikler
          yenileyince silinir.
        </p>
      )}
      {error && (
        <p role="alert" className="my-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="my-4 text-green-800 break-words">
          {notice}
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <form className="space-y-3" onSubmit={(e) => void grant(e, true)}>
          <h3 className="font-bold">Yeni hesap aç</h3>
          <label className="block">
            Hesap e-postası
            <input name="email" type="email" autoComplete="off" required />
          </label>
          <label className="block">
            İlk parola
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="block">
            Yeni hesap rolü
            <select name="role">
              <option value="owner">İşletme sahibi</option>
              <option value="staff">Çalışan</option>
            </select>
          </label>
          <button disabled={busy}>Hesap ve üyelik oluştur</button>
        </form>
        <form className="space-y-3" onSubmit={(e) => void grant(e, false)}>
          <h3 className="font-bold">Mevcut hesaba üyelik ver</h3>
          <label className="block">
            Hesap UUID
            <input name="user_id" maxLength={36} required />
          </label>
          <label className="block">
            Üyelik rolü
            <select name="role">
              <option value="staff">Çalışan</option>
              <option value="owner">İşletme sahibi</option>
            </select>
          </label>
          <button disabled={busy}>Üyelik ver</button>
        </form>
      </div>
      <h3 className="mt-6 font-bold">Bu işletmenin üyeleri</h3>
      {members.length >= 200 && <p>İlk 200 üyelik gösteriliyor.</p>}
      <ul className="mt-3 space-y-3">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-3"
          >
            <span className="min-w-0 break-all">
              {m.user_id} · {m.role === "owner" ? "İşletme sahibi" : "Çalışan"}{" "}
              · {m.active ? "Aktif" : "Pasif"}
            </span>
            <button disabled={busy} onClick={() => void toggle(m)}>
              {m.active ? "Üyeliği kapat" : "Üyeliği aç"} {m.user_id}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
