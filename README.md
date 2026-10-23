# Sparksviu

Platform kampanye kreator film berdasarkan desain **Feed Kreator**. Next.js + PostgreSQL, disiapkan untuk Docker Compose di Dokploy. Repository private: https://github.com/HafidhChaplinGithub/sparksviu

## Yang tersedia

- Halaman publik, pencarian/filter kampanye dan simulator reward.
- Akun kreator, verifikasi/reset email, sesi tersimpan dan TOTP staf.
- Kampanye draf/publik, versi tarif CPM/tier/fixed, kuota dan reservasi budget.
- Slot, posting/revisi, bukti privat, views manual dan review.
- Penilaian, keberatan, settlement, pending release, saldo dan jurnal.
- Rekening terenkripsi, verifikasi finance, pencairan, batch, adapter Flip Bisnis, callback dan rekonsiliasi.
- Notifikasi, peran staf, jejak audit dan ekspor CSV.
- Worker tahan restart untuk pekerjaan yang aman diulang, migrasi, preflight dan konfigurasi Dokploy.

## Menjalankan development

Node.js 24.x dan PostgreSQL 17. Salin `.env.example` menjadi `.env.local` untuk Next. Untuk CLI tsx, muat environment secara eksplisit; tsx tidak otomatis membaca file environment.

```sh
npm ci
# Isi DATABASE_URL, APP_URL=http://localhost:3000, ENCRYPTION_KEY, STORAGE_DIR.
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/migrate.ts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/admin.ts
npm run dev
```

Buat administrator dengan `ADMIN_EMAIL`/`ADMIN_PASSWORD` minimum 14 karakter hanya pada proses bootstrap. Tidak ada password bawaan. Lihat panduan Dokploy untuk input password tanpa menyimpannya di riwayat perintah.

Worker dijalankan pada terminal kedua dengan environment yang sama:

```sh
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/worker.ts
```

Untuk demo **development** saja, set `ALLOW_DEMO_SEED=true`, `DEMO_PASSWORD` minimum 14 karakter, lalu jalankan seed dengan environment development. Data film/studio berlabel demo. Produksi menolak seed.

## Pemeriksaan

```sh
npm run typecheck
NODE_ENV=test node node_modules/tsx/dist/cli.mjs --test tests/domain.test.ts
# Database ini wajib baru/kosong dan khusus pengujian:
DATABASE_URL=postgresql://... TEST_DATABASE_URL=postgresql://... npm test
npm run build
```

Tes integrasi menerapkan skema pada database disposable dan memakai akun sintetis. Jangan arahkan `TEST_DATABASE_URL` ke development bersama, staging berisi data, atau produksi. `tests/browser.mjs` memerlukan fixture demo `sv_browser` dan browser Playwright yang sudah disiapkan; ia tidak menghubungi Flip.

Audit keamanan beserta bukti sensitif tetap di luar repository. Ringkasan pengujian dan batas verifikasi ada di [docs/QA.md](docs/QA.md).

## Dokumen

- [Deployment Dokploy](docs/DOKPLOY.md)
- [Arsitektur & batas implementasi](docs/ARCHITECTURE.md)
- [Sistem desain](docs/DESIGN.md)
- [ERD skema fisik, 31 tabel](docs/ERD.md)
- [Alur operasional dan release gates](docs/OPERATIONS.md)

## Sebelum menerima pengguna/dana nyata

Lengkapi kebijakan final dan kontak, SMTP, kredensial/domain produksi, UAT sandbox Flip, backup/restore, dan pemeriksaan deployment. Registrasi dan Flip default dinonaktifkan. Aplikasi ini tidak mengklaim pengambilan views otomatis dari API sosial atau validasi rekening otomatis bank.
