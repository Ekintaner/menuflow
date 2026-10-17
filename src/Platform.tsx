import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
type Restaurant = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  active: boolean;
  dining_tables: { count: number }[];
};
type Table = { id: string; name: string; active: boolean };
const sample: Restaurant = {
  id: "demo",
  name: "MenuFlow Demo Kafe",
  slug: "menuflow-demo",
  currency: "TRY",
  timezone: "Europe/Istanbul",
  active: true,
  dining_tables: [{ count: 4 }],
};
class PlatformError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function api(path: string, data?: unknown) {
  const r = await fetch(
    `/api/v1${path}`,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await r.json();
  if (!r.ok)
    throw new PlatformError(result.message || "İşlem tamamlanamadı.", r.status);
  return result;
}
export function Platform({ demo = false }: { demo?: boolean }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(
    demo ? [sample] : [],
  );
  const [selected, setSelected] = useState(demo ? "demo" : "");
  const [tables, setTables] = useState<Table[]>([]),
    [demoTables, setDemoTables] = useState<Record<string, Table[]>>({
      demo: Array.from({ length: 4 }, (_, i) => ({
        id: `demo-${i}`,
        name: `Masa ${i + 1}`,
        active: true,
      })),
    });
  const [authenticated, setAuthenticated] = useState(demo),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [next, setNext] = useState<string | null>(null),
    [qr, setQr] = useState<{
      image: string;
      table: string;
      restaurant: string;
    } | null>(null);
  const restaurant = restaurants.find((r) => r.id === selected);
  async function load(after?: string) {
    const result = await api(
      `/platform/restaurants${after ? `?after=${encodeURIComponent(after)}` : ""}`,
    );
    setRestaurants((previous) =>
      after ? [...previous, ...result.restaurants] : result.restaurants,
    );
    setNext(result.next);
    setAuthenticated(true);
  }
  function handleError(e: unknown) {
    if (e instanceof PlatformError && [401, 403].includes(e.status)) {
      setAuthenticated(false);
      setRestaurants([]);
      setSelected("");
      setTables([]);
      setQr(null);
    }
    setError((e as Error).message);
  }
  useEffect(() => {
    if (demo) return;
    let current = true;
    api("/platform/restaurants")
      .then((result) => {
        if (current) {
          setRestaurants(result.restaurants);
          setNext(result.next);
          setAuthenticated(true);
        }
      })
      .catch((e) => {
        if (current) handleError(e);
      });
    return () => {
      current = false;
    };
  }, [demo]);
  useEffect(() => {
    let current = true;
    if (!selected || !authenticated) return;
    if (demo) return;
    api(`/platform/restaurants/${selected}/tables`)
      .then((result) => {
        if (current) setTables(result);
      })
      .catch((e) => {
        if (current) handleError(e);
      });
    return () => {
      current = false;
    };
  }, [selected, authenticated, demo]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string) {
    setSelected(id);
    setTables([]);
    setQr(null);
    setError("");
    setNotice("");
  }
  async function createRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      f = new FormData(form);
    await run(async () => {
      const count = Number(f.get("table_count"));
      if (demo) {
        const id = crypto.randomUUID();
        const row = {
          ...sample,
          id,
          name: String(f.get("name")),
          slug: String(f.get("slug")),
          dining_tables: [{ count }],
        };
        if (restaurants.some((r) => r.slug === row.slug))
          throw new Error("Bu kısa ad zaten kullanılıyor.");
        setRestaurants([...restaurants, row]);
        setDemoTables({
          ...demoTables,
          [id]: Array.from({ length: count }, (_, i) => ({
            id: crypto.randomUUID(),
            name: `Masa ${i + 1}`,
            active: true,
          })),
        });
        choose(id);
      } else {
        const result = await api("/platform/restaurants", {
          name: f.get("name"),
          slug: f.get("slug"),
          table_count: count,
          owner_user_id: f.get("owner") || undefined,
        });
        await load();
        choose(result.id);
      }
      form.reset();
      setNotice(
        "Restoran ve masalar oluşturuldu. Sipariş alımı kapalı; menü henüz yayımlanmadı.",
      );
    });
  }
  async function addTables(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget),
      count = Number(f.get("count"));
    await run(async () => {
      const currentTables = demo ? (demoTables[selected] ?? []) : tables;
      if (currentTables.length + count > 100)
        throw new Error("Pilot restoran başına en fazla 100 masa destekler.");
      if (demo) {
        const added = Array.from({ length: count }, (_, i) => ({
          id: crypto.randomUUID(),
          name: `Masa ${currentTables.length + i + 1}`,
          active: true,
        }));
        setDemoTables({
          ...demoTables,
          [selected]: [...currentTables, ...added],
        });
        setRestaurants(
          restaurants.map((r) =>
            r.id === selected
              ? {
                  ...r,
                  dining_tables: [{ count: currentTables.length + count }],
                }
              : r,
          ),
        );
      } else {
        await api(`/platform/restaurants/${selected}/tables`, { count });
        setTables(await api(`/platform/restaurants/${selected}/tables`));
        await load();
      }
      setNotice("Masalar eklendi.");
    });
  }
  async function makeQr(table: Table) {
    if (
      !window.confirm(
        `${table.name} için QR oluşturulsun/yenilensin mi? Eski baskı ve bu masanın müşteri oturumları iptal edilir.`,
      )
    )
      return;
    await run(async () => {
      setQr(null);
      const result = demo
        ? {
            url: `${location.origin}/platform-demo?table=${encodeURIComponent(table.name)}`,
          }
        : await api(`/platform/restaurants/${selected}/tables/${table.id}/qr`, {
            confirm_rotation: true,
          });
      const image = await QRCode.toDataURL(result.url, {
        width: 640,
        margin: 4,
        errorCorrectionLevel: "M",
      });
      setQr({ image, table: table.name, restaurant: restaurant?.name ?? "" });
      setNotice(
        demo
          ? "Demo QR yalnız örnek ekranı açar; sipariş kabul etmez."
          : "QR hazır. Şimdi indirin; ham bağlantı tekrar gösterilmez. Baskıyı doğru masada deneyin.",
      );
    });
  }
  const visibleTables = demo ? (demoTables[selected] ?? []) : tables;
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <a href="/" className="text-2xl font-bold">
          MenuFlow.
        </a>
        <nav className="flex gap-4" aria-label="Platform menüsü">
          <a href="/admin">Restoran paneli</a>
          <a href={demo ? "/platform" : "/platform-demo"}>
            {demo ? "Gerçek yönetici girişi" : "Örnek ekran"}
          </a>
        </nav>
      </header>
      <p className="eyebrow">PLATFORM YÖNETİMİ</p>
      <h1>Restoranlar ve masalar.</h1>
      <p className="my-4 text-stone-600">
        İşletmeleri oluşturun, masa sayılarını yönetin ve masalara özel QR
        kartlarını hazırlayın.
      </p>
      {demo && (
        <p role="status" className="mb-5 rounded-xl bg-amber-100 p-4">
          Örnek ortam · Veriler yalnız bu sayfada tutulur; yenileyince
          sıfırlanır. Demo QR sipariş menüsünü açmaz. Gerçek yönetim yalnız
          yetkili hesabınızla kullanılabilir.
        </p>
      )}
      {error && (
        <p role="alert" className="my-4 rounded-xl bg-red-100 p-4">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="my-4 rounded-xl bg-green-100 p-4">
          {notice}
        </p>
      )}
      {!authenticated ? (
        <section className="card max-w-md">
          <h2>Yalnız platform yöneticisi</h2>
          <p className="my-3 text-sm">
            Restoran sahibi hesapları bu ekrana erişemez.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api("/auth/login", {
                  email: f.get("email"),
                  password: f.get("password"),
                });
                await load();
              });
            }}
          >
            <label className="block">
              E-posta
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label className="block">
              Parola
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button disabled={busy}>Giriş yap</button>
          </form>
        </section>
      ) : (
        <>
          {!demo && (
            <button
              className="my-3"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("/auth/logout", {});
                  setAuthenticated(false);
                  setRestaurants([]);
                  choose("");
                })
              }
            >
              Çıkış yap
            </button>
          )}
          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_2fr]">
            <section className="card">
              <h2>Restoran ekle</h2>
              <form className="mt-4 space-y-4" onSubmit={createRestaurant}>
                <label className="block">
                  İşletme adı
                  <input name="name" maxLength={120} required />
                </label>
                <label className="block">
                  Kısa ad
                  <input
                    name="slug"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={80}
                    placeholder="ornek-kafe"
                    required
                  />
                </label>
                <label className="block">
                  Başlangıç masa sayısı
                  <input
                    name="table_count"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={4}
                    required
                  />
                </label>
                {!demo && (
                  <label className="block">
                    Restoran sahibi hesap UUID (isteğe bağlı)
                    <input name="owner" />
                    <span className="text-xs">
                      Boş bırakırsanız ilk sahip siz olursunuz. Hesap önceden
                      kontrollü açılmalıdır.
                    </span>
                  </label>
                )}
                <p className="text-sm">
                  TRY · Europe/Istanbul · Manuel kabul · Başlangıçta sipariş
                  kapalı
                </p>
                <button disabled={busy}>Restoranı oluştur</button>
              </form>
            </section>
            <section className="card">
              <h2>Restoranlar</h2>
              <div className="my-4 space-y-3">
                {restaurants.map((r) => (
                  <button
                    className="block w-full text-left"
                    disabled={busy}
                    aria-pressed={selected === r.id}
                    key={r.id}
                    onClick={() => choose(r.id)}
                  >
                    {r.name} · {r.dining_tables[0]?.count ?? 0} masa
                  </button>
                ))}
                {!restaurants.length && <p>Henüz restoran yok.</p>}
                {next && (
                  <button
                    disabled={busy}
                    onClick={() => void run(() => load(next))}
                  >
                    Diğer restoranları yükle
                  </button>
                )}
              </div>
              {restaurant && (
                <>
                  <h2>{restaurant.name} — Masalar</h2>
                  <p className="my-2 text-sm">
                    {restaurant.slug} · {restaurant.currency} ·{" "}
                    {restaurant.timezone}
                  </p>
                  <form
                    className="my-4 flex flex-wrap items-end gap-3"
                    onSubmit={addTables}
                  >
                    <label>
                      Eklenecek masa
                      <input
                        name="count"
                        type="number"
                        min={1}
                        max={100}
                        defaultValue={1}
                        required
                      />
                    </label>
                    <button disabled={busy}>Masa ekle</button>
                  </form>
                  <ul className="space-y-3">
                    {visibleTables.map((t) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-3"
                        key={t.id}
                      >
                        <span>
                          {t.name}
                          {!t.active && " · Kapalı"}
                        </span>
                        <button
                          disabled={busy || !t.active}
                          onClick={() => void makeQr(t)}
                        >
                          {t.name} QR oluştur / yenile
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-sm">
                    Yenileme eski baskıları ve bağlı oturumları iptal eder. QR
                    fotoğrafı paylaşılabilir; fiziksel konumu kanıtlamaz.
                  </p>
                </>
              )}
            </section>
          </div>
        </>
      )}
      {qr && (
        <section
          id="platform-qr-print"
          className="card mx-auto mt-8 max-w-sm text-center"
        >
          <h2>{qr.restaurant}</h2>
          <p className="my-3 text-xl font-bold">{qr.table}</p>
          {demo && <p>DEMO · Sipariş için geçerli değildir</p>}
          <img
            className="mx-auto w-full"
            src={qr.image}
            alt={`${qr.restaurant}, ${qr.table} QR kodu`}
          />
          <p>
            {demo
              ? "Bu örnek QR sipariş almaz."
              : "Menüyü görmek için QR kodu okutun."}
          </p>
          <div className="platform-print-hide mt-4 flex justify-center gap-4">
            <a
              download={`${demo ? "demo-" : ""}${qr.table}-qr.png`}
              href={qr.image}
            >
              PNG indir
            </a>
            <button onClick={() => window.print()}>Kartı yazdır</button>
          </div>
        </section>
      )}
    </main>
  );
}
