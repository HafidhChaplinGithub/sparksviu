# Verifikasi implementasi

Tanggal: 23 Oktober 2026. Seluruh data pengujian sintetis; tidak ada transfer uang nyata, email pengguna nyata, atau probing produksi.

| Pemeriksaan                   | Hasil                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Build Next.js produksi        | Berhasil, TypeScript termasuk di dalam build                                                                               |
| Runtime standalone            | Berhasil dijalankan dengan PostgreSQL 17 terisolasi                                                                        |
| Domain + integrasi PostgreSQL | 16 kasus lolos                                                                                                             |
| Browser desktop/ponsel/gelap  | 56 langkah lolos, tanpa error JavaScript atau request eksternal                                                            |
| Validasi Docker Compose       | Berhasil, dengan environment contoh dan tanpa menjalankan layanan produksi                                                 |
| Advisory dependensi produksi  | `npm audit` dan `npm audit --omit=dev`: 0 advisory pada saat pemeriksaan                                                   |
| Audit keamanan sumber         | Profil standard, seluruh source aplikasi, 11 unit cakupan; kandidat historis diperbaiki dan dibaca ulang secara independen |

## Perilaku yang diuji

- CPM minimum/cap/pembulatan, tier tertinggi, fixed, URL posting dan primitive kriptografi.
- Perebutan slot bersamaan, kepemilikan submission, penilaian tanpa kredit saldo prematur, keberatan dan satu kali settlement/release.
- Rekening 24 jam, saldo hold, request idempotent, callback ganda/bertentangan, ID provider 19 digit, nominal/tujuan tidak cocok dan pengembalian dana final.
- Password reset yang berbarengan login; konfirmasi MFA dan pencabutan sesi; keberatan yang commit saat settlement menunggu kunci.
- Request Flip dimock: form nominal/tujuan, stable idempotency header, query `idempotency-key` untuk rekonsiliasi, dispatch berulang dan CANCELLED berulang. Tidak menghubungi provider.
- Browser: filter, keyboard skip link, login, profil, slot, posting, file bukti, TOTP staf, review, views, penilaian, keberatan, rekening, hold/cancel payout, penolakan batch saat Flip disabled, akses staf/ekspor/CSRF, pembuatan/publikasi kampanye, versi tarif, materi privat, revisi/penolakan dan pencabutan akses materi.

Fixture browser sengaja mempercepat deadline/umur rekening dan mengisi saldo contoh langsung untuk memeriksa layar/alur. Pembuktian settlement dan jurnal memakai tes transaksi terpisah; screenshot saldo demo bukan bukti uang atau keberhasilan transfer.

## Isolasi lokal

Pengujian dijalankan dalam container: tanpa jaringan luar, hanya loopback PostgreSQL disposable, environment allowlist kosong dari kredensial host, sumber/toolchain asli hanya-baca, writable scratch, batas CPU/memori/proses/ukuran file/disk/waktu. Browser memakai disk scratch 256 MB terpisah dan artefak gambar dipromosikan dengan pemeriksaan regular file/no-follow/ukuran. Laporan audit rinci dan bukti tetap di luar repository.

Toolchain uji berada pada path terpisah, sehingga build lokal memberi peringatan tracing dependency di luar root. Runtime standalone tetap diverifikasi dengan dependency lengkap. Dockerfile produksi memasang dependency langsung di `/app/node_modules` dan menyalinnya ke runtime; build image dan konfigurasi Dokploy pada server pemilik tetap perlu diverifikasi saat deployment.

## Belum diverifikasi di lingkungan pemilik

- Deployment/image server Dokploy, proxy/TLS/domain dan resource aktual.
- SMTP, SPF/DKIM/DMARC serta pengiriman verifikasi/reset ke mailbox nyata.
- UAT akun Flip Bisnis sandbox milik pemilik, callback publik, fee/deposit dan aktivasi live.
- Backup/restore DB, upload dan kunci enkripsi pada server tujuan.
- Uji beban terhadap kapasitas peluncuran dan retensi file jangka panjang.
- Persetujuan kebijakan final dan identitas pengendali data.

Keberhasilan pengujian lokal dan audit sumber tidak menyatakan lingkungan produksi sudah lulus. Pendaftaran dan Flip tetap disabled secara default sampai release gates diselesaikan.

## Pembaruan UAT dan manual payout — 25 Oktober 2026

Hasil berikut berasal dari source perubahan manual/UAT/tutorial pada baseline `61c1c34d`. Bukti rinci dipisahkan dari repository, tanpa kredensial atau dokumen bank nyata.

| Pemeriksaan perubahan | Hasil lokal |
| --- | --- |
| TypeScript dan build Next.js produksi | Lulus |
| Domain dan integrasi PostgreSQL | 19/19 lulus |
| Browser UAT | 113 langkah lulus, 13 akun berhasil login; akses setiap role dan penolakan lintas role diperiksa |
| Alur reward berkelanjutan | CPM 40.000 views → reward Rp80.000 → keberatan reviewer independen → settlement → release |
| Alur manual | Pengajuan Rp50.000 → held → bukti Finance 1 → konfirmasi Finance 2 → paid; held nol, tidak ada job provider |
| File bukti manual | Pemilik dapat membaca; kreator lain dan ops ditolak; pengunggah tidak dapat konfirmasi sendiri |
| Seed | 5 kreator, 2 ops, 2 reviewer, 2 finance, 2 superadmin; pengulangan tidak mengganti kredensial/saldo |
| Preflight | UAT valid diterima; mode data campuran dan SMTP di UAT ditolak |
| Panduan web | 7 artikel, 24 gambar dimuat beserta SVG penanda klik; pencarian/filter, perbesar gambar, 404, desktop dan ponsel lulus |
| Privasi screenshot | 24 gambar diperiksa, termasuk pemeriksaan ulang tiga gambar setelah copy manual diperbaiki |
| Audit delta | Profil standard, 3 unit perubahan + batas terdampak; 11 unit audit awal tetap tercatat di luar scope delta |

Uji browser lokal mempercepat masa keberatan dan masa tunggu **hanya pada database disposable `sv_uat_browser`**. Fungsi settlement/release aplikasi tetap dijalankan; logika tidak ditiru dengan perubahan saldo langsung. Saldo awal UAT Rp250.000 per kreator berasal dari jurnal fixture tersendiri dan dibedakan dari reward Rp80.000 yang diperoleh sepanjang alur. Situs yang dideploy tetap memakai tenggat asli 48 jam dan 24 jam.

Pengujian memakai cached Node 24, PostgreSQL 17 dan Playwright lokal, dengan jaringan luar mati, environment allowlist dan mount source/toolchain hanya baca. Batas browser maksimal 3 GB RAM, 2 CPU, 512 proses, file 16 MB, scratch disk 512 MB, dan 420 detik; promosi artefak mengikuti validasi descriptor/no-follow/regular-file/link-count/ukuran. Tidak ada dependency yang diunduh oleh target selama audit.

Audit delta tidak menyatakan seluruh aplikasi diaudit ulang dan tidak menguji layanan live sebagai target keamanan. Tidak ada transfer bank nyata, pengiriman Flip, pengiriman email pengguna, pengambilan views API sosial atau pembacaan mutasi bank otomatis. SMTP, kebijakan final, backup off-server terjadwal, kapasitas nyata, dan integrasi Flip sandbox tetap merupakan pekerjaan operasional sebelum peluncuran umum.
