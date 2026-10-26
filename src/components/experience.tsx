"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useId, type FormEvent, type ReactNode } from "react";
import { money, date, labels, reward, type Rules } from "@/lib/domain";
import { ManualPayout } from './manual-payout';
type Row = Record<string, any>;
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  value?: string | number;
  min?: number;
  max?: number;
  help?: string;
};
const L = ({ value }: { value: string }) => (
  <span
    className={`sticker ${["approved", "succeeded", "open", "verified", "settled", "accepted"].includes(value) ? "mint" : ["rejected", "failed"].includes(value) ? "tomato" : "lilac"}`}
  >
    {labels[value] || value}
  </span>
);
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    campaign: "m4 7 13-4v18L4 17Zm0 0H2v10h2m3 1 2 4h3l-2-3",
    work: "M8 6V3h8v3M3 7h18v14H3ZM3 12h18m-11 0v3h4v-3",
    wallet: "M3 5h16v4H3V5Zm0 4h18v12H3Zm12 5h6",
    user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9 21h6",
    sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.arrow} />
    </svg>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name="campaign" />
      <h3>Belum ada data</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
function FieldInput({ field }: { field: Field }) {
  const uid = useId();
  return (
    <label className="f" htmlFor={uid}>
      <span>{field.label}</span>
      {field.options ? (
        <select
          id={uid}
          name={field.name}
          defaultValue={field.value}
          required={field.required !== false}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={uid}
          name={field.name}
          defaultValue={field.value}
          required={field.required !== false}
          maxLength={field.max || 10000}
        />
      ) : (
        <input
          id={uid}
          name={field.name}
          type={field.type || "text"}
          defaultValue={field.value}
          required={field.required !== false}
          min={field.min}
          max={field.type === "number" ? field.max : undefined}
          minLength={field.type === "password" ? 12 : undefined}
          maxLength={field.type === "number" ? undefined : field.max || 2000}
          autoComplete={
            field.type === "password" ? "current-password" : undefined
          }
        />
      )}{" "}
      {field.help && <small>{field.help}</small>}
    </label>
  );
}
export function ActionForm({
  action,
  fields = [],
  fixed = {},
  label = "Simpan",
  children,
  transform,
  onResult,
  confirm,
}: {
  action: string;
  fields?: Field[];
  fixed?: Row;
  label?: string;
  children?: ReactNode;
  transform?: (v: Row) => Row;
  onResult?: (v: Row) => void;
  confirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<Row | null>(null);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setResult(null);
    try {
      const f = new FormData(e.currentTarget);
      let values: Row = { ...Object.fromEntries(f), ...fixed };
      for (const field of fields)
        if (field.type === "number")
          values[field.name] = Number(values[field.name]);
      if (transform) values = transform(values);
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: values }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Permintaan gagal.");
      setResult(data);
      onResult?.(data);
      if (data.redirect) router.push(data.redirect);
      router.refresh();
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Terjadi gangguan.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="action-form" onSubmit={send}>
      {fields.map((f) => (
        <FieldInput key={f.name} field={f} />
      ))}
      {children}
      <button className="btn btn-hot" disabled={busy} type="submit">
        {busy ? "Memproses…" : label}
      </button>
      {result && (
        <div
          role={result.error ? "alert" : "status"}
          className={`banner ${result.error ? "bad" : "ok"}`}
        >
          {result.error || result.message || "Perubahan tersimpan."}
          {result.secret && (
            <div className="secret">
              <b>Secret autentikator</b>
              <code>{result.secret}</code>
              <a href={result.uri}>Buka aplikasi autentikator</a>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
function Upload({
  target,
  kind = "evidence",
}: {
  target: string;
  kind?: "evidence" | "asset";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="action-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          file = f.get("file") as File;
        if (!file?.size) return;
        setBusy(true);
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/octet-stream",
            "x-target-id": target,
            "x-file-kind": kind,
            "x-file-name": encodeURIComponent(file.name),
          };
          if (kind === "asset") {
            headers["x-embargo-at"] = new Date(
              String(f.get("embargo")),
            ).toISOString();
            headers["x-rights-note"] = encodeURIComponent(
              String(f.get("rights")),
            );
          }
          const r = await fetch("/api/upload", {
              method: "POST",
              headers,
              body: file,
            }),
            v = await r.json();
          setMessage(v.error || "File diunggah.");
          router.refresh();
        } catch {
          setMessage("Unggah gagal. Coba kembali.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="f">
        <span>
          {kind === "asset" ? "Materi kampanye" : "Tambah bukti views"}
        </span>
        <input
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/webp,video/mp4"
          required
        />
        <small>Maksimal 20 MB. Bukti: maksimal 3 file per posting.</small>
      </label>
      {kind === "asset" && (
        <>
          <FieldInput
            field={{
              name: "embargo",
              label: "Materi boleh diakses mulai (waktu lokal)",
              type: "datetime-local",
            }}
          />
          <FieldInput
            field={{
              name: "rights",
              label: "Hak penggunaan / larangan spoiler",
              type: "textarea",
            }}
          />
        </>
      )}
      <button className="btn" disabled={busy}>
        {busy ? "Mengunggah…" : "Unggah file"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
function Poster({
  title,
  color = "#503256",
}: {
  title: string;
  color?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 360 640"
      role="img"
      aria-label={`Ilustrasi poster ${title}`}
    >
      <defs>
        <linearGradient id={id} x2="1" y2="1">
          <stop stopColor={color} />
          <stop offset="1" stopColor="#110f24" />
        </linearGradient>
      </defs>
      <rect width="360" height="640" fill={`url(#${id})`} />
      <circle cx="275" cy="165" r="105" fill="#ffd23d" opacity=".8" />
      <path
        d="m0 420 120-280 90 280 130-200 20 420H0"
        fill="#18141f"
        opacity=".55"
      />
      <rect
        x="92"
        y="200"
        width="148"
        height="260"
        rx="74"
        fill="#ff5b3a"
        opacity=".6"
      />
      <circle cx="166" cy="250" r="35" fill="#cbbcff" />
      <path d="M128 326q40-50 78 0v130h-78Z" fill="#18141f" />
      <g stroke="#fff" strokeOpacity=".25">
        <path d="M20 20v600h320V20Z" fill="none" />
        <path d="M20 100h320M20 540h320" />
      </g>
      <text x="40" y="70" fill="#fff" fontSize="13" letterSpacing="5">
        SPARKSVIU / FILM
      </text>
    </svg>
  );
}
function CampaignCard({ c }: { c: Row }) {
  const r = c.rules as Rules;
  return (
    <Link
      href={`/kampanye/${c.slug}`}
      className={`rc ${c.status === "closed" ? "dim" : ""}`}
    >
      <Poster title={c.title} color={c.color} />
      <div className="shade" />
      <div className="tp">
        <L value={c.status} />
        <span className="sticker plain">{c.genre}</span>
      </div>
      <span className="rate sticker tilt">
        {r.model === "CPM_LINEAR"
          ? `${money(r.rate)} / 1rb`
          : r.model === "FIXED_APPROVED"
            ? money(r.rate)
            : `s/d ${money(r.cap)}`}
      </span>
      <div className="bt">
        <span className="meta">
          {c.studio} · {c.phase}
        </span>
        <h3>{c.title}</h3>
        <span className="meta">{c.platforms.join(" + ")}</span>
        <div className="slots">
          <i
            style={{
              width: `${Math.min(100, (Number(c.filled || 0) / c.quota) * 100)}%`,
            }}
          />
        </div>
        <div className="row">
          <span>
            {c.filled || 0} / {c.quota} slot
          </span>
          <span>Lihat brief ↗</span>
        </div>
      </div>
    </Link>
  );
}
function CampaignList({ items }: { items: Row[] }) {
  const [search, setSearch] = useState(""),
    [platform, setPlatform] = useState(""),
    [status, setStatus] = useState("");
  const visible = items.filter(
    (c) =>
      `${c.title} ${c.studio}`.toLowerCase().includes(search.toLowerCase()) &&
      (!platform || c.platforms.includes(platform)) &&
      (!status || c.status === status),
  );
  return (
    <>
      <div className="search">
        <input
          aria-label="Cari film atau studio"
          placeholder="Cari film atau studio…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="">Semua platform</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
        </select>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Semua status</option>
          {["open", "paused", "measuring", "closed"].map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </div>
      <p className="cnt">{visible.length} kampanye</p>
      <div className="grid">
        {visible.length ? (
          visible.map((c) => <CampaignCard key={c.id} c={c} />)
        ) : (
          <Empty>Kampanye yang sesuai akan muncul di sini saat tersedia.</Empty>
        )}
      </div>
    </>
  );
}
const why = [
  ["Ambil slot", "Pilih kampanye dan baca ketentuannya."],
  ["Bikin & posting", "Gunakan materi sesuai hak dan brief film."],
  ["Kirim link", "Reviewer memeriksa posting dan bukti."],
  ["Validasi views", "Reward mengikuti tarif yang dikunci di slotmu."],
  ["Cairkan reward", "Ajukan saldo final dan pantau konfirmasi pembayaran."],
];
function Home({ data }: { data: Row }) {
  const featured = data.campaigns?.[0];
  return (
    <>
      <section className="wrap hero">
        <div>
          <span className="sticker lilac tilt">
            Buat yang suka film & bikin konten
          </span>
          <h1 style={{ marginTop: 22 }}>
            Film seru.
            <br />
            Kontenmu.
            <br />
            <span className="hl">Reward-mu.</span>
          </h1>
          <p className="lead">
            Temukan kampanye film, ubah ide jadi konten, dan pantau reward-mu
            sampai cair.
          </p>
          <div className="ctas">
            <Link className="btn btn-hot" href="/kampanye">
              Cari kampanye <Icon name="arrow" />
            </Link>
            <a className="btn" href="#cara-kerja">
              Lihat cara kerja
            </a>
          </div>
          <div className="proof">
            <span className="sticker plain">Tarif terlihat di awal</span>
            <span className="sticker plain">Review & riwayat jelas</span>
          </div>
        </div>
        <div className="phone">
          <div className="screen">
            <div className="reel">
              <Poster
                title={featured?.title || "Cerita berikutnya"}
                color={featured?.color || "#56346b"}
              />
              <div className="ov">
                <span className="sticker sun">
                  {featured
                    ? "Kampanye terbaru"
                    : "Ruang untuk cerita berikutnya"}
                </span>
                <h2 style={{ fontSize: 30 }}>
                  {featured?.title || "Giliran kontenmu masuk layar."}
                </h2>
                <span>
                  {featured?.studio || "Kampanye film untuk kreator Indonesia"}
                </span>
              </div>
            </div>
          </div>
          <div className="float f1">
            <span>Reward kampanye</span>
            <b>Atur per brief</b>
          </div>
          <div className="float f2">
            <span>Dari posting ke pencairan</span>
            <b>Semua terlacak ↗</b>
          </div>
        </div>
      </section>
      <section className="wrap blk">
        <div className="head">
          <h2>
            Lagi tayang
            <br />
            di feed kampanye.
          </h2>
          <Link href="/kampanye" className="btn">
            Lihat semua <Icon name="arrow" />
          </Link>
        </div>
        <div className="grid">
          {data.campaigns?.length ? (
            data.campaigns
              .slice(0, 4)
              .map((c: Row) => <CampaignCard c={c} key={c.id} />)
          ) : (
            <Empty>
              Belum ada kampanye yang dibuka. Kembali lagi untuk brief film
              berikutnya.
            </Empty>
          )}
        </div>
      </section>
      <section className="wrap blk" id="cara-kerja">
        <div className="head">
          <h2>Ide → posting → reward.</h2>
          <p>Lima langkah, dengan status yang bisa kamu pantau.</p>
        </div>
        <ol className="steps">
          {why.map(([title, desc], i) => (
            <li key={title}>
              <span className="n">{i + 1}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="wrap blk">
        <div className="head">
          <h2>
            Setiap kampanye,
            <br />
            punya cara bayarnya.
          </h2>
          <p>
            Cek detail tarif, batas reward, dan masa pengukuran sebelum
            mengambil slot.
          </p>
        </div>
        <div className="models">
          {[
            [
              "Per 1.000 views",
              "Reward mengikuti views valid, dengan minimum dan batas per posting.",
            ],
            [
              "Bonus bertingkat",
              "Capai ambang views untuk mendapatkan bonus tier tertinggi.",
            ],
            [
              "Tarif tetap",
              "Nominal disepakati di awal, setelah posting disetujui.",
            ],
          ].map(([title, desc]) => (
            <article className="model" key={title}>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="wrap blk">
        <div className="studio">
          <div>
            <h2>
              Punya film yang
              <br />
              perlu dibicarakan?
            </h2>
            <p>
              Kelola brief, komunitas kreator, hasil kampanye, dan pencairan
              dalam satu alur.
            </p>
          </div>
          <Link className="btn" href="/bantuan">
            Hubungi tim <Icon name="arrow" />
          </Link>
        </div>
      </section>
    </>
  );
}
function Detail({ c, user }: { c: Row; user: Row }) {
  const [views, setViews] = useState(10000);
  if (!c)
    return <Empty>Kampanye tidak ditemukan atau belum dipublikasikan.</Empty>;
  const r = c.rules as Rules;
  return (
    <div className="wrap">
      <Link className="back" href="/kampanye">
        ← Semua kampanye
      </Link>
      <div className="dt">
        <aside className="left">
          <div className="rc">
            <Poster title={c.title} color={c.color} />
            <div className="shade" />
            <div className="bt">
              <h3>{c.title}</h3>
              <span>{c.studio}</span>
            </div>
          </div>
          <div className="cta-bar">
            {user ? (
              <ActionForm
                action="takeSlot"
                fixed={{ id: c.id }}
                label="Ambil slot kampanye"
                fields={[
                  {
                    name: "platform",
                    label: "Platform posting",
                    options: c.platforms.map((p: string) => ({
                      value: p,
                      label: p,
                    })),
                  },
                ]}
              />
            ) : (
              <Link className="btn btn-hot" href="/masuk">
                Masuk untuk ambil slot
              </Link>
            )}
            <small>Tarif terkunci setelah kamu mengambil slot.</small>
          </div>
        </aside>
        <article>
          <div className="sub">
            <L value={c.status} />
            <span className="sticker lilac">{c.phase}</span>
          </div>
          <h1>{c.title}</h1>
          <p className="intro">
            {c.studio} · {c.genre}
          </p>
          <div className="card">
            <h2>Brief kampanye</h2>
            <p className="preserve">{c.brief}</p>
            <p className="muted">
              Materi film tersedia setelah mengambil slot dan melewati waktu
              embargo. Posting wajib mengikuti ketentuan promosi berbayar
              platform.
            </p>
          </div>
          <div className="card">
            <h2>Reward & ketentuan</h2>
            {[
              ["Skema", labels[r.model]],
              [
                "Tarif",
                r.model === "CPM_LINEAR"
                  ? `${money(r.rate)} / 1.000 views`
                  : r.model === "FIXED_APPROVED"
                    ? money(r.rate)
                    : "Tier tertinggi",
              ],
              ["Minimum views", r.minViews.toLocaleString("id-ID")],
              ["Batas per posting", money(r.cap)],
              ["Tenggat unggah", date(c.upload_deadline)],
              ["Cutoff views", date(c.cutoff_at)],
              ["Slot", `${c.filled} / ${c.quota}`],
            ].map(([a, b]) => (
              <div className="trow" key={a}>
                <span>{a}</span>
                <b>{b}</b>
              </div>
            ))}
            {r.model === "VIEW_TIER_HIGHEST" &&
              r.tiers.map((t) => (
                <div className="trow" key={t.views}>
                  <span>≥ {t.views.toLocaleString("id-ID")} views</span>
                  <b>{money(t.amount)}</b>
                </div>
              ))}
            <div className="calc">
              <label htmlFor="views">Simulasi views</label>
              <input
                id="views"
                type="number"
                min="0"
                max="1000000000"
                value={views}
                onChange={(e) =>
                  setViews(Math.min(1e9, Math.max(0, Number(e.target.value))))
                }
              />
              <div className="res">
                <span>Estimasi</span>
                <b>{money(reward(r, Math.floor(views)))}</b>
              </div>
              <small>
                Simulasi bukan saldo. Views valid dan penilaian akhir menentukan
                reward.
              </small>
            </div>
          </div>
          <div className="card">
            <h2>Setelah posting</h2>
            <p>
              Kirim link asli dan bukti views. Penilaian final dibuka setelah
              cutoff, dengan masa keberatan 48 jam dan masa tunggu saldo 24 jam
              setelah reward final.
            </p>
            <p className="muted">
              Bukti final diambil dalam 60 menit sebelum cutoff. Jika bukti
              tidak tersedia, reviewer meminta klarifikasi; angka views tidak
              diisi otomatis.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
function Auth({
  path,
  data,
  token,
}: {
  path: string;
  data: Row;
  token: string;
}) {
  let title = "Masuk ke Sparksviu",
    action = "login",
    label = "Masuk",
    fields: Field[] = [
      { name: "email", label: "Email", type: "email" },
      { name: "password", label: "Kata sandi", type: "password" },
      ...(data.demoPasswordOnly ? [] : [{
        name: "code",
        label: "Kode autentikator (jika aktif)",
        required: false,
        max: 6,
      }]),
    ];
  let fixed: Row = {};
  if (path === "daftar") {
    title = "Bikin akun kreator";
    action = "register";
    label = "Buat akun";
    fields = [{ name: "name", label: "Nama lengkap" }, ...fields.slice(0, 2)];
    fixed = { consent: true };
  }
  if (path === "lupa-password") {
    title = "Atur ulang kata sandi";
    action = "forgot";
    label = "Kirim tautan";
    fields = [fields[0]];
  }
  if (path === "reset") {
    title = "Kata sandi baru";
    action = "reset";
    label = "Simpan kata sandi";
    fields = [fields[1]];
    fixed = { token };
  }
  if (path === "verifikasi") {
    title = "Verifikasi email";
    action = "verify";
    label = "Verifikasi sekarang";
    fields = [];
    fixed = { token };
  }
  return (
    <div className="wrap auth">
      <div className="box">
        <span className="sticker lilac">Feed Kreator</span>
        <h1>{title}</h1>
        {path === "masuk" && data.demoPasswordOnly && <p className="muted">Mode demo: masuk dengan email dan kata sandi, tanpa kode autentikator.</p>}
        {path === "daftar" && !data.registrationEnabled ? (
          <div className="banner warn">
            Pendaftaran belum dibuka. Hubungi pengelola untuk informasi akses.
          </div>
        ) : (
          <ActionForm
            action={action}
            fields={fields}
            label={label}
            fixed={fixed}
          >
            {path === "daftar" && (
              <label className="check">
                <input type="checkbox" required />
                <span>
                  Saya menyetujui <Link href="/syarat">syarat penggunaan</Link>{" "}
                  dan <Link href="/kebijakan">kebijakan privasi</Link>.
                </span>
              </label>
            )}
          </ActionForm>
        )}
        <div className="switch">
          <Link href="/masuk">Masuk</Link> · <Link href="/daftar">Daftar</Link>{" "}
          · <Link href="/lupa-password">Lupa kata sandi</Link>
        </div>
      </div>
    </div>
  );
}
function Wallet({ wallet }: { wallet: Row }) {
  return (
    <div className="stats">
      {[
        ["available", "Bisa dicairkan"],
        ["pending", "Menunggu rilis"],
        ["held", "Ditahan pencairan"],
        ["paid", "Sudah dibayar"],
      ].map(([k, t]) => (
        <div className={`stat ${k === "available" ? "yellow" : ""}`} key={k}>
          <span>{t}</span>
          <b>{money(wallet?.[k])}</b>
        </div>
      ))}
    </div>
  );
}
function Work({ data }: { data: Row }) {
  return (
    <>
      {data.participations?.length ? (
        data.participations.map((p: Row) => {
          const s = data.submissions.find(
            (v: Row) => v.participation_id === p.id,
          );
          const a = s?.assessment;
          return (
            <article className="card" key={p.id}>
              <div className="card-head">
                <div>
                  <p className="eyebrow">{p.platform} · versi tarif terkunci</p>
                  <h2>{p.title}</h2>
                </div>
                <L value={s?.status || p.status} />
              </div>
              <div className="inline-meta">
                <span>Unggah: {date(p.upload_deadline)}</span>
                <span>Cutoff: {date(p.cutoff_at)}</span>
                <Link href={`/kampanye/${p.slug}`}>Lihat brief ↗</Link>
              </div>
              <details>
                <summary>Tarif & materi kampanye</summary>
                <p>
                  {labels[p.rules.model]} · maksimum {money(p.reserve_amount)}
                </p>
                {(data.assets || [])
                  .filter((v: Row) => v.campaign_id === p.campaign_id)
                  .map((v: Row) => (
                    <div className="trow" key={v.id}>
                      <div>
                        {v.name} · v{v.version}
                        <small className="muted"> {v.rights_note}</small>
                      </div>
                      {new Date(v.embargo_at) <= new Date() ? (
                        <a href={`/api/files/${v.id}`}>Unduh</a>
                      ) : (
                        <span>Embargo {date(v.embargo_at)}</span>
                      )}
                    </div>
                  ))}
              </details>
              {(!s || s.status === "revision") &&
                !["expired", "rejected"].includes(p.status) && (
                  <ActionForm
                    action="submitPost"
                    fixed={{ id: p.id }}
                    label={s ? "Kirim revisi" : "Kirim link posting"}
                    fields={[
                      {
                        name: "url",
                        label: "Link asli posting",
                        type: "url",
                        value: s?.url,
                        help: "TikTok: /@akun/video/id · Instagram: /reel/kode atau /p/kode.",
                      },
                      {
                        name: "note",
                        label: "Catatan untuk reviewer",
                        type: "textarea",
                        required: false,
                      },
                    ]}
                  />
                )}{" "}
              {s && (
                <>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="external"
                  >
                    Buka posting ↗
                  </a>
                  {s.decisions?.map((v: Row) => (
                    <div key={v.id} className="banner info">
                      <div>
                        <b>
                          {labels[v.decision]} · {date(v.created_at)}
                        </b>
                        {v.reason}
                      </div>
                    </div>
                  ))}
                  <div className="files">
                    {s.evidence?.map((v: Row) => (
                      <a
                        className="file"
                        key={v.id}
                        href={`/api/files/${v.id}`}
                      >
                        {v.name} <span>Unduh ↗</span>
                      </a>
                    ))}
                  </div>
                  {["submitted", "approved", "revision"].includes(s.status) && (
                    <Upload target={s.id} />
                  )}{" "}
                  {s.status === "approved" && s.evidence?.length > 0 && (
                    <ActionForm
                      action="reportViews"
                      fixed={{ id: s.id }}
                      label="Laporkan views"
                      transform={(v) => ({
                        ...v,
                        capturedAt: new Date(v.capturedAt).toISOString(),
                      })}
                      fields={[
                        {
                          name: "views",
                          label: "Views pada bukti",
                          type: "number",
                          min: 0,
                          max: 100000000000,
                        },
                        {
                          name: "capturedAt",
                          label: "Waktu bukti diambil (waktu lokal)",
                          type: "datetime-local",
                        },
                        {
                          name: "evidenceId",
                          label: "File bukti",
                          options: s.evidence.map((v: Row) => ({
                            value: v.id,
                            label: v.name,
                          })),
                        },
                      ]}
                    />
                  )}{" "}
                  {s.snapshots?.length > 0 && (
                    <div>
                      <h3>Riwayat views</h3>
                      {s.snapshots.map((v: Row) => (
                        <div className="trow" key={v.id}>
                          <span>
                            {Number(v.views).toLocaleString("id-ID")} views ·{" "}
                            {date(v.captured_at)}
                            <small className="muted"> {v.reason}</small>
                          </span>
                          <L value={v.status} />
                        </div>
                      ))}
                    </div>
                  )}
                  {a && (
                    <div className="calc">
                      <b>Reward penilaian: {money(a.amount)}</b>
                      <span>
                        {Number(a.accepted_views).toLocaleString("id-ID")} views
                        valid · {labels[a.status]}
                      </span>
                      <span>{a.reason}</span>
                      <small>Keberatan hingga {date(a.objection_until)}</small>
                      {a.status === "proposed" &&
                        new Date(a.objection_until) > new Date() && (
                          <ActionForm
                            action="dispute"
                            label="Ajukan keberatan"
                            fixed={{ id: a.id }}
                            fields={[
                              {
                                name: "reason",
                                label: "Alasan & bukti pendukung",
                                type: "textarea",
                              },
                            ]}
                          />
                        )}
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })
      ) : (
        <Empty>
          Ambil slot kampanye untuk mulai mengerjakan brief pertamamu.
        </Empty>
      )}
    </>
  );
}
function Earnings({ data }: { data: Row }) {
  return (
    <>
      <Wallet wallet={data.wallet} />
      <div className="banner info">
        Estimasi dari views belum menjadi saldo. Saldo menunggu rilis berasal
        dari reward final, lalu tersedia setelah masa tunggu 24 jam.
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Riwayat saldo</h2>
          <Link className="btn btn-hot" href="/app/cairkan">
            Cairkan saldo
          </Link>
        </div>
        <Table
          heads={["Waktu", "Peristiwa", "Pos saldo", "Perubahan"]}
          rows={(data.entries || [])
            .filter((v: Row) => v.bucket !== "campaign")
            .map((v: Row) => [
              date(v.created_at),
              v.kind,
              v.bucket,
              `${Number(v.delta) > 0 ? "+" : ""}${money(v.delta)}`,
            ])}
        />
      </div>
    </>
  );
}
function Payouts({ data }: { data: Row }) {
  return data.payouts?.length ? (
    <div className="stack">
      {data.payouts.map((p: Row) => (
        <div className="card" key={p.id}>
          <div className="card-head">
            <h2>{money(p.amount)}</h2>
            <L value={p.status} />
          </div>
          <p>
            {p.destination_snapshot.bank_code.toUpperCase()} · ••••
            {p.destination_snapshot.account_last4} ·{" "}
            {p.destination_snapshot.holder}
          </p>
          <small>
            {date(p.created_at)} · {p.id}
          </small>
          {p.provider_id && <small>ID Flip: {p.provider_id}</small>}
          <p>Metode: {p.method==='manual'?'Transfer manual':'Flip Bisnis'}</p>
          {(p.manual_proofs||[]).map((proof:Row)=><p key={proof.id}><a href={`/api/files/${proof.id}`}>Bukti {proof.reference}</a> · {labels[proof.status]||proof.status}</p>)}
          {p.failure_reason && (
            <div className="banner warn">{p.failure_reason}</div>
          )}
          {p.status === "requested" && (
            <ActionForm
              action="cancelPayout"
              fixed={{ id: p.id }}
              label="Batalkan pengajuan"
              confirm="Batalkan pengajuan ini dan kembalikan dana ke saldo tersedia?"
            />
          )}
        </div>
      ))}
    </div>
  ) : (
    <Empty>
      Riwayat pencairan akan muncul setelah kamu mengajukan pencairan saldo.
    </Empty>
  );
}
function Profile({ data }: { data: Row }) {
  const u = data.user;
  return (
    <div className="two-col">
      <div>
        <section className="card">
          <h2>Data akun</h2>
          <p>
            {u.email} · {u.role}
          </p>
          {!u.email_verified_at && (
            <ActionForm action="resendVerify" label="Kirim email verifikasi" />
          )}
          <ActionForm
            action="profile"
            fields={[{ name: "name", label: "Nama lengkap", value: u.name }]}
          />
        </section>
        <section className="card">
          <h2>Akun sosial</h2>
          {data.social.map((v: Row) => (
            <div className="trow" key={v.id}>
              <b>{v.platform}</b>
              <span>{v.handle}</span>
            </div>
          ))}
          <ActionForm
            action="social"
            label="Tambah akun sosial"
            fields={[
              {
                name: "platform",
                label: "Platform",
                options: [
                  { value: "tiktok", label: "TikTok" },
                  { value: "instagram", label: "Instagram" },
                ],
              },
              { name: "handle", label: "Username / handle" },
            ]}
          />
          <small className="muted">
            Kepemilikan posting tetap diperiksa reviewer. Menambahkan handle
            tidak otomatis memverifikasi akun.
          </small>
        </section>
        <section className="card">
          <h2>Keamanan akun</h2>
          {data.demoPasswordOnlyUser ? (
            <div className="banner warn">
              Mode demo: cukup email dan kata sandi, tanpa autentikator. Akses akun tetap dibatasi masa berlaku UAT.
            </div>
          ) : u.totp_confirmed ? (
            <div className="banner ok">
              Autentikator aktif. Kode diperlukan setiap masuk.
            </div>
          ) : (
            <>
              <p>
                Staf wajib mengaktifkan autentikator sebelum membuka dashboard
                pengelolaan. Simpan secret dengan aman.
              </p>
              <ActionForm
                action="totpStart"
                label="Buat secret autentikator"
                fields={[
                  {
                    name: "password",
                    label: "Konfirmasi kata sandi",
                    type: "password",
                  },
                ]}
              />
              <ActionForm
                action="totpConfirm"
                label="Aktifkan autentikator"
                fields={[{ name: "code", label: "Kode 6 digit", max: 6 }]}
              />
            </>
          )}
          <ActionForm action="logout" label="Keluar dari akun" />
        </section>
      </div>
      <section className="card align-start">
        <h2>Rekening pencairan</h2>
        <p className="muted">
          Setelah diverifikasi finance, rekening melewati masa tunggu 24 jam
          sebelum digunakan.
        </p>
        {data.destinations.map((d: Row) => (
          <div className="destination" key={d.id}>
            <b>
              {d.bank_code.toUpperCase()} · ••••{d.account_last4}
            </b>
            <span>{d.holder}</span>
            <L value={d.status} />
            {d.verified_at && <small>Verifikasi {date(d.verified_at)}</small>}
          </div>
        ))}
        <ActionForm
          action="destination"
          label="Tambah rekening"
          fields={[
            {
              name: "bank",
              label: "Bank",
              options: data.banks.map((b: string) => ({
                value: b,
                label: b.toUpperCase(),
              })),
            },
            {
              name: "account",
              label: "Nomor rekening",
              help: "Hanya angka. Disimpan terenkripsi.",
            },
            { name: "holder", label: "Nama pemilik sesuai rekening" },
          ]}
        />
      </section>
    </div>
  );
}
function Participant({ path, data }: { path: string; data: Row }) {
  const page = path.split("/")[1] || "home";
  const title: Record<string, string> = {
    home: `Halo, ${data.user.name.split(" ")[0]}.`,
    kampanye: "Cari cerita berikutnya.",
    pekerjaan: "Pekerjaanmu.",
    pendapatan: "Reward, dengan riwayat.",
    cairkan: "Cairkan hasil karyamu.",
    payout: "Riwayat pencairan.",
    profil: "Akun & preferensi.",
    notifikasi: "Kabar untukmu.",
  };
  return (
    <div className="wrap pg">
      <div className="head">
        <div>
          <p className="eyebrow">Ruang kreator</p>
          <h1>{title[page] || "Ruang kreator"}</h1>
        </div>
        {page !== "profil" && (
          <Link className="btn" href="/app/profil">
            Atur profil <Icon name="user" />
          </Link>
        )}
      </div>
      {!data.user.email_verified_at && (
        <div className="banner warn">
          Verifikasi email di Profil sebelum mengambil slot atau mencairkan
          saldo.
        </div>
      )}
      {page === "home" && (
        <>
          <Wallet wallet={data.wallet} />
          <div className="models compact">
            <Link href="/app/pekerjaan" className="model">
              <h3>
                {
                  data.participations.filter(
                    (v: Row) =>
                      !["expired", "rejected", "settled"].includes(v.status),
                  ).length
                }
              </h3>
              <span>Pekerjaan aktif ↗</span>
            </Link>
            <Link href="/app/notifikasi" className="model">
              <h3>
                {data.notifications.filter((v: Row) => !v.read_at).length}
              </h3>
              <span>Notifikasi belum dibaca ↗</span>
            </Link>
            <Link href="/app/payout" className="model">
              <h3>
                {
                  data.payouts.filter(
                    (v: Row) =>
                      !["succeeded", "failed", "cancelled"].includes(v.status),
                  ).length
                }
              </h3>
              <span>Pencairan berjalan ↗</span>
            </Link>
          </div>
          <h2 className="section-title">Kampanye untuk feed-mu</h2>
          <CampaignList items={data.campaigns} />
        </>
      )}
      {page === "kampanye" && <CampaignList items={data.campaigns} />}{" "}
      {page === "pekerjaan" && <Work data={data} />}{" "}
      {page === "pendapatan" && <Earnings data={data} />}{" "}
      {page === "payout" && <Payouts data={data} />}{" "}
      {page === "profil" && <Profile data={data} />}{" "}
      {page === "cairkan" && (
        <>
          <Wallet wallet={data.wallet} />
          <div className="two-col">
            <section className="card">
              <h2>Ajukan pencairan</h2>
              <p>
                Minimum {money(data.minPayout)}, maksimum harian{" "}
                {money(data.maxPayout)}. {data.payoutMode==='manual'?'Pengajuan diperiksa finance, kemudian bukti transfer wajib dikonfirmasi petugas kedua.':'Pengajuan diproses setelah persetujuan finance pada jadwal pembayaran.'}
              </p>
              {data.destinations.some((d: Row) => d.status === "verified") ? (
                <PayoutForm data={data} />
              ) : (
                <div className="banner warn">
                  Tambahkan rekening di Profil dan tunggu verifikasi finance.
                </div>
              )}
              <Link href="/app/payout">Lihat riwayat pencairan ↗</Link>
            </section>
            <section className="card">
              <h2>Periksa sebelum mengajukan</h2>
              <p>
                Nomor rekening dikunci pada saat pengajuan. Selama menunggu
                konfirmasi pembayaran, nominal ditahan dan tidak bisa diajukan dua kali.
              </p>
              <p>
                Gangguan koneksi bukan berarti transfer gagal. Saldo
                dikembalikan hanya setelah ada status gagal final atau
                pembatalan sebelum disetujui.
              </p>
              <Link href="/app/profil">Kelola rekening ↗</Link>
            </section>
          </div>
        </>
      )}
      {page === "notifikasi" && (
        <>
          <ActionForm action="readNotifications" label="Tandai semua dibaca" />
          {data.notifications.length ? (
            data.notifications.map((n: Row) => (
              <article className="card" key={n.id}>
                <h2>{n.title}</h2>
                <p>{n.message}</p>
                <small>
                  {date(n.created_at)} {n.read_at ? "· Dibaca" : "· Baru"}
                </small>
              </article>
            ))
          ) : (
            <Empty>
              Notifikasi tentang pekerjaan dan pencairan muncul di sini.
            </Empty>
          )}
        </>
      )}
    </div>
  );
}
function PayoutForm({ data }: { data: Row }) {
  const [key] = useState(() => crypto.randomUUID());
  return (
    <ActionForm
      action="payout"
      label="Ajukan pencairan"
      fixed={{ key }}
      fields={[
        {
          name: "destination",
          label: "Rekening tujuan",
          options: data.destinations
            .filter((d: Row) => d.status === "verified")
            .map((d: Row) => ({
              value: d.id,
              label: `${d.bank_code.toUpperCase()} ••••${d.account_last4} — ${d.holder}`,
            })),
        },
        {
          name: "amount",
          label: "Nominal (Rp)",
          type: "number",
          min: data.minPayout,
          max: data.maxPayout,
        },
      ]}
      confirm="Pastikan rekening dan nominal sudah benar. Dana akan ditahan dari saldo tersedia."
    />
  );
}
function Table({ heads, rows }: { heads: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={heads.length}>Belum ada data.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function RulesFields() {
  const [model, setModel] = useState("CPM_LINEAR");
  return (
    <fieldset>
      <legend>Aturan reward</legend>
      <label className="f">
        <span>Skema pembayaran</span>
        <select
          name="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {["CPM_LINEAR", "VIEW_TIER_HIGHEST", "FIXED_APPROVED"].map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="row2">
        <FieldInput
          field={{
            name: "rate",
            label:
              model === "FIXED_APPROVED"
                ? "Nominal tetap (Rp)"
                : "Tarif / 1.000 views (Rp)",
            type: "number",
            min: 0,
            value: 2000,
          }}
        />
        <FieldInput
          field={{
            name: "cap",
            label: "Maksimum reward per posting (Rp)",
            type: "number",
            min: 1,
            value: 100000,
          }}
        />
      </div>
      <FieldInput
        field={{
          name: "minViews",
          label: "Minimum views (hanya CPM)",
          type: "number",
          min: 0,
          value: 5000,
        }}
      />
      {model === "VIEW_TIER_HIGHEST" && (
        <FieldInput
          field={{
            name: "tiers",
            label: "Tier: views=reward, satu per baris",
            type: "textarea",
            value: "10000=25000\n50000=75000\n100000=100000",
            help: "Tier tertinggi saja, tidak dijumlah. Ambang dan nominal harus naik.",
          }}
        />
      )}
    </fieldset>
  );
}
function toRules(v: Row) {
  const rules = {
    model: v.model,
    rate: Number(v.rate),
    cap: Number(v.cap),
    minViews: Number(v.minViews),
    tiers:
      v.model === "VIEW_TIER_HIGHEST"
        ? String(v.tiers)
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const [views, amount] = line.split("=");
              return { views: Number(views), amount: Number(amount) };
            })
        : [],
  };
  const out = { ...v };
  for (const k of ["model", "rate", "cap", "minViews", "tiers"]) delete out[k];
  return { ...out, rules };
}
function CampaignEditor() {
  return (
    <details className="card">
      <summary>Buat kampanye baru</summary>
      <ActionForm
        action="createCampaign"
        label="Simpan sebagai draf"
        fields={[
          { name: "title", label: "Judul film" },
          {
            name: "slug",
            label: "Slug URL",
            help: "Huruf kecil, angka, dan tanda hubung.",
          },
          { name: "studio", label: "Studio / klien" },
          { name: "genre", label: "Genre" },
          { name: "phase", label: "Fase kampanye", value: "Pra-rilis" },
          {
            name: "brief",
            label: "Brief, tugas, disclosure, dan larangan spoiler",
            type: "textarea",
          },
          {
            name: "platforms",
            label: "Platform",
            options: [
              { value: "tiktok,instagram", label: "TikTok + Instagram" },
              { value: "tiktok", label: "TikTok" },
              { value: "instagram", label: "Instagram" },
            ],
          },
          {
            name: "quota",
            label: "Jumlah slot",
            type: "number",
            min: 1,
            value: 100,
          },
          {
            name: "budget",
            label: "Budget reward (Rp)",
            type: "number",
            min: 1,
            value: 10000000,
          },
          {
            name: "uploadDeadline",
            label: "Tenggat unggah (waktu lokal)",
            type: "datetime-local",
          },
          {
            name: "cutoffAt",
            label: "Cutoff views (waktu lokal)",
            type: "datetime-local",
          },
          {
            name: "color",
            label: "Warna poster",
            type: "color",
            value: "#503256",
          },
        ]}
        transform={(v) =>
          toRules({
            ...v,
            platforms: v.platforms.split(","),
            uploadDeadline: new Date(v.uploadDeadline).toISOString(),
            cutoffAt: new Date(v.cutoffAt).toISOString(),
          })
        }
      >
        <RulesFields />
      </ActionForm>
    </details>
  );
}
function Operations({ path, data }: { path: string; data: Row }) {
  const page = path.split("/")[1] || "kampanye";
  const canManage = ["ops", "superadmin"].includes(data.user.role);
  return (
    <div className="wrap pg">
      <p className="eyebrow">Dashboard operasional</p>
      <h1>
        {(
          {
            kampanye: "Kampanye film.",
            review: "Review & pengukuran.",
            sengketa: "Keberatan peserta.",
            pengguna: "Pengguna & peran.",
            audit: "Jejak perubahan.",
          } as Row
        )[page] || "Operasional"}
      </h1>
      <div className="tabs">
        {[
          ["kampanye", "Kampanye"],
          ["review", "Review"],
          ["sengketa", "Keberatan"],
          ...(data.user.role === "superadmin"
            ? [["pengguna", "Pengguna"]]
            : []),
          ["audit", "Audit"],
        ].map(([k, v]) => (
          <Link
            href={`/ops/${k}`}
            className={`btn ${k === page ? "btn-hot" : ""}`}
            key={k}
          >
            {v}
          </Link>
        ))}
      </div>
      {page === "kampanye" && (
        <>
          {canManage && <CampaignEditor />}
          {data.allCampaigns.map((c: Row) => (
            <article className="card" key={c.id}>
              <div className="card-head">
                <div>
                  <span className="eyebrow">
                    {c.studio} · {c.phase}
                  </span>
                  <h2>{c.title}</h2>
                </div>
                <L value={c.status} />
              </div>
              <div className="stats mini">
                {[
                  ["Budget", c.budget],
                  ["Reservasi", c.reserved],
                  ["Reward final", c.spent],
                  [
                    "Sisa bebas",
                    Number(c.budget) - Number(c.reserved) - Number(c.spent),
                  ],
                ].map(([k, v]) => (
                  <div className="stat" key={k}>
                    <span>{k}</span>
                    <b>{money(v)}</b>
                  </div>
                ))}
              </div>
              <p>
                {labels[c.rules.model]} · tenggat {date(c.upload_deadline)} ·
                cutoff {date(c.cutoff_at)}
              </p>
              {canManage && (
                <>
                  <ActionForm
                    action="campaignStatus"
                    fixed={{ id: c.id }}
                    label="Ubah status"
                    fields={[
                      {
                        name: "status",
                        label: "Status kampanye",
                        options: ["open", "paused", "measuring", "closed"].map(
                          (v) => ({ value: v, label: labels[v] }),
                        ),
                        value: c.status,
                      },
                    ]}
                  />
                  <details>
                    <summary>Versi tarif baru</summary>
                    <p>
                      Slot yang sudah diambil tetap memakai versi tarif lamanya.
                    </p>
                    <ActionForm
                      action="newRules"
                      fixed={{ id: c.id }}
                      transform={toRules}
                      label="Simpan versi tarif"
                    >
                      <RulesFields />
                    </ActionForm>
                  </details>
                  <details>
                    <summary>Unggah materi berlisensi</summary>
                    <Upload kind="asset" target={c.id} />
                  </details>
                </>
              )}
            </article>
          ))}
        </>
      )}
      {page === "review" && (
        <>
          {data.reviewQueue.length ? (
            data.reviewQueue.map((s: Row) => (
              <article className="card" key={s.id}>
                <div className="card-head">
                  <div>
                    <p className="eyebrow">
                      {s.name} · {s.platform}
                    </p>
                    <h2>{s.title}</h2>
                  </div>
                  <L value={s.status} />
                </div>
                <a href={s.url} target="_blank" rel="noreferrer">
                  Buka posting asli ↗
                </a>
                <p>
                  Cutoff {date(s.cutoff_at)} · {labels[s.rules.model]}
                </p>
                <div className="files">
                  {s.evidence?.map((e: Row) => (
                    <a className="file" key={e.id} href={`/api/files/${e.id}`}>
                      {e.name} ↗
                    </a>
                  ))}
                </div>
                {s.status === "submitted" && (
                  <ActionForm
                    action="reviewPost"
                    fixed={{ id: s.id }}
                    label="Simpan hasil review"
                    fields={[
                      {
                        name: "decision",
                        label: "Keputusan",
                        options: ["approved", "revision", "rejected"].map(
                          (v) => ({ value: v, label: labels[v] }),
                        ),
                      },
                      {
                        name: "reason",
                        label:
                          "Alasan dan pemeriksaan kepemilikan / kesesuaian brief",
                        type: "textarea",
                      },
                    ]}
                  />
                )}{" "}
                {s.snapshots?.map((v: Row) => (
                  <div className="review-snapshot" key={v.id}>
                    <div className="card-head">
                      <b>
                        {Number(v.views).toLocaleString("id-ID")} views ·{" "}
                        {date(v.captured_at)}
                      </b>
                      <L value={v.status} />
                    </div>
                    <a href={`/api/files/${v.evidence_id}`}>Periksa bukti ↗</a>
                    {v.status === "reported" && (
                      <ActionForm
                        action="assessViews"
                        fixed={{ id: v.id }}
                        transform={(v) => ({
                          ...v,
                          accepted: v.accepted === "true",
                        })}
                        label="Simpan validasi"
                        fields={[
                          {
                            name: "accepted",
                            label: "Validasi bukti",
                            options: [
                              {
                                value: "true",
                                label: "Terima views sesuai bukti",
                              },
                              { value: "false", label: "Tolak bukti" },
                            ],
                          },
                          {
                            name: "reason",
                            label:
                              "Catatan pemeriksaan views / indikasi manipulasi",
                            type: "textarea",
                          },
                        ]}
                      />
                    )}
                  </div>
                ))}{" "}
                {s.status === "approved" && !s.assessment && (
                  <ActionForm
                    action="proposeAssessment"
                    fixed={{ id: s.id }}
                    transform={(v) => ({
                      ...v,
                      snapshotId: v.snapshotId || null,
                    })}
                    label="Terbitkan penilaian reward"
                    fields={[
                      {
                        name: "snapshotId",
                        label: "Snapshot final (dalam 60 menit sebelum cutoff)",
                        required: false,
                        options: [
                          {
                            value: "",
                            label: "Tanpa views — khusus tarif tetap",
                          },
                          ...(s.snapshots || [])
                            .filter((v: Row) => v.status === "accepted")
                            .map((v: Row) => ({
                              value: v.id,
                              label: `${v.views} views · ${date(v.captured_at)}`,
                            })),
                        ],
                      },
                      {
                        name: "reason",
                        label: "Ringkasan penilaian",
                        type: "textarea",
                      },
                    ]}
                  />
                )}{" "}
                {s.assessment && (
                  <div className="banner info">
                    Penilaian {money(s.assessment.amount)} · masa keberatan
                    hingga {date(s.assessment.objection_until)}
                  </div>
                )}
              </article>
            ))
          ) : (
            <Empty>
              Antrean review kosong atau peranmu tidak mencakup review.
            </Empty>
          )}
        </>
      )}
      {page === "sengketa" && (
        <>
          {data.disputes.length ? (
            data.disputes.map((d: Row) => (
              <article className="card" key={d.id}>
                <h2>{d.title}</h2>
                <p>
                  {d.name} · {money(d.amount)}
                </p>
                <div className="banner warn">{d.reason}</div>
                <ActionForm
                  action="resolveDispute"
                  fixed={{ id: d.id }}
                  transform={(v) => ({ ...v, uphold: v.uphold === "true" })}
                  label="Selesaikan keberatan"
                  fields={[
                    {
                      name: "uphold",
                      label: "Keputusan reviewer independen",
                      options: [
                        { value: "true", label: "Pertahankan penilaian" },
                        {
                          value: "false",
                          label: "Batalkan penilaian; lakukan penilaian ulang",
                        },
                      ],
                    },
                    {
                      name: "reason",
                      label: "Alasan penyelesaian",
                      type: "textarea",
                    },
                  ]}
                />
              </article>
            ))
          ) : (
            <Empty>Tidak ada keberatan yang menunggu penanganan.</Empty>
          )}
        </>
      )}
      {page === "pengguna" &&
        data.users?.map((u: Row) => (
          <article className="card" key={u.id}>
            <h2>{u.name}</h2>
            <p>
              {u.email} · {u.role} · {data.demoPasswordOnly && u.is_demo ? "Login demo tanpa autentikator" : `TOTP ${u.totp_confirmed ? "aktif" : "belum aktif"}`}
            </p>
            {u.role !== "superadmin" && (
              <ActionForm
                action="staffRole"
                fixed={{ id: u.id }}
                label="Ubah peran & cabut sesi"
                fields={[
                  {
                    name: "role",
                    label: "Peran",
                    value: u.role,
                    options: ["participant", "ops", "reviewer", "finance"].map(
                      (v) => ({ value: v, label: v }),
                    ),
                  },
                  {
                    name: "reason",
                    label: "Alasan pemberian / pencabutan akses",
                    type: "textarea",
                  },
                ]}
              />
            )}
          </article>
        ))}
      {page === "audit" && (
        <div className="card">
          <Table
            heads={["Waktu", "Peristiwa", "Objek"]}
            rows={data.audits.map((a: Row) => [
              date(a.created_at),
              a.action,
              a.object_id || "—",
            ])}
          />
        </div>
      )}
    </div>
  );
}
function Finance({ data }: { data: Row }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <div className="wrap pg">
      <p className="eyebrow">Dashboard finance</p>
      <div className="head">
        <h1>Pencairan & rekonsiliasi.</h1>
        <a className="btn" href="/api/export">
          Ekspor pencairan CSV ↗
        </a>
      </div>
      <Wallet wallet={data.totals} />
      <div
        className={`banner ${data.flipMode === "disabled" ? "warn" : "info"}`}
      >
        {data.payoutMode==='manual'?'Pencairan manual. Persetujuan menyiapkan transfer oleh petugas; bukti wajib dikonfirmasi petugas kedua. Website tidak mengirim uang.':`Mode Flip: ${data.flipMode}. Persetujuan mengantrekan pengiriman pada jadwal worker.`}
      </div>
      <section className="card">
        <h2>Verifikasi rekening</h2>
        <p className="muted">
          Verifikasi manual terhadap bukti kepemilikan yang diterima tim.
          Pencocokan bank secara otomatis belum diaktifkan.
        </p>
        {data.pendingDestinations.length ? (
          data.pendingDestinations.map((d: Row) => (
            <div className="review-snapshot" key={d.id}>
              <b>
                {d.name} · {d.bank_code.toUpperCase()} ••••{d.account_last4}
              </b>
              <p>{d.holder}</p>
              <DestinationInspection id={d.id} />
              <ActionForm
                action="verifyDestination"
                fixed={{ id: d.id }}
                transform={(v) => ({ ...v, approved: v.approved === "true" })}
                label="Simpan verifikasi"
                fields={[
                  {
                    name: "approved",
                    label: "Hasil pemeriksaan",
                    options: [
                      { value: "false", label: "Tolak rekening" },
                      { value: "true", label: "Verifikasi rekening" },
                    ],
                  },
                  {
                    name: "reason",
                    label: "Sumber bukti kepemilikan dan hasil pencocokan",
                    type: "textarea",
                  },
                ]}
              />
            </div>
          ))
        ) : (
          <p>Tidak ada rekening menunggu verifikasi.</p>
        )}
      </section>
      <section className="card">
        <h2>Pengajuan pencairan</h2>
        <Table
          heads={[
            "Pilih",
            "Peserta",
            "Nominal",
            "Tujuan",
            "Status",
            "Waktu",
            "Tindakan",
          ]}
          rows={data.allPayouts.map((p: Row) => [
            p.status === "requested" ? (
              <input
                key="check"
                aria-label={`Pilih pencairan ${p.name} ${money(p.amount)}`}
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, p.id]
                      : selected.filter((v) => v !== p.id),
                  )
                }
              />
            ) : null,
            p.name,
            money(p.amount),
            `${p.destination_snapshot.bank_code.toUpperCase()} ••••${p.destination_snapshot.account_last4}`,
            <L key="status" value={p.status} />,
            date(p.created_at),
            ["pending", "needs_review", "sending"].includes(p.status) ? (
              <ActionForm
                key="reconcile"
                action="reconcile"
                fixed={{ id: p.id }}
                label="Cek ke Flip"
              />
            ) : (
              p.failure_reason || "—"
            ),
          ])}
        />
        <ActionForm
          action="approveBatch"
          fixed={{ ids: selected }}
          label={`Setujui batch (${selected.length})`}
          confirm={`Setujui ${selected.length} pengajuan sesuai metode yang tercatat? Transfer manual tetap memerlukan bukti dan petugas kedua.`}
          onResult={() => setSelected([])}
        />
      </section>
      {data.allPayouts.filter((p:Row)=>p.method==='manual'&&['manual_processing','manual_review'].includes(p.status)).map((p:Row)=><ManualPayout key={p.id} payout={p as any} actorId={data.user.id} uat={data.uatMode}/>)}
      {(data.payoutMode==='flip'||data.reconciliations.length>0)&&<section className="card">
        <h2>Rekonsiliasi Flip</h2>
        <Table
          heads={["Waktu", "ID Flip", "Masalah"]}
          rows={data.reconciliations.map((r: Row) => [
            date(r.created_at),
            r.provider_id,
            r.reason,
          ])}
        />
        <p className="muted">
          Selisih provider tidak mengubah saldo secara manual. Konfirmasi status
          transaksi dengan Flip dan simpan jejak pemeriksaan sebelum tindak
          lanjut.
        </p>
      </section>}
    </div>
  );
}
function DestinationInspection({ id }: { id: string }) {
  const [detail, setDetail] = useState<Row | null>(null);
  return (
    <details>
      <summary>Periksa nomor rekening lengkap</summary>
      <ActionForm
        action="inspectDestination"
        fixed={{ id }}
        label="Tampilkan untuk pemeriksaan"
        fields={[{ name: "reason", label: "Alasan mengakses data rekening" }]}
        onResult={(v) => setDetail(v.destination)}
      />
      {detail && (
        <div className="banner warn">
          <div>
            <b>
              {detail.bank} · {detail.account}
            </b>
            {detail.holder}
            <p>
              Akses ini dicatat dalam audit. Tutup halaman setelah pemeriksaan.
            </p>
          </div>
        </div>
      )}
    </details>
  );
}
function Help({ data }: { data: Row }) {
  const faqs = [
    [
      "Bagaimana reward dihitung?",
      "Setiap kampanye memilih CPM, tier tertinggi, atau tarif tetap. Versi tarif dikunci saat slot diambil. Simulasi reward bukan saldo yang bisa dicairkan.",
    ],
    [
      "Kenapa views masih menunggu validasi?",
      "Views dilaporkan dengan bukti dan waktu pengambilan. Reviewer memeriksa kesesuaian posting, bukti, dan ketentuan kampanye. Penilaian final dilakukan setelah cutoff.",
    ],
    [
      "Kapan reward tersedia?",
      "Setelah penilaian ada masa keberatan 48 jam. Jika tidak ada keberatan terbuka, reward menjadi final lalu melewati masa tunggu 24 jam sebelum tersedia.",
    ],
    [
      "Kenapa rekening belum bisa dipakai?",
      "Rekening harus diverifikasi finance dan melewati masa tunggu 24 jam. Pastikan nama dan nomor rekening sesuai pemiliknya.",
    ],
    [
      "Pencairan belum sampai, apakah harus mengajukan lagi?",
      "Periksa status pencairan. Transaksi yang masih menunggu konfirmasi atau rekonsiliasi tetap ditahan. Jangan membuat transfer pengganti sebelum transaksi awal dipastikan status finalnya.",
    ],
    [
      "Boleh memakai cuplikan film apa saja?",
      "Gunakan materi yang memang diizinkan pada kampanye. Patuhi embargo, batas spoiler, dan ketentuan pengungkapan promosi berbayar pada platform.",
    ],
  ];
  return (
    <div className="wrap pg narrow">
      <p className="eyebrow">Pusat bantuan</p>
      <h1>
        Biar jelas,
        <br />
        sebelum mulai.
      </h1>
      <p className="intro">Tentang kampanye, views, dan pembayaran kreator.</p>
      <div className="faq section-title">
        {faqs.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <div className="card">
        <h2>Perlu dibantu tim?</h2>
        {data.supportEmail ? (
          <a href={`mailto:${data.supportEmail}`}>{data.supportEmail}</a>
        ) : (
          <p>
            Kontak dukungan belum diterbitkan. Pengelola perlu melengkapinya
            sebelum peluncuran publik.
          </p>
        )}
      </div>
    </div>
  );
}
function Policy({ path, data }: { path: string; data: Row }) {
  return (
    <div className="wrap pg narrow">
      <h1>{path === "syarat" ? "Syarat penggunaan." : "Kebijakan privasi."}</h1>
      <div className="banner warn section-title">
        {data.policiesApproved
          ? "Ringkasan ketentuan operasional. Hubungi pengelola untuk dokumen kebijakan yang berlaku."
          : "Draf operasional — perlu persetujuan pemilik dan identitas badan usaha sebelum pendaftaran publik dibuka."}
      </div>
      <div className="card">
        <h2>
          {path === "syarat" ? "Penggunaan platform" : "Data yang digunakan"}
        </h2>
        <p>
          {path === "syarat"
            ? "Peserta bertanggung jawab atas kepemilikan akun, keaslian views, hak atas materi, dan kepatuhan terhadap brief serta kebijakan platform. Konten promosi harus diungkapkan sesuai ketentuan platform."
            : "Platform menyimpan identitas akun, akun sosial, posting, bukti views, rekening pencairan terenkripsi, dan riwayat transaksi untuk menjalankan kampanye dan pembayaran."}
        </p>
        <h2>Reward dan pencairan</h2>
        <p>
          Tarif mengikuti versi saat mengambil slot. Posting disetujui tidak
          otomatis menjadikan saldo tersedia. Pengukuran, penilaian, masa
          keberatan, dan masa tunggu saldo mengikuti detail kampanye.
        </p>
        <h2>Permintaan & dukungan</h2>
        <p>
          Keberatan penilaian diajukan melalui Pekerjaan dalam 48 jam setelah
          penilaian. Permintaan terkait data pribadi, retensi, dan penutupan
          akun ditangani pengelola melalui kontak dukungan.
        </p>
        <Link href="/bantuan">Buka pusat bantuan ↗</Link>
      </div>
    </div>
  );
}
export function Experience({
  path,
  data,
  token = "",
}: {
  path: string;
  data: Row;
  token?: string;
}) {
  const [theme, setTheme] = useState("auto");
  const isApp =
    path.startsWith("app") ||
    path.startsWith("ops") ||
    path.startsWith("finance");
  const u = data.user;
  const nav = isApp
    ? [
        ["/app", "home", "Ringkasan"],
        ["/app/kampanye", "campaign", "Kampanye"],
        ["/app/pekerjaan", "work", "Pekerjaan"],
        ["/app/pendapatan", "wallet", "Reward"],
        ["/app/profil", "user", "Profil"],
      ]
    : [
        ["/", "home", "Beranda"],
        ["/kampanye", "campaign", "Kampanye"],
        ["/#cara-kerja", "work", "Cara kerja"],
        ["/bantuan", "user", "Bantuan"],
      ];
  const titleError =
    path === "forbidden"
      ? "Akses belum tersedia."
      : path === "unavailable"
        ? "Layanan belum terhubung."
        : "Halaman tidak ditemukan.";
  return (
    <div className={isApp ? "app-shell" : "public-shell"}>
      <a className="skip-link" href="#main">
        Langsung ke konten
      </a>
      <header className="top">
        <div className="wrap">
          <Link
            href={isApp ? "/app" : "/"}
            className="logo"
            aria-label="Sparksviu beranda"
          >
            <i />
            sparksviu
          </Link>
          <nav className="nav" aria-label="Navigasi utama">
            {nav.map(([href, , label]) => (
              <Link
                href={href}
                key={href}
                className={`/${path}` === href ? "is-active" : ""}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            className="theme-btn"
            aria-label={`Tema ${theme}; ubah tema`}
            onClick={() => {
              const next =
                theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
              setTheme(next);
              if (next === "auto")
                document.documentElement.removeAttribute("data-theme");
              else document.documentElement.dataset.theme = next;
            }}
          >
            <Icon name="sun" />
          </button>
          {u ? (
            <Link
              className="btn btn-hot"
              href={isApp ? "/app/notifikasi" : "/app"}
            >
              {isApp ? <Icon name="bell" /> : "Ruang kreator"}
            </Link>
          ) : (
            <Link className="btn btn-hot" href="/masuk">
              Masuk <Icon name="arrow" />
            </Link>
          )}
        </div>
      </header>
      {isApp && u && (
        <div className="staff-bar wrap">
          <span className="muted">{u.name}</span>
          <Link href="/app/payout">Pencairan</Link>
          {["ops", "reviewer", "superadmin"].includes(u.role) && (
            <Link href="/ops">Operasional</Link>
          )}
          {["finance", "superadmin"].includes(u.role) && (
            <Link href="/finance">Finance</Link>
          )}
        </div>
      )}
      <main id="main">
        {data.uatMode&&<div className="wrap"><div className="banner warn" role="note"><b>SIMULASI UAT</b> — akun, kampanye, saldo, dan bukti adalah data latihan. Jangan mengirim uang atau menggunakan rekening nyata. <Link href="/panduan">Buka panduan penggunaan</Link></div></div>}
        {["unavailable", "404", "forbidden"].includes(path) ? (
          <div className="wrap pg">
            <h1>{titleError}</h1>
            {path === "forbidden" && (
              <Link className="btn btn-hot" href="/app/profil">
                Buka profil
              </Link>
            )}
            <p>
              {path === "forbidden"
                ? data.accessDenied
                : path === "unavailable"
                  ? "Periksa konfigurasi database, jalankan migrasi, lalu muat kembali."
                  : "Periksa alamat atau kembali ke beranda."}
            </p>
            <Link href="/" className="btn">
              Kembali ke beranda
            </Link>
          </div>
        ) : !path ? (
          <Home data={data} />
        ) : path === "kampanye" ? (
          <div className="wrap pg">
            <p className="eyebrow">Pilih film. Bikin karya.</p>
            <h1>
              Kampanye
              <br />
              buat feed-mu.
            </h1>
            <CampaignList items={data.campaigns || []} />
          </div>
        ) : path.startsWith("kampanye/") ? (
          <Detail
            c={data.campaigns.find((c: Row) => c.slug === path.split("/")[1])}
            user={u}
          />
        ) : [
            "masuk",
            "daftar",
            "lupa-password",
            "reset",
            "verifikasi",
          ].includes(path) ? (
          <Auth path={path} data={data} token={token} />
        ) : path === "bantuan" ? (
          <Help data={data} />
        ) : ["syarat", "kebijakan"].includes(path) ? (
          <Policy path={path} data={data} />
        ) : path.startsWith("app") ? (
          <Participant path={path} data={data} />
        ) : path.startsWith("ops") ? (
          <Operations path={path} data={data} />
        ) : path === "finance" ? (
          <Finance data={data} />
        ) : null}
      </main>
      {isApp && (
        <nav className="mobile-nav" aria-label="Navigasi kreator">
          {nav.map(([href, icon, label]) => (
            <Link
              href={href}
              key={href}
              className={`/${path}` === href ? "is-active" : ""}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
      <footer>
        <div className="wrap">
          <span>
            © {new Date().getFullYear()} Sparksviu · Feed Kreator Film
          </span>
          <nav aria-label="Informasi">
            <Link href="/bantuan">Bantuan</Link>
            <Link href="/panduan">Panduan penggunaan</Link>
            <Link href="/syarat">Syarat</Link>
            <Link href="/kebijakan">Privasi</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
