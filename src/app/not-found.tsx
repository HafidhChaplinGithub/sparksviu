import Link from "next/link";
export default function NotFound() {
  return (
    <main className="wrap pg">
      <h1>Halaman tidak ditemukan.</h1>
      <p>Link mungkin berubah.</p>
      <Link className="btn btn-hot" href="/">
        Kembali ke beranda
      </Link>
    </main>
  );
}
