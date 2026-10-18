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
  const [token] = useState(() =>
    /^[a-f0-9]{64}$/i.test(location.hash.slice(1))
      ? location.hash.slice(1)
      : "",
  );
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
  const cartCount = Object.values(cart).reduce((n, q) => n + q, 0);
  const total =
    menu?.products.reduce((n, p) => n + p.price_minor * (cart[p.id] || 0), 0) ??
    0;
  return (
    <main className="public-menu">
      <header className="menu-masthead">
        <span className="menu-wordmark">{menu?.tenant.name || "Menü"}</span>
        <span className="menu-table">{menu?.table.name || "QR MENÜ"}</span>
      </header>
      {error && (
        <div className="menu-alert" role="alert">
          <strong>Birlikte kontrol edelim.</strong>
          <p>{error}</p>
          {!menu && (
            <p>
              Masadaki güncel QR kodunu okutun veya işletme görevlisine danışın.
            </p>
          )}
        </div>
      )}
      {!menu && !error && (
        <section className="menu-loading" aria-label="Menü yükleniyor">
          <div className="menu-skeleton" />
          <p>Menü yükleniyor…</p>
        </section>
      )}
      {menu && (
        <>
          <section className="menu-intro">
            <p className="menu-kicker">MASANIZA ÖZEL MENÜ</p>
            <h1>{menu.tenant.name}</h1>
            <p>Keyfinize eşlik edecek lezzetler.</p>
            <div className="menu-service">
              <span>{menu.table.name}</span>
              <span>Ödeme işletmede</span>
            </div>
          </section>
          <nav className="menu-categories" aria-label="Menü kategorileri">
            {menu.categories.map((c) => (
              <a key={c.id} href={"#category-" + c.id}>
                {c.name}
              </a>
            ))}
          </nav>
          <div className="menu-layout">
            <div className="menu-catalog">
              <div className="menu-section-heading">
                <h2>Menümüz</h2>
                <span>{menu.products.length} seçenek</span>
              </div>
              {!menu.products.length && (
                <div className="menu-empty">
                  <h3>Menümüz hazırlanıyor.</h3>
                  <p>Güncel seçenekler için görevlimize danışabilirsiniz.</p>
                </div>
              )}
              {menu.categories.map((c) => (
                <section
                  id={"category-" + c.id}
                  className="menu-category"
                  key={c.id}
                >
                  <h2>{c.name}</h2>
                  <div className="menu-product-list">
                    {menu.products
                      .filter((p) => p.category_id === c.id)
                      .map((p) => (
                        <article
                          className={
                            "menu-product " +
                            (!p.available ? "menu-product-unavailable" : "")
                          }
                          key={p.id}
                        >
                          {p.image_url && (
                            <img
                              className="menu-product-photo"
                              src={p.image_url}
                              alt={p.name}
                              loading="lazy"
                              width={180}
                              height={180}
                            />
                          )}
                          <div className="menu-product-copy">
                            <h3>{p.name}</h3>
                            {p.description && <p>{p.description}</p>}
                            <div className="menu-product-bottom">
                              <strong>{money(p.price_minor)}</strong>
                              {!p.available && (
                                <span className="menu-unavailable">
                                  Şu an mevcut değil
                                </span>
                              )}
                              <button
                                className="menu-add"
                                aria-label={p.name + " ekle"}
                                disabled={
                                  !p.available ||
                                  !menu.ordering_enabled ||
                                  !!pending ||
                                  busy ||
                                  (cart[p.id] || 0) >= 20
                                }
                                onClick={() => quantity(p.id, 1)}
                              >
                                {cart[p.id] ? "Ekle · " + cart[p.id] : "Ekle +"}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
              <section
                className="menu-order-tracking"
                aria-label="Siparişlerim"
              >
                <div className="menu-section-heading">
                  <h2>Siparişlerim</h2>
                  <span>Bu oturuma özel</span>
                </div>
                {!orders.length && (
                  <p className="menu-muted">
                    Siparişinizin durumunu burada takip edebilirsiniz.
                  </p>
                )}
                {orders.map((o) => (
                  <article className="menu-order" key={o.id}>
                    <div className="menu-section-heading">
                      <h3>Sipariş {o.number}</h3>
                      <strong>{money(o.total_minor, o.currency)}</strong>
                    </div>
                    <p className="menu-order-status" role="status">
                      {labels[o.status] || o.status}
                    </p>
                    {o.items.map((item, index) => (
                      <p key={index}>
                        {item.product_name} × {item.quantity}
                      </p>
                    ))}
                  </article>
                ))}
              </section>
            </div>
            <aside
              id="menu-cart"
              className="menu-cart"
              aria-label="Sepet"
              tabIndex={-1}
            >
              <div className="menu-section-heading">
                <h2>Sepetiniz</h2>
                <span>{cartCount} ürün</span>
              </div>
              <p className="menu-cart-table">
                {menu.tenant.name} · {menu.table.name}
              </p>
              {!cartCount && (
                <p className="menu-empty-cart">
                  Güzel bir seçimle başlayalım.
                  <br />
                  Menüden dilediğinizi ekleyin.
                </p>
              )}
              {Object.entries(cart)
                .filter(([, q]) => q > 0)
                .map(([id, q]) => {
                  const p = menu.products.find((p) => p.id === id);
                  return (
                    <div className="menu-cart-item" key={id}>
                      <div>
                        <strong>
                          {p?.name || "Menüden kaldırılan ürün"} × {q}
                        </strong>
                        <span>{money((p?.price_minor || 0) * q)}</span>
                      </div>
                      <div className="menu-quantity">
                        <button
                          aria-label={(p?.name || "Ürün") + " azalt"}
                          disabled={busy || !!pending}
                          onClick={() => quantity(id, -1)}
                        >
                          −
                        </button>
                        <span>{q}</span>
                        <button
                          aria-label={(p?.name || "Ürün") + " adet artır"}
                          disabled={busy || !!pending || q >= 20}
                          onClick={() => quantity(id, 1)}
                        >
                          +
                        </button>
                      </div>
                      {(!p || !p.available) && (
                        <p>Ürün artık mevcut değil; sepetten çıkarın.</p>
                      )}
                    </div>
                  );
                })}
              <div className="menu-total">
                <span>Toplam</span>
                <strong>{money(total)}</strong>
              </div>
              <label>
                Sipariş notu
                <textarea
                  maxLength={500}
                  value={note}
                  disabled={busy || !!pending}
                  placeholder="Servisle ilgili bir notunuz varsa…"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {!menu.ordering_enabled && (
                <p className="menu-inline-notice">
                  İşletme şu anda sipariş almıyor.
                </p>
              )}
              {pending && !busy && (
                <p className="menu-inline-notice">
                  Gönderimin sonucu belirsiz. Aynı siparişi güvenle tekrar
                  deneyin.
                </p>
              )}
              <button
                className="menu-submit"
                onClick={submit}
                disabled={
                  busy ||
                  (!pending &&
                    (!menu.ordering_enabled ||
                      !Object.values(cart).some(Boolean) ||
                      Object.entries(cart).some(
                        ([id, q]) =>
                          q > 0 &&
                          !menu.products.find(
                            (p) => p.id === id && p.available,
                          ),
                      )))
                }
              >
                {busy
                  ? "Gönderiliyor…"
                  : pending
                    ? "Aynı gönderimi tekrar dene"
                    : "Siparişi onayla ve gönder"}
              </button>
              <p className="menu-payment-note">
                İşletme ve masa bilgilerini kontrol ederek gönderin. Ödemenizi
                işletmede yapabilirsiniz.
              </p>
            </aside>
          </div>
          {cartCount > 0 && (
            <a
              className="menu-cart-dock"
              href="#menu-cart"
              onClick={() =>
                setTimeout(
                  () => document.getElementById("menu-cart")?.focus(),
                  0,
                )
              }
            >
              <span className="menu-dock-count">{cartCount}</span>
              <span>Sepeti gör</span>
              <strong>{money(total)}</strong>
              <span aria-hidden="true">→</span>
            </a>
          )}
          <footer className="menu-footer">
            {menu.tenant.name}
            <span>Afiyet olsun.</span>
          </footer>
        </>
      )}
    </main>
  );
}
