import { useEffect, useRef, useState } from "react";
type Table = {
  id: string;
  name: string;
  active: boolean;
  check_id: string | null;
  version: number;
  currency: string;
  total_minor: number;
  active_orders: number;
};
type Bill = {
  id: string;
  table_name: string;
  state: string;
  payment_status: string;
  total_minor: number;
  currency: string;
  version: number;
  opened_at: string;
  orders: {
    id: string;
    status: string;
    total_minor: number;
    items: {
      id: string;
      product_name: string;
      unit_price_minor: number;
      quantity: number;
      line_total_minor: number;
    }[];
  }[];
  settlements: { action: string; amount_minor: number; reason?: string }[];
};
const money = (n: number, c = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: c }).format(
    n / 100,
  );
const stateLabels: Record<string, string> = {
  pending_acceptance: "Onay bekliyor",
  accepted: "Kabul edildi",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  served: "Teslim edildi",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
};
export function TableChecks({ tenant }: { tenant: string }) {
  const [tables, setTables] = useState<Table[]>([]),
    [detail, setDetail] = useState<Bill>(),
    [past, setPast] = useState<(Bill & { settled_total_minor: number })[]>([]),
    [history, setHistory] = useState(false),
    [cursor, setCursor] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [hasAttempt, setHasAttempt] = useState(false),
    [reason, setReason] = useState("");
  const pending = useRef<{ id: string; key: string; payload: unknown } | null>(
    null,
  );
  async function api(path: string, data?: unknown, key?: string) {
    const r = await fetch("/api/v1/admin/checks" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const b = await r.json();
    if (!r.ok)
      throw Object.assign(new Error(b.message || "Adisyon alınamadı."), {
        status: r.status,
      });
    return b;
  }
  useEffect(() => {
    let current = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!document.hidden)
        try {
          const r = await fetch("/api/v1/admin/checks?tenant=" + tenant);
          const b = await r.json();
          if (!r.ok)
            throw Object.assign(Error(b.message || "Adisyon alınamadı."), {
              status: r.status,
            });
          if (current) {
            setTables(b);
            setLoaded(true);
          }
        } catch (e) {
          if (current) {
            setError((e as Error).message);
            if ([401, 403].includes((e as { status: number }).status)) {
              setTables([]);
              setDetail(undefined);
              return;
            }
          }
        }
      if (current) timer = setTimeout(poll, 6000);
    }
    void poll();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [tenant]);
  async function load(id: string) {
    setBusy(true);
    setError("");
    try {
      setDetail(await api("/" + id + "?tenant=" + tenant));
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory(after = "") {
    setBusy(true);
    setError("");
    try {
      const r = await api(
        "?tenant=" +
          tenant +
          "&history=true" +
          (after ? "&cursor=" + encodeURIComponent(after) : ""),
      );
      setPast((previous) => (after ? [...previous, ...r] : r));
      const last = r.at(-1);
      setCursor(r.length === 50 ? last.opened_at + "|" + last.id : "");
      setHistory(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function settle(action: "pay" | "void") {
    if (!detail || busy) return;
    if (
      !pending.current &&
      !window.confirm(
        action === "pay"
          ? "Ödemenin işletmede alındığını onaylıyor musunuz? Adisyon kapanacak."
          : "Sıfır tutarlı adisyon gerekçesiyle iptal edilip kapatılsın mı?",
      )
    )
      return;
    const attempt = pending.current ?? {
      id: detail.id,
      key: crypto.randomUUID(),
      payload: {
        version: detail.version,
        action,
        expected_total_minor: detail.total_minor,
        reason: reason || undefined,
      },
    };
    pending.current = attempt;
    setHasAttempt(true);
    setBusy(true);
    setError("");
    try {
      await api(
        "/" + attempt.id + "/settle?tenant=" + tenant,
        attempt.payload,
        attempt.key,
      );
      pending.current = null;
      setHasAttempt(false);
      setDetail(await api("/" + attempt.id + "?tenant=" + tenant));
      setTables(await api("?tenant=" + tenant));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status && status < 500 && status !== 429) {
        pending.current = null;
        setHasAttempt(false);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="my-7" aria-label="Masa adisyonları">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">SALON GÖRÜNÜMÜ</p>
          <h2>Masalar ve açık adisyonlar</h2>
        </div>
        <button disabled={busy} onClick={() => void loadHistory()}>
          Geçmiş adisyonlar
        </button>
      </div>
      {error && (
        <p className="my-4 text-red-800" role="alert">
          {error}
        </p>
      )}
      <div className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((t) => (
          <article className="card" key={t.id}>
            <div className="flex justify-between">
              <h3 className="font-bold">{t.name}</h3>
              <span className="text-xs">
                {!t.active
                  ? "Masa kapalı"
                  : t.check_id
                    ? "Açık adisyon"
                    : "Boş"}
              </span>
            </div>
            <p className="my-5 text-3xl font-semibold">
              {money(t.total_minor, t.currency)}
            </p>
            <p className="mb-4 text-sm text-stone-600">
              {t.active_orders} aktif sipariş ·{" "}
              {t.check_id ? "Ödenmedi" : "Yeni ziyaret için hazır"}
            </p>
            {t.check_id && (
              <button
                disabled={busy || hasAttempt}
                onClick={() => void load(t.check_id!)}
              >
                {t.name} adisyonunu aç
              </button>
            )}
          </article>
        ))}
      </div>
      {!loaded && !error && <p role="status">Adisyonlar yükleniyor…</p>}
      {loaded && !tables.length && !error && (
        <p>Henüz masa yok. Masalar bölümünden masa ekleyin.</p>
      )}
      {history && (
        <section className="card my-5">
          <h2>Geçmiş adisyonlar</h2>
          {!past.length && <p className="my-4">Kapalı adisyon bulunmuyor.</p>}
          {past.map((c) => (
            <button className="m-2" key={c.id} onClick={() => void load(c.id)}>
              {c.table_name} · {money(c.settled_total_minor, c.currency)} ·{" "}
              {c.payment_status === "paid" ? "Ödendi" : "İptal"} ·{" "}
              {new Date(c.opened_at).toLocaleString("tr-TR")}
            </button>
          ))}
          {cursor && (
            <button disabled={busy} onClick={() => void loadHistory(cursor)}>
              Daha eski adisyonlar
            </button>
          )}
        </section>
      )}
      {detail && (
        <section className="card my-6" aria-label="Adisyon ayrıntısı">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">ADİSYON AYRINTISI</p>
              <h2>{detail.table_name}</h2>
            </div>
            <strong className="text-2xl">
              {money(detail.total_minor, detail.currency)}
            </strong>
          </div>
          <button
            className="mt-4"
            disabled={busy || hasAttempt}
            onClick={() => void load(detail.id)}
          >
            Adisyonu yenile
          </button>
          <p className="my-4">
            {detail.state === "open"
              ? "Açık · Ödenmedi"
              : detail.payment_status === "paid"
                ? "Kapalı · Ödendi"
                : "Kapalı · İptal edildi"}
          </p>
          {detail.orders.map((o) => (
            <article className="my-5 border-t border-stone-200 pt-4" key={o.id}>
              <h3 className="font-bold">
                Sipariş {o.id.slice(0, 8)} · {stateLabels[o.status] || o.status}
              </h3>
              {o.items.map((i) => (
                <div
                  className="my-2 flex flex-wrap justify-between gap-2 text-sm"
                  key={i.id}
                >
                  <span>
                    {i.product_name} × {i.quantity} · Birim{" "}
                    {money(i.unit_price_minor, detail.currency)}
                  </span>
                  <strong>{money(i.line_total_minor, detail.currency)}</strong>
                </div>
              ))}
              {["cancelled", "rejected"].includes(o.status) && (
                <p className="text-sm text-stone-600">Hesaba dahil edilmedi.</p>
              )}
            </article>
          ))}
          {detail.state === "open" && (
            <div className="mt-6 border-t border-stone-200 pt-5">
              <label>
                İşlem notu / iptal gerekçesi
                <input
                  value={reason}
                  maxLength={500}
                  disabled={busy || hasAttempt}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {hasAttempt ? (
                <button disabled={busy} onClick={() => void settle("pay")}>
                  Aynı tahsilatı tekrar kontrol et
                </button>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  <button disabled={busy} onClick={() => void settle("pay")}>
                    Ödeme alındı, adisyonu kapat
                  </button>
                  {detail.total_minor === 0 && (
                    <button
                      disabled={busy || !reason.trim()}
                      onClick={() => void settle("void")}
                    >
                      Sıfır adisyonu gerekçeyle iptal et
                    </button>
                  )}
                </div>
              )}
              <p className="mt-4 text-xs text-stone-600">
                Fiziksel tahsilatı doğrulayın. Teslim edilmemiş sipariş varken
                hesap kapatılamaz. İptal/ret kalemleri toplamdan düşülür.
              </p>
            </div>
          )}
          {detail.settlements?.map((s, i) => (
            <p className="mt-4 text-sm" key={i}>
              {s.action === "pay" ? "Tahsilat" : "Gerekçeli iptal"}:{" "}
              {money(s.amount_minor, detail.currency)}{" "}
              {s.reason && " · " + s.reason}
            </p>
          ))}
        </section>
      )}
    </section>
  );
}
