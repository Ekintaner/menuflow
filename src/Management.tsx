import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
type Row = {
  id: string;
  name: string;
  category_id?: string;
  description?: string;
  price_minor?: number;
  sort_order?: number;
  archived_at?: string;
  available?: boolean;
  active?: boolean;
  user_id?: string;
  role?: string;
};
type Membership = {
  tenant_id: string;
  role: string;
  tenants: { name: string; currency: string };
};
type Menu = {
  tenant: { name: string; currency: string };
  table: { name: string };
  categories: Row[];
  products: (Row & { image_url?: string })[];
};
async function api(path: string, data?: unknown, method = "POST") {
  const response = await fetch(
    `/api/v1${path}`,
    data === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "İşlem tamamlanamadı.");
  return result;
}
export function CustomerMenu() {
  const [qrToken] = useState(() => window.location.hash.slice(1));
  const [menu, setMenu] = useState<Menu>(),
    [error, setError] = useState("");
  useEffect(() => {
    const token = qrToken;
    window.history.replaceState(null, "", window.location.pathname);
    api("/menu", token ? { token } : undefined)
      .then(setMenu)
      .catch((e) => setError(e.message));
  }, [qrToken]);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <a href="/">MenuFlow</a>
      {error && <p role="alert">{error}</p>}
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
                    <strong>
                      {new Intl.NumberFormat("tr-TR", {
                        style: "currency",
                        currency: menu.tenant.currency,
                      }).format((p.price_minor ?? 0) / 100)}
                    </strong>
                    {!p.available && <p>Şu an mevcut değil</p>}
                  </article>
                ))}
            </section>
          ))}
          <p className="mt-8">Sipariş vermek için çalışanımıza danışın.</p>
        </>
      )}
    </main>
  );
}
export function Management() {
  const [memberships, setMemberships] = useState<Membership[]>([]),
    [tenant, setTenant] = useState(""),
    [authenticated, setAuthenticated] = useState(false);
  const [resource, setResource] = useState("categories"),
    [rows, setRows] = useState<Row[]>([]),
    [categories, setCategories] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [qr, setQr] = useState(""),
    [qrUrl, setQrUrl] = useState(""),
    [busy, setBusy] = useState(false);
  const owner =
    memberships.find((m) => m.tenant_id === tenant)?.role === "owner";
  const endpoint = (name: string) => `/admin/${name}?tenant=${tenant}`;
  async function loadMemberships() {
    const result = await api("/admin/memberships");
    setMemberships(result);
    setAuthenticated(true);
    setTenant(result[0]?.tenant_id ?? "");
  }
  useEffect(() => {
    let current = true;
    api("/admin/memberships")
      .then((result) => {
        if (current) {
          setMemberships(result);
          setAuthenticated(true);
          setTenant(result[0]?.tenant_id ?? "");
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    if (!tenant) return;
    let current = true;
    Promise.all([
      api(`/admin/${resource}?tenant=${tenant}`),
      api(`/admin/categories?tenant=${tenant}`),
    ])
      .then(([r, c]) => {
        if (current) {
          setRows(r);
          setCategories(c);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [tenant, resource]);
  async function run(action: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setRows(await api(endpoint(resource)));
    setNotice("Kaydedildi.");
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await run(async () => {
      await api("/auth/login", {
        email: f.get("email"),
        password: f.get("password"),
      });
      await loadMemberships();
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form),
      data: Record<string, unknown> = {};
    if (resource === "staff") {
      if (!editing) data.user_id = f.get("user_id");
      else data.active = f.get("active") === "on";
    } else {
      data.name = f.get("name");
      if (resource === "tables") data.active = f.get("active") === "on";
      else {
        data.sort_order = Number(f.get("sort_order"));
        data.archived = f.get("archived") === "on";
      }
      if (resource === "products") {
        const price = String(f.get("price"));
        if (!/^\d+(?:[.,]\d{1,2})?$/.test(price)) {
          setError("Fiyat en fazla iki ondalık basamak içermeli.");
          return;
        }
        const [whole, fraction = ""] = price.replace(",", ".").split(".");
        data.price_minor =
          Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
        data.category_id = f.get("category_id");
        data.description = f.get("description");
        data.available = f.get("available") === "on";
      }
    }
    await run(async () => {
      await api(
        `/admin/${resource}${editing ? `/${editing.id}` : ""}?tenant=${tenant}`,
        data,
        editing ? "PATCH" : "POST",
      );
      setEditing(undefined);
      form.reset();
      await refresh();
    });
  }
  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-8 flex justify-between">
        <a href="/">MenuFlow.</a>
        <a href="/">Müşteri menüsü</a>
      </header>
      <h1>İşletme yönetimi</h1>
      {error && (
        <p className="my-4 text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!authenticated ? (
        <form onSubmit={login} className="card mt-8 space-y-4">
          <h2>Yönetici girişi</h2>
          <label>
            E-posta
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            Parola
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button disabled={busy}>Giriş yap</button>
          <p>
            Hesaplar kontrollü olarak açılır. Oturum en fazla bir saat sürer.
          </p>
        </form>
      ) : (
        <>
          <div className="my-6 flex flex-wrap gap-4">
            <label>
              İşletme
              <select
                aria-label="İşletme"
                disabled={busy}
                value={tenant}
                onChange={(e) => {
                  setTenant(e.target.value);
                  setQr("");
                  setEditing(undefined);
                  setRows([]);
                  setResource("categories");
                }}
              >
                <option value="">İşletme seçin</option>
                {memberships.map((m) => (
                  <option key={m.tenant_id} value={m.tenant_id}>
                    {m.tenants.name} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                run(async () => {
                  await api("/auth/logout", {});
                  setAuthenticated(false);
                  setRows([]);
                  setMemberships([]);
                  setTenant("");
                })
              }
            >
              Çıkış yap
            </button>
          </div>
          {!memberships.length && <p>Aktif işletme üyeliğiniz bulunmuyor.</p>}
          {tenant && (
            <>
              <nav
                className="flex flex-wrap gap-3"
                aria-label="Yönetim bölümleri"
              >
                {[
                  ["categories", "Kategoriler"],
                  ["products", "Ürünler"],
                  ["tables", "Masalar"],
                  ...(owner ? [["staff", "Çalışanlar"]] : []),
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={resource === value}
                    disabled={busy}
                    onClick={() => {
                      setResource(value);
                      setRows([]);
                      setEditing(undefined);
                      setQr("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {owner && (
                <div className="my-5 flex gap-3">
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(endpoint("publish"), { published: true });
                        setNotice("Menü yayımlandı.");
                      })
                    }
                  >
                    Menüyü yayımla
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(endpoint("publish"), { published: false });
                        setNotice("Menü yayından kaldırıldı.");
                      })
                    }
                  >
                    Yayından kaldır
                  </button>
                </div>
              )}
              <section className="my-6 space-y-3" aria-label="Kayıtlar">
                {rows.map((row) => (
                  <article key={row.id} className="card">
                    <h2>{row.name || row.user_id}</h2>
                    <p>
                      {row.archived_at
                        ? "Arşivde"
                        : row.active === false
                          ? "Pasif"
                          : ""}
                    </p>
                    {resource === "products" && (
                      <p>
                        {new Intl.NumberFormat("tr-TR", {
                          style: "currency",
                          currency:
                            memberships.find((m) => m.tenant_id === tenant)
                              ?.tenants.currency || "TRY",
                        }).format((row.price_minor ?? 0) / 100)}{" "}
                        · {row.available ? "Mevcut" : "Mevcut değil"}
                      </p>
                    )}
                    {owner &&
                      (resource !== "staff" || row.role === "staff") && (
                        <button disabled={busy} onClick={() => setEditing(row)}>
                          Düzenle {row.name || row.user_id}
                        </button>
                      )}
                    {owner && resource === "tables" && row.active && (
                      <button
                        className="ml-3"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const result = await api(
                              `/admin/tables/${row.id}/qr?tenant=${tenant}`,
                              {},
                            );
                            setQrUrl(result.url);
                            setQr(
                              await QRCode.toDataURL(result.url, {
                                width: 512,
                                margin: 4,
                              }),
                            );
                            setNotice(
                              "QR yenilendi. Önceki baskı artık geçersiz.",
                            );
                          })
                        }
                      >
                        QR oluştur / yenile {row.name}
                      </button>
                    )}
                    {owner && resource === "products" && (
                      <>
                        <label className="mt-4">
                          Görsel yükle {row.name}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file)
                                run(async () => {
                                  const response = await fetch(
                                    `/api/v1/admin/products/${row.id}/image?tenant=${tenant}`,
                                    {
                                      method: "POST",
                                      headers: { "Content-Type": file.type },
                                      body: file,
                                    },
                                  );
                                  if (!response.ok)
                                    throw new Error(
                                      (await response.json()).message,
                                    );
                                  setNotice("Görsel kaydedildi.");
                                });
                            }}
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(
                                `/admin/products/${row.id}?tenant=${tenant}`,
                                { remove_image: true },
                                "PATCH",
                              );
                              setNotice("Görsel kaldırıldı.");
                            })
                          }
                        >
                          Görseli kaldır {row.name}
                        </button>
                      </>
                    )}
                  </article>
                ))}
              </section>
              {qr && (
                <section className="card">
                  <h2>Masa QR kodu</h2>
                  <img width="256" height="256" src={qr} alt="Masaya özel QR" />
                  <a download="menuflow-qr.png" href={qr}>
                    QR indir
                  </a>
                  <p>
                    <a href={qrUrl} target="_blank" rel="noreferrer">
                      Masa menüsünü aç
                    </a>
                  </p>
                  <p>
                    Bu QR yalnızca şimdi indirilebilir. Yenileme eski baskıyı
                    geçersiz kılar.
                  </p>
                </section>
              )}
              {owner && (
                <form
                  key={`${resource}-${editing?.id ?? "new"}`}
                  className="card my-6 space-y-4"
                  onSubmit={save}
                >
                  <h2>{editing ? "Kaydı düzenle" : "Yeni kayıt"}</h2>
                  {resource === "staff" ? (
                    <>
                      {!editing && (
                        <label>
                          Mevcut kullanıcı UUID
                          <input name="user_id" required />
                        </label>
                      )}
                      {editing && (
                        <label>
                          <input
                            name="active"
                            type="checkbox"
                            defaultChecked={editing.active}
                          />
                          Aktif çalışan
                        </label>
                      )}
                      <p>Sahip ataması kontrollü platform işlemidir.</p>
                    </>
                  ) : (
                    <>
                      <label>
                        Ad
                        <input
                          name="name"
                          required
                          maxLength={
                            resource === "products"
                              ? 160
                              : resource === "tables"
                                ? 80
                                : 120
                          }
                          defaultValue={editing?.name}
                        />
                      </label>
                      {resource === "tables" ? (
                        <label>
                          <input
                            type="checkbox"
                            name="active"
                            defaultChecked={editing?.active ?? true}
                          />
                          Aktif masa
                        </label>
                      ) : (
                        <>
                          <label>
                            Sıra
                            <input
                              name="sort_order"
                              type="number"
                              step="1"
                              min="-100000"
                              max="100000"
                              defaultValue={editing?.sort_order ?? 0}
                            />
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              name="archived"
                              defaultChecked={!!editing?.archived_at}
                            />
                            Arşivle
                          </label>
                        </>
                      )}
                      {resource === "products" && (
                        <>
                          <label>
                            Kategori
                            <select
                              name="category_id"
                              required
                              defaultValue={editing?.category_id}
                            >
                              {categories.map((c) => (
                                <option value={c.id} key={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Açıklama
                            <textarea
                              name="description"
                              maxLength={2000}
                              defaultValue={editing?.description}
                            />
                          </label>
                          <label>
                            Fiyat (
                            {
                              memberships.find((m) => m.tenant_id === tenant)
                                ?.tenants.currency
                            }
                            )
                            <input
                              name="price"
                              inputMode="decimal"
                              required
                              defaultValue={(
                                (editing?.price_minor ?? 0) / 100
                              ).toFixed(2)}
                            />
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              name="available"
                              defaultChecked={editing?.available ?? true}
                            />
                            Ürün mevcut
                          </label>
                        </>
                      )}
                    </>
                  )}
                  <button disabled={busy}>Kaydet</button>
                  {editing && (
                    <button
                      type="button"
                      className="ml-3"
                      onClick={() => setEditing(undefined)}
                    >
                      Vazgeç
                    </button>
                  )}
                </form>
              )}
              {!owner && (
                <p>Çalışan hesabı: menü ve masa kayıtları salt okunur.</p>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
