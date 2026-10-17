import { useEffect, useRef, useState, type FormEvent } from "react";
const labels: Record<string, string> = {
  pending_acceptance: "Onay bekliyor",
  accepted: "Kabul edildi",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  served: "Teslim edildi",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
};
const next: Record<string, string[]> = {
  pending_acceptance: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
};
type Order = {
  id: string;
  table_id: string;
  status: string;
  version: number;
  note: string;
  total_minor: number;
  currency: string;
  created_at: string;
  dining_tables: { name: string };
  order_items: {
    product_name: string;
    quantity: number;
    line_total_minor: number;
  }[];
  order_events?: {
    id: string;
    from_status: string;
    to_status: string;
    reason: string;
    created_at: string;
  }[];
};
type Settings = {
  acceptance_mode: string;
  ordering_enabled: boolean;
  version: number;
};
async function api(path: string, data?: unknown, method = "POST") {
  const r = await fetch(
    "/api/v1/admin/" + path,
    data === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(result.message || "İşlem tamamlanamadı."), {
      status: r.status,
    });
  return result;
}
export function OrderPanel({
  tenant,
  owner,
}: {
  tenant: string;
  owner: boolean;
}) {
  const [filter, setFilter] = useState("active"),
    [table, setTable] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [orders, setOrders] = useState<Order[]>([]),
    [tables, setTables] = useState<{ id: string; name: string }[]>([]),
    [settings, setSettings] = useState<Settings>(),
    [detail, setDetail] = useState<Order>();
  const [cursor, setCursor] = useState<string | null>(null),
    [pageCursor, setPageCursor] = useState(""),
    [error, setError] = useState(""),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [updated, setUpdated] = useState(""),
    [blocked, setBlocked] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    Promise.all([
      api(`tables?tenant=${tenant}`),
      api(`settings?tenant=${tenant}`),
    ])
      .then(([t, s]) => {
        if (current) {
          setTables(t);
          setSettings(s);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [tenant, revision]);
  useEffect(() => {
    let current = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (blocked) return;
      if (!document.hidden) {
        try {
          const params = new URLSearchParams({ tenant, status: filter });
          if (table) params.set("table", table);
          if (from) params.set("from", new Date(from).toISOString());
          if (to) params.set("to", new Date(to).toISOString());
          if (pageCursor) params.set("cursor", pageCursor);
          const r = await api(`orders?${params}`);
          if (current) {
            setOrders(r.items);
            setCursor(r.next_cursor);
            setUpdated(new Date().toLocaleTimeString("tr-TR"));
            setError("");
          }
        } catch (e) {
          if (current) {
            setError((e as Error).message);
            setOrders([]);
            setDetail(undefined);
            if ([401, 403].includes((e as { status: number }).status))
              setBlocked(true);
          }
        }
      }
      if (current) timer = setTimeout(poll, document.hidden ? 30000 : 5000);
    }
    void poll();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [tenant, filter, table, from, to, pageCursor, revision, blocked]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) {
        setActionError((e as Error).message);
        setDetail(undefined);
        if ([401, 403].includes((e as { status: number }).status)) {
          setBlocked(true);
          setOrders([]);
        }
      }
    } finally {
      if (alive.current) {
        setBusy(false);
        setRevision((v) => v + 1);
      }
    }
  }
  async function transition(e: FormEvent<HTMLFormElement>, o: Order) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action(async () => {
      await api(`orders/${o.id}/transitions?tenant=${tenant}`, {
        version: o.version,
        status: f.get("status"),
        reason: f.get("reason"),
      });
      if (alive.current) setDetail(undefined);
    });
  }
  const money = (n: number, c: string) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: c }).format(
      n / 100,
    );
  function filters(fn: () => void) {
    fn();
    setPageCursor("");
    setDetail(undefined);
    setOrders([]);
  }
  return (
    <section className="my-6 space-y-4" aria-label="Sipariş paneli">
      <h2>Siparişler</h2>
      <p>
        Görünür ekranda 5 saniyede bir yenilenir. Son güncelleme:{" "}
        {updated || "Bekleniyor"}
      </p>
      {(actionError || error) && <p role="alert">{actionError || error}</p>}
      {blocked && <p>Erişim sona erdi. Çıkış yapıp yeniden giriş yapın.</p>}
      <div className="flex flex-wrap gap-4">
        <label>
          Durum filtresi
          <select
            value={filter}
            onChange={(e) => filters(() => setFilter(e.target.value))}
          >
            <option value="active">Aktif siparişler</option>
            <option value="history">Geçmiş</option>
            <option value="all">Tümü</option>
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Masa filtresi
          <select
            value={table}
            onChange={(e) => filters(() => setTable(e.target.value))}
          >
            <option value="">Tüm masalar</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Başlangıç
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => filters(() => setFrom(e.target.value))}
          />
        </label>
        <label>
          Bitiş (hariç)
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => filters(() => setTo(e.target.value))}
          />
        </label>
      </div>
      <button
        disabled={busy || blocked}
        onClick={() => setRevision((v) => v + 1)}
      >
        Siparişleri yenile
      </button>
      <p role="status">
        Bu sayfada{" "}
        {orders.filter((o) => o.status === "pending_acceptance").length} sipariş
        onay bekliyor.
      </p>
      {!orders.length && <p>Sipariş bulunamadı.</p>}
      {Array.from(new Set(orders.map((o) => o.table_id))).map((id) => (
        <section
          key={id}
          aria-label={orders.find((o) => o.table_id === id)?.dining_tables.name}
        >
          <h3>{orders.find((o) => o.table_id === id)?.dining_tables.name}</h3>
          {orders
            .filter((o) => o.table_id === id)
            .map((o) => (
              <article className="card my-3" key={o.id}>
                <h4>
                  Sipariş {o.id.slice(0, 8)} · {labels[o.status]}
                </h4>
                <p>
                  {new Date(o.created_at).toLocaleString("tr-TR")} ·{" "}
                  {money(o.total_minor, o.currency)}
                </p>
                {o.status === "pending_acceptance" &&
                  Date.now() - Date.parse(o.created_at) > 120000 && (
                    <strong>Uzun süredir onay bekliyor</strong>
                  )}
                <ul>
                  {o.order_items.map((i, index) => (
                    <li key={index}>
                      {i.product_name} × {i.quantity} ·{" "}
                      {money(i.line_total_minor, o.currency)}
                    </li>
                  ))}
                </ul>
                {o.note && <p>Not: {o.note}</p>}
                <button
                  disabled={busy || blocked}
                  onClick={() =>
                    action(async () => {
                      const r = await api(`orders/${o.id}?tenant=${tenant}`);
                      if (alive.current) setDetail(r);
                    })
                  }
                >
                  Ayrıntı {o.id.slice(0, 8)}
                </button>
                {next[o.status] && (
                  <form
                    className="mt-3 space-y-3"
                    onSubmit={(e) => transition(e, o)}
                  >
                    <label>
                      Yeni durum
                      <select
                        name="status"
                        aria-label={`Yeni durum ${o.id.slice(0, 8)}`}
                      >
                        {next[o.status].map((s) => (
                          <option key={s} value={s}>
                            {labels[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Gerekçe (ret/iptalde zorunlu)
                      <input
                        name="reason"
                        maxLength={500}
                        aria-label={`Gerekçe ${o.id.slice(0, 8)}`}
                      />
                    </label>
                    <button disabled={busy || blocked}>
                      Durumu kaydet {o.id.slice(0, 8)}
                    </button>
                  </form>
                )}
              </article>
            ))}
        </section>
      ))}
      {pageCursor && (
        <button onClick={() => filters(() => setPageCursor(""))}>
          İlk sayfa
        </button>
      )}
      {cursor && (
        <button
          disabled={busy || blocked}
          onClick={() => {
            setPageCursor(cursor);
            setDetail(undefined);
            setOrders([]);
          }}
        >
          Sonraki sayfa
        </button>
      )}
      {detail && (
        <section className="card" aria-label="Sipariş geçmişi">
          <h3>Sipariş {detail.id.slice(0, 8)} geçmişi</h3>
          <ol>
            {detail.order_events
              ?.slice()
              .sort(
                (a, b) =>
                  a.created_at.localeCompare(b.created_at) ||
                  a.id.localeCompare(b.id),
              )
              .map((e) => (
                <li key={e.id}>
                  {labels[e.to_status]} ·{" "}
                  {new Date(e.created_at).toLocaleString("tr-TR")}
                  {e.reason && ` · ${e.reason}`}
                </li>
              ))}
          </ol>
          <button onClick={() => setDetail(undefined)}>Ayrıntıyı kapat</button>
        </section>
      )}
      {settings && (
        <section className="card">
          <h3>Sipariş kabul ayarları</h3>
          <p>
            Geçerli mod:{" "}
            {settings.acceptance_mode === "automatic" ? "Otomatik" : "Manuel"} ·
            Sipariş alımı: {settings.ordering_enabled ? "Açık" : "Kapalı"}
          </p>
          {owner && (
            <form
              key={settings.version}
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  const r = await api(
                    `settings?tenant=${tenant}`,
                    {
                      version: settings.version,
                      acceptance_mode: f.get("mode"),
                      ordering_enabled: f.get("enabled") === "on",
                    },
                    "PATCH",
                  );
                  if (alive.current) setSettings(r);
                });
              }}
            >
              <label>
                Kabul modu
                <select
                  name="mode"
                  aria-label="Kabul modu"
                  defaultValue={settings.acceptance_mode}
                >
                  <option value="manual">Manuel</option>
                  <option value="automatic">Otomatik</option>
                </select>
              </label>
              <label>
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={settings.ordering_enabled}
                />
                Sipariş alımı açık
              </label>
              <p>
                Otomatik modda yeni siparişler doğrudan kabul edilir;
                hazırlanmaya başlamaz. Mevcut siparişler değişmez. QR
                paylaşılabilir ve fiziksel masa konumunu kanıtlamaz.
              </p>
              <button disabled={busy || blocked}>
                Kabul ayarlarını kaydet
              </button>
            </form>
          )}
        </section>
      )}
    </section>
  );
}
