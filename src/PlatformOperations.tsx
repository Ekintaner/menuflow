import { useEffect, useState } from "react";
type RequestRow = {
  id: string;
  applicant_name: string;
  email: string;
  business_name: string;
  phone?: string;
  status: string;
  created_at: string;
};
type Audit = {
  id: string;
  action: string;
  reason?: string;
  actor_id: string;
  target_id: string;
  created_at: string;
};
export function PlatformOperations({ demo }: { demo: boolean }) {
  const [overview, setOverview] = useState<Record<string, number>>({}),
    [requests, setRequests] = useState<RequestRow[]>(
      demo
        ? [
            {
              id: "demo-request",
              applicant_name: "Deniz Yılmaz",
              email: "deniz@example.test",
              business_name: "Kıyı Kahve",
              status: "pending",
              created_at: new Date().toISOString(),
            },
          ]
        : [],
    ),
    [status, setStatus] = useState("pending"),
    [audit, setAudit] = useState<Audit[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  async function api(path: string, data?: unknown) {
    const r = await fetch(
      "/api/v1/platform/" + path,
      data === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          },
    );
    const b = await r.json();
    if (!r.ok) throw Error(b.message || "İşlem tamamlanamadı.");
    return b;
  }
  useEffect(() => {
    if (demo) return;
    let current = true;
    void Promise.all([
      api("overview"),
      api("registrations?status=" + status),
      api("audit"),
    ])
      .then(([o, r, a]) => {
        if (current) {
          setOverview(o);
          setRequests(r.requests);
          setNext(r.next);
          setAudit(a);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [demo, status]);
  async function decide(row: RequestRow, approved: boolean) {
    const reason = approved ? "" : window.prompt("Ret gerekçesi");
    if (!approved && !reason?.trim()) return;
    const count = approved
      ? Number(window.prompt("Başlangıç masa sayısı (1–100)", "4"))
      : 0;
    if (approved && (!Number.isInteger(count) || count < 1 || count > 100))
      return;
    if (
      approved &&
      !window.confirm(
        row.business_name +
          " başvurusu onaylansın mı? Hesap yalnız bağlantı ile etkinleştirildikten sonra açılacak.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    setLink("");
    try {
      if (demo) {
        setRequests(requests.filter((r) => r.id !== row.id));
        setNotice(
          "Örnek başvuru " +
            (approved
              ? "onaylandı. Gerçek hesap oluşturulmadı."
              : "reddedildi."),
        );
        return;
      }
      const r = await api(
        "registrations/" + row.id + "/" + (approved ? "approve" : "reject"),
        approved ? { table_count: count } : { reason },
      );
      setLink(r.activation_url || "");
      setNotice(
        approved
          ? "Başvuru onaylandı. Etkinleştirme bağlantısını yalnız başvuru sahibine güvenli kanaldan iletin. E-posta gönderilmedi."
          : "Başvuru reddedildi.",
      );
      const [o, rs, a] = await Promise.all([
        api("overview"),
        api("registrations?status=" + status),
        api("audit"),
      ]);
      setOverview(o);
      setRequests(rs.requests);
      setNext(rs.next);
      setAudit(a);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="my-7" aria-label="Platform işlemleri">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["restaurants", "Restoran"],
          ["active_restaurants", "Aktif restoran"],
          ["pending", "Bekleyen başvuru"],
          ["open_checks", "Açık adisyon"],
        ].map(([key, label]) => (
          <article key={key} className="card">
            <p className="text-sm text-stone-600">{label}</p>
            <strong className="mt-3 block text-3xl">
              {demo
                ? {
                    restaurants: 1,
                    active_restaurants: 1,
                    pending: requests.length,
                    open_checks: 0,
                  }[key as "restaurants"]
                : (overview[key] ?? "—")}
            </strong>
          </article>
        ))}
      </div>
      <section className="card my-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">KONTROLLÜ ONBOARDING</p>
            <h2>İşletme başvuruları</h2>
          </div>
          <label>
            Başvuru durumu
            <select
              value={status}
              disabled={busy}
              onChange={(e) => {
                setStatus(e.target.value);
                setRequests([]);
              }}
            >
              <option value="pending">Bekliyor</option>
              <option value="processing">İşleniyor</option>
              <option value="approved">Etkinleştirme bekliyor</option>
              <option value="activated">Etkinleştirildi</option>
              <option value="rejected">Reddedildi</option>
            </select>
          </label>
        </div>
        {error && (
          <p className="my-4 text-red-800" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="my-4" role="status">
            {notice}
          </p>
        )}
        {link && (
          <div className="my-5 rounded border border-stone-300 p-4">
            <p>
              Tek kullanımlık etkinleştirme bağlantısı — bu ekran dışında
              paylaşmayın.
            </p>
            <a
              className="my-3 block break-all underline"
              href={link}
              referrerPolicy="no-referrer"
            >
              Etkinleştirme bağlantısını aç
            </a>
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(link)
                  .catch(() =>
                    setError(
                      "Bağlantıyı kopyalamak için bağlantıya sağ tıklayın.",
                    ),
                  )
              }
            >
              Bağlantıyı kopyala
            </button>
          </div>
        )}
        {!requests.length && (
          <p className="my-6 text-stone-600">Bu durumda başvuru bulunmuyor.</p>
        )}
        {requests.map((r) => (
          <article className="my-5 border-t border-stone-200 pt-5" key={r.id}>
            <h3 className="font-bold">{r.business_name}</h3>
            <p className="my-2 text-sm">
              {r.applicant_name} · {r.email}
              {r.phone && " · " + r.phone}
            </p>
            <p className="text-xs text-stone-600">
              {new Date(r.created_at).toLocaleString("tr-TR")} · {r.status}
            </p>
            {r.status === "approved" && (
              <button
                className="mt-3"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void api("registrations/" + r.id + "/invite", {})
                    .then((result) => {
                      setLink(result.activation_url);
                      setNotice(
                        "Yeni bağlantıyı yalnız başvuru sahibine iletin; önceki bağlantı artık geçersiz olabilir.",
                      );
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Etkinleştirme bağlantısını yenile
              </button>
            )}
            {r.status === "pending" && (
              <div className="mt-3 flex gap-3">
                <button disabled={busy} onClick={() => void decide(r, true)}>
                  Başvuruyu onayla {r.business_name}
                </button>
                <button disabled={busy} onClick={() => void decide(r, false)}>
                  Başvuruyu reddet {r.business_name}
                </button>
              </div>
            )}
          </article>
        ))}
        {next && (
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api("registrations?status=" + status + "&after=" + next)
                .then((r) => {
                  setRequests([...requests, ...r.requests]);
                  setNext(r.next);
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Diğer başvurular
          </button>
        )}
      </section>
      <details className="card">
        <summary className="cursor-pointer font-bold">
          Platform işlem geçmişi
        </summary>
        <p className="my-3 text-xs text-stone-600">
          Son 100 yönetim işlemi. Etkinleştirme bağlantıları ve parolalar
          kaydedilmez.
        </p>
        {audit.map((a) => (
          <p className="my-3 break-all text-xs" key={a.id}>
            {new Date(a.created_at).toLocaleString("tr-TR")} · {a.action} ·
            Hedef {a.target_id} · Aktör {a.actor_id}
            {a.reason && " · Gerekçe: " + a.reason}
          </p>
        ))}
      </details>
    </section>
  );
}
