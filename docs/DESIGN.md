# Feed Kreator — implementasi desain

Sumber utama: folder `sparksviu-feed-kreator` dari pemilik. Arah visual dipertahankan: headline besar Bricolage Grotesque, Plus Jakarta Sans untuk isi, kartu poster 9:16, tombol pill, stiker status, coral/kuning/mint/lilac, latar abu muda dan tema gelap.

Warna coral tetap menjadi aksen identitas. Teks tombol kecil memakai ink gelap agar lebih terbaca daripada putih pada coral terang. Stiker menandai status dan skema reward, bukan klaim kepercayaan. Gradien hanya berada pada ilustrasi poster film. Ilustrasi poster tidak menyatakan bahwa materi lisensi klien sudah diunggah.

Font disajikan lokal melalui `public/fonts`, disertai lisensi SIL OFL. Foto, logo studio, testimoni dan statistik tidak dibuat seolah-olah data nyata. Demo seed memakai label DEMO dalam brief dan studio.

Navigasi kreator tersedia di bagian bawah layar kecil. Form, tabel panjang, empty state, feedback gagal/berhasil, keyboard focus, skip link, ukuran tombol minimum 44px, dan reduced motion termasuk bagian implementasi. Tema mengikuti preferensi sistem sampai diubah melalui tombol tema.

Dials kerja untuk menerjemahkan referensi: energy 3 (headline dan blok warna), rhythm 3 (hero, poster, alur dan dashboard), motion 1 (interaksi sederhana, animasi referensi dibatasi oleh reduced motion). Ini pilihan implementasi referensi, bukan preferensi global pengguna.

## Panduan web

`/panduan` menggunakan halaman baca berwarna krem, judul Bricolage dan teks Jakarta yang sama dengan aplikasi. Daftar artikel menggunakan baris bernomor dan filter peran. Artikel memiliki daftar isi, urutan langkah, gambar UAT aktual, penanda SVG merah berangka dan legenda klik. Pada ponsel layout menjadi satu kolom, dengan opsi memperbesar gambar tanpa memotong penanda. Keterangan tekstual tetap menjelaskan tindakan tanpa bergantung pada warna atau panah saja.
