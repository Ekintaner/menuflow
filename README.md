# MenuFlow — CODEX-001

React + Vite + TypeScript + Tailwind, Cloudflare Workers API ve Supabase bağlantı hazırlığı.

## Yerelde çalıştırma

Node.js 24 ve npm gerekir. Kimlik bilgisi veya ücretli hesap gerekmez.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Müşteri: http://127.0.0.1:5198 — Yönetim: http://127.0.0.1:5198/admin
API: http://127.0.0.1:8798/api/v1/health

```sh
npm run check
npm run api:check
```

Tüm ürünler ve masa bilgileri demo verisidir. Sepet bellekte tutulur; sipariş gönderimi kapalıdır. Yönetim sayfası yalnızca başlangıç iskeletidir, gerçek giriş veya yetkili veri göstermez.

## Yapı

- `src/`: müşteri ve yönetim başlangıç ekranları
- `worker/`: /api/v1 API sınırı ve kullanıcı JWT’siyle RLS koruyan Supabase istemci fabrikası
- `tests/`: Vitest sınır testleri ve masaüstü/mobil Playwright akışları
- `docs/CODEX-000.md`: özgün ürün ve güvenlik planı
- `docs/ADR-001.md`: mimari ve ekran akışı

## Sırlar ve yayın

`.env*` ve `.dev.vars*` örnek dosyalar dışında Git tarafından dışlanır. İsteğe bağlı `.dev.vars.example` kopyası yalnızca yerelde `.dev.vars` olarak kullanılabilir. `VITE_` değişkenlerine sır koymayın. Service-role anahtarı kullanılmaz. Gerçek veritabanı bağlantısı ve RLS testleri CODEX-002 kapsamındadır.

CI lint, tip kontrolü, build, birim ve tarayıcı testlerini çalıştırır; dağıtım yapmaz. GitHub Actions tüketimi hesabın ücretsiz kotasına tabidir. Yerel kontroller hesap gerektirmez.

Planlanan yayın: Pages statik `dist/` çıktısı; aynı site altında `/api/*` Worker rotası. Pages SPA fallback ayarı API rotasından sonra değerlendirilmelidir. `workers_dev` kapalıdır. Bulut hesabı, kaynak veya dağıtım oluşturulmadı. GitHub push kullanıcı onayı gerektirir.

## CODEX-002 veritabanı

Docker açıkken npm run test:db ile iki tenant izolasyon testleri çalıştırılır. Migration, yetki modeli ve sınırlar: [CODEX-002](docs/CODEX-002-results.md). Test bootstrap SQL dosyası üretime uygulanmaz.
