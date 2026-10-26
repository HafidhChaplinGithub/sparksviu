# UAT dan panduan penggunaan

## Konfigurasi lingkungan latihan

Gunakan database dan volume upload khusus latihan. Jangan menjalankan fixture pada database operasional yang sudah memiliki pengguna atau kampanye nyata. Preflight menolak mode data campuran.

```dotenv
UAT_MODE=true
UAT_PASSWORD_ONLY=true
PAYOUT_MODE=manual
FLIP_MODE=disabled
REGISTRATION_ENABLED=false
SMTP_HOST=
```

Tetap gunakan HTTPS, encryption key stabil, dan password database milik lingkungan ini. `ALLOW_UAT_SEED` hanya diaktifkan pada proses seed, bukan disimpan sebagai konfigurasi layanan permanen.

Di terminal **container web** setelah migrasi 003:

```sh
ALLOW_UAT_SEED=true node node_modules/tsx/dist/cli.mjs scripts/seed-uat.ts
```

Seed membuat **13 akun**: 5 kreator dan masing-masing 2 ops, reviewer, finance, superadmin. Nama dan email `example.test` bersifat sintetis. Setiap kreator mendapat saldo latihan Rp250.000 dengan jurnal `uat.opening`, dua akun sosial contoh dan rekening dummy. Tiga kampanye contoh mencakup CPM, tier tertinggi, dan tarif tetap. Tidak ada pengiriman uang.

Password unik dan secret autentikator staf tersimpan dalam **`/app/storage/uat-credentials.json`**, izin 0600. File ini tidak dilayani endpoint web. Ambil melalui akses operator yang sah dan simpan privat; jangan masukkan ke Git, screenshot, tiket, atau panduan publik. Dengan UAT_PASSWORD_ONLY=true, semua akun demo yang belum kedaluwarsa cukup login dengan email dan password. Flag ini default false dan hanya aktif bila seluruh guard UAT di atas aman. Secret fixture lama tidak dihapus atau dipakai untuk login password-only. Seed baru dalam mode ini tidak membuat secret TOTP.

Untuk mengembalikan kewajiban autentikator, set UAT_PASSWORD_ONLY=false lalu redeploy. Seluruh sesi yang diterbitkan sebagai uat_password langsung tidak berlaku saat flag nonaktif. Akun seed lama dapat memakai faktor lamanya; akun seed baru tanpa faktor perlu mengaktifkan TOTP lewat Profil sebelum dashboard staf dibuka. Flag ini tidak mengecualikan akun non-demo dari kewajiban TOTP. Akun berlaku tujuh hari; seed ulang tidak memperpanjang, mengganti password, atau menambah saldo.

Seeder menolak data operasional dan fixture parsial. Jika kredensial hilang, jangan menjalankan reset massal; pulihkan manifest privat dari backup lingkungan UAT atau buat lingkungan latihan baru. Ini terpisah dari `seed:demo`, yang tetap menolak produksi.

## Urutan uji tim

1. **Ops 1:** buat draf, pilih model tarif, budget dan kuota, buka kampanye, unggah materi simulasi berlisensi. Ops 2 memeriksa hasil.
2. **Kreator 1:** baca brief, ambil slot, kirim URL posting asli, unggah bukti sintetis. Kreator 2/3 memeriksa bahwa data pribadi kreator lain tidak dapat dibuka.
3. **Reviewer 1:** revisi/setujui posting, validasi views dan terbitkan penilaian setelah cutoff. Untuk tarif views, snapshot final harus diterima dalam 60 menit sebelum cutoff.
4. **Kreator 1 dan Reviewer 2:** ajukan dan selesaikan keberatan. Reviewer awal tidak menyelesaikan keberatan atas penilaiannya sendiri.
5. **Worker:** setelah masa keberatan 48 jam, settlement masuk pending; setelah 24 jam tambahan menjadi available. UAT web di server tetap memakai waktu asli.
6. **Kreator 1:** ajukan pencairan manual; available berpindah ke held. Batalkan pengajuan lain ketika masih requested untuk memeriksa pengembalian hold.
7. **Finance 1:** periksa tujuan yang dibekukan, setujui batch, unggah bukti bertanda SIMULASI. Jangan melakukan transfer bank. Nominal harus persis sesuai pengajuan.
8. **Finance 2:** periksa dan konfirmasi bukti. Pengunggah tidak dapat menyetujui sendiri. Bila ditolak, held tetap ditahan dan koreksi dapat memakai referensi sama untuk pengajuan itu.
9. **Superadmin 1/2:** tinjau peran dan audit. Ekspor finance dicocokkan dengan jurnal.

## Tutorial web

Buka **`/panduan`**. Ada pencarian, filter peran, tujuh panduan, daftar isi, screenshot alur UAT dan panah/angka yang menunjukkan sasaran klik. `Perbesar petunjuk` membuka ukuran gambar yang lebih besar pada layar kecil. Manifest screenshot ada di `src/lib/guide-captures.json`; koordinat SVG mengikuti resolusi gambar sehingga tidak bergeser saat responsif.

Screenshot berasal dari browser terhadap aplikasi lokal, dengan data sintetis. Jangan menggantinya dengan capture password terisi, secret/QR autentikator, nomor rekening lengkap, atau identitas operasional. Perbarui gambar dan sasaran panah bersamaan ketika label/tata letak berubah.

## Beralih ke operasional

Gunakan **database dan volume baru yang bersih**, bukan menghapus label fixture atau mengubah `UAT_MODE=false` pada database latihan. Jalankan migrasi, set UAT_MODE=false, UAT_PASSWORD_ONLY=false, PAYOUT_MODE=manual dan Flip disabled; bootstrap admin melalui prosedur operator, aktifkan TOTP, kebijakan dan SMTP sebelum membuka registrasi. Simpan lingkungan UAT terpisah jika masih diperlukan.

Pembayaran manual berarti uang dikirim petugas melalui aplikasi bank. Website menyimpan tujuan, bukti, persetujuan kedua dan jurnal; tidak membaca mutasi bank secara otomatis. Mode Flip baru diaktifkan pada lingkungan operasional/staging setelah sandbox dan kontrak provider diverifikasi. Mengubah PAYOUT_MODE hanya memengaruhi pengajuan baru.
