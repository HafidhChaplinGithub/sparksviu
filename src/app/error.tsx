"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="wrap pg">
      <h1>Ada gangguan sementara.</h1>
      <p>
        Coba muat ulang. Pengajuan yang sudah diterima tidak perlu dibuat ulang.
      </p>
      <button className="btn btn-hot" onClick={reset}>
        Coba kembali
      </button>
    </main>
  );
}
