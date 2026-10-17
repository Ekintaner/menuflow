import { useEffect, useRef, useState } from "react";
type Product = {
  id: string;
  category_id: string;
  name: string;
  description?: string;
  price_minor: number;
  available: boolean;
  image_url?: string;
};
type Menu = {
  tenant: { name: string; currency: string };
  table: { name: string };
  version: number;
  session_id: string;
  ordering_enabled: boolean;
  categories: { id: string; name: string }[];
  products: Product[];
};
type Order = {
  id: string;
  number: string;
  status: string;
  total_minor: number;
  currency: string;
  items: { product_name: string; quantity: number }[];
};
const labels: Record<string, string> = {
  pending_acceptance: "Siparişiniz işletmenin onayını bekliyor",
  accepted: "Siparişiniz kabul edildi",
  preparing: "Siparişiniz hazırlanıyor",
  ready: "Siparişiniz hazır",
  served: "Siparişiniz teslim edildi",
  rejected: "Siparişiniz reddedildi",
  cancelled: "Siparişiniz iptal edildi",
};
async function api(path: string, data?: unknown, key?: string) {
  const r = await fetch(
    `/api/v1${path}`,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          body: JSON.stringify(data),
        },
  );
  const result = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(result.message || "İşlem tamamlanamadı."), {
      code: result.code,
      status: r.status,
    });
  return result;
}
export function CustomerMenu() {
  const [token] = useState(() => location.hash.slice(1));
  const boot = useRef<Promise<Menu> | null>(null);
  const [menu, setMenu] = useState<Menu>(),
    [cart, setCart] = useState<Record<string, number>>({}),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{ key: string; payload: unknown }>(),
    [orders, setOrders] = useState<Order[]>([]);
  const sending = useRef(false);
  useEffect(() => {
    history.replaceState(null, "", location.pathname);
    // Reuse bootstrap across StrictMode's effect replay so one QR creates one session.
    boot.current ??= (async () => {
      if (token) {
        await api("/guest-sessions", { token });
        sessionStorage.removeItem("mf_pending");
        sessionStorage.removeItem("mf_orders");
      }
      return api("/menu");
    })();
    let active = true;
    boot.current
      .then((m) => {
        if (!active) return;
        setMenu(m);
        try {
          const saved = JSON.parse(
            sessionStorage.getItem("mf_pending") || "null",
          );
          if (saved) {
            setPending(saved);
            setCart(saved.cart);
            setNote(saved.note);
          }
          const ids: string[] = JSON.parse(
            sessionStorage.getItem("mf_orders") || "[]",
          );
          Promise.all(ids.map((id) => api(`/orders/${id}`)))
            .then((v) => {
              if (active) setOrders(v);
            })
            .catch(() => {});
        } catch {
          sessionStorage.removeItem("mf_pending");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (
      !orders.some(
        (o) => !["served", "rejected", "cancelled"].includes(o.status),
      )
    )
      return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let expired = false;
      if (!document.hidden) {
        try {
          const refreshed = await Promise.all(
            orders.map((o) =>
              ["served", "rejected", "cancelled"].includes(o.status)
                ? Promise.resolve(o)
                : api(`/orders/${o.id}`),
            ),
          );
          if (current) setOrders(refreshed);
        } catch (e) {
          expired = [401, 403, 404].includes(
            (e as { status?: number }).status || 0,
          );
          if (current) setError((e as Error).message);
        }
      }
      if (current && !expired) timer = setTimeout(poll, 10000);
    }
    timer = setTimeout(poll, 10000);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [orders]);
  const money = (n: number, currency = menu?.tenant.currency || "TRY") =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(
      n / 100,
    );
  function quantity(id: string, delta: number) {
    if (pending || busy) return;
    setCart((c) => {
      if (!c[id] && Object.values(c).filter(Boolean).length >= 30) return c;
      return { ...c, [id]: Math.max(0, Math.min(20, (c[id] || 0) + delta)) };
    });
  }
  async function submit() {
    if (!menu || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const attempt = pending ?? {
      key: crypto.randomUUID(),
      payload: {
        version: menu.version,
        session_id: menu.session_id,
        note,
        items: Object.entries(cart)
          .filter(([, q]) => q > 0)
          .map(([product_id, quantity]) => ({ product_id, quantity })),
      },
    };
    setPending(attempt);
    sessionStorage.setItem(
      "mf_pending",
      JSON.stringify({ ...attempt, cart, note }),
    );
    try {
      const order: Order = await api("/orders", attempt.payload, attempt.key);
      const next = [order, ...orders.filter((o) => o.id !== order.id)];
      setOrders(next);
      sessionStorage.setItem(
        "mf_orders",
        JSON.stringify(next.map((o) => o.id)),
      );
      setCart({});
      setNote("");
      setPending(undefined);
      sessionStorage.removeItem("mf_pending");
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      setError(err.message);
      if (err.status && err.status < 500 && err.status !== 429) {
        setPending(undefined);
        sessionStorage.removeItem("mf_pending");
        if (["MENU_CHANGED", "PRODUCT_UNAVAILABLE"].includes(err.code || "")) {
          try {
            setMenu(await api("/menu"));
          } catch {
            setError("Menü yenilenemedi. Sayfayı yenileyip tekrar deneyin.");
          }
        }
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl p-6">
      <a href="/">MenuFlow</a>
      {error && (
        <p role="alert" className="my-4">
          {error}
        </p>
      )}
      {!menu && !error && <p>Menü yükleniyor…</p>}
      {menu && (
        <>
          <p className="eyebrow mt-6">
            {menu.tenant.name} · {menu.table.name}
          </p>
          <h1>Menümüz</h1>
          {menu.categories.map((c) => (
            <section className="mt-8" key={c.id}>
              <h2>{c.name}</h2>
              {menu.products
                .filter((p) => p.category_id === c.id)
                .map((p) => (
                  <article className="card my-3" key={p.id}>
                    {p.image_url && (
                      <img
                        className="h-40 w-full object-cover rounded-lg"
                        src={p.image_url}
                        alt={p.name}
                      />
                    )}
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <strong>{money(p.price_minor)}</strong>
                    {!p.available && <p>Şu an mevcut değil</p>}
                    <button
                      className="ml-3"
                      aria-label={`${p.name} ekle`}
                      disabled={
                        !p.available ||
                        !menu.ordering_enabled ||
                        !!pending ||
                        busy ||
                        (cart[p.id] || 0) >= 20
                      }
                      onClick={() => quantity(p.id, 1)}
                    >
                      Ekle +
                    </button>
                  </article>
                ))}
            </section>
          ))}
          <aside className="card mt-8" aria-label="Sepet">
            <h2>Sepetiniz</h2>
            <p>
              {menu.tenant.name} · {menu.table.name}
            </p>
            {Object.entries(cart)
              .filter(([, q]) => q > 0)
              .map(([id, q]) => {
                const p = menu.products.find((p) => p.id === id);
                return (
                  <div className="my-3" key={id}>
                    <span>
                      {p?.name || "Menüden kaldırılan ürün"} × {q}
                    </span>
                    <button
                      className="ml-2"
                      aria-label={`${p?.name || "Ürün"} azalt`}
                      disabled={busy || !!pending}
                      onClick={() => quantity(id, -1)}
                    >
                      −
                    </button>
                    {(!p || !p.available) && (
                      <p>Ürün artık mevcut değil; sepetten çıkarın.</p>
                    )}
                  </div>
                );
              })}
            <p className="my-4 font-bold">
              Toplam:{" "}
              {money(
                menu.products.reduce(
                  (n, p) => n + p.price_minor * (cart[p.id] || 0),
                  0,
                ),
              )}
            </p>
            <label>
              Sipariş notu
              <textarea
                className="block w-full"
                maxLength={500}
                value={note}
                disabled={busy || !!pending}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {!menu.ordering_enabled && <p>İşletme şu anda sipariş almıyor.</p>}
            {pending && !busy && (
              <p>
                Gönderimin sonucu belirsiz. Aynı siparişi güvenle tekrar
                deneyin.
              </p>
            )}
            <button
              className="mt-4"
              onClick={submit}
              disabled={
                busy ||
                (!pending &&
                  (!menu.ordering_enabled ||
                    !Object.values(cart).some(Boolean) ||
                    Object.entries(cart).some(
                      ([id, q]) =>
                        q > 0 &&
                        !menu.products.find((p) => p.id === id && p.available),
                    )))
              }
            >
              {busy
                ? "Gönderiliyor…"
                : pending
                  ? "Aynı gönderimi tekrar dene"
                  : "Siparişi onayla ve gönder"}
            </button>
          </aside>
          <section className="mt-8" aria-label="Siparişlerim">
            <h2>Siparişlerim</h2>
            {orders.map((o) => (
              <article className="card my-3" key={o.id}>
                <h3>Sipariş {o.number}</h3>
                <p role="status">{labels[o.status] || o.status}</p>
                {o.items.map((i, index) => (
                  <p key={index}>
                    {i.product_name} × {i.quantity}
                  </p>
                ))}
                <strong>{money(o.total_minor, o.currency)}</strong>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
