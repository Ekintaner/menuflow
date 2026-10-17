import { useState } from "react";
import { Management, CustomerMenu } from "./Management";
const products = [
  {
    id: "coffee",
    name: "Filtre kahve",
    description: "Taze demlenmiş günlük kahve",
    price: 9500,
  },
  {
    id: "toast",
    name: "Kaşarlı tost",
    description: "Ekşi mayalı ekmek, kaşar peyniri",
    price: 16000,
  },
];
const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    value / 100,
  );
export default function App() {
  const admin = location.pathname.startsWith("/admin");
  const [cart, setCart] = useState<Record<string, number>>({});
  if (admin) return <Management />;
  if (location.pathname === "/menu") return <CustomerMenu />;
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-12 flex items-center justify-between">
        <a href="/" className="text-2xl font-bold tracking-tight">
          MenuFlow<span className="text-orange-600">.</span>
        </a>
        <nav className="flex gap-5" aria-label="Ana menü">
          <a href="/">Müşteri menüsü</a>
          <a href="/admin">Yönetim</a>
        </nav>
      </header>
      <p className="mb-4 rounded-xl bg-amber-100 p-3 text-sm">
        Demo ortamı · Gerçek sipariş ve kişisel veri kullanılmaz.
      </p>
      {admin ? (
        <>
          <p className="eyebrow">İŞLETME PANELİ</p>
          <h1>Siparişlerin kontrolü sizde.</h1>
          <p className="mt-3 text-stone-600">Demo Kafe · Manuel kabul</p>
          <section className="card mt-8">
            <h2>Aktif siparişler</h2>
            <p className="my-4">Henüz sipariş yok.</p>
            <p className="text-sm text-stone-600">
              Giriş, üyelik kontrolü ve sipariş işlemleri sonraki aşamalarda
              açılacak.
            </p>
          </section>
          <section className="card mt-5">
            <h2>Yönetim akışı</h2>
            <p className="mt-3">
              Giriş → İşletme üyeliği → Menü ve masalar → Sipariş kabulü →
              Hazırlama → Teslim
            </p>
          </section>
        </>
      ) : (
        <>
          <p className="eyebrow">DEMO KAFE · MASA 04</p>
          <h1>
            Küçük bir mola,
            <br />
            güzel bir lezzet.
          </h1>
          <p className="mt-4 text-stone-600">
            Menüyü keşfedin, demo sepetinizi oluşturun.
          </p>
          <div className="mt-9 grid gap-6 md:grid-cols-[2fr_1fr]">
            <section aria-label="Menü" className="space-y-4">
              {products.map((product) => (
                <article
                  className="card flex items-center justify-between gap-4"
                  key={product.id}
                >
                  <div>
                    <h2>{product.name}</h2>
                    <p className="my-2 text-sm text-stone-600">
                      {product.description}
                    </p>
                    <strong>{money(product.price)}</strong>
                  </div>
                  <button
                    aria-label={`${product.name} ekle`}
                    onClick={() =>
                      setCart({
                        ...cart,
                        [product.id]: (cart[product.id] ?? 0) + 1,
                      })
                    }
                  >
                    Ekle +
                  </button>
                </article>
              ))}
            </section>
            <aside className="card" aria-label="Sepet">
              <h2>Sepetiniz</h2>
              {products
                .filter((p) => cart[p.id])
                .map((p) => (
                  <p className="mt-3" key={p.id}>
                    {p.name} × {cart[p.id]}{" "}
                    <button
                      className="ml-2"
                      aria-label={`${p.name} azalt`}
                      onClick={() =>
                        setCart({ ...cart, [p.id]: cart[p.id] - 1 })
                      }
                    >
                      −
                    </button>
                  </p>
                ))}
              <p className="my-5 font-bold">
                Toplam:{" "}
                {money(
                  products.reduce(
                    (sum, p) => sum + p.price * (cart[p.id] ?? 0),
                    0,
                  ),
                )}
              </p>
              <button disabled>Sipariş yakında</button>
              <p className="mt-3 text-xs text-stone-500">
                Fiyatlar örnektir. Gerçek siparişte toplam sunucuda hesaplanır.
              </p>
            </aside>
          </div>
        </>
      )}
      <footer className="mt-14 border-t border-stone-200 pt-5 text-sm text-stone-500">
        CODEX-001 · Yerel geliştirme temeli
      </footer>
    </main>
  );
}
