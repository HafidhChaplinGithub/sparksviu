import { db, tx } from "../src/lib/db";
import { passwordHash } from "../src/lib/auth";
if (
  process.env.NODE_ENV === "production" ||
  process.env.ALLOW_DEMO_SEED !== "true"
)
  throw Error("Demo seed hanya untuk development dengan ALLOW_DEMO_SEED=true.");
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 14)
  throw Error("Set DEMO_PASSWORD minimal 14 karakter.");
await tx(async (c) => {
  const r = await c.query(
    "INSERT INTO users(email,name,password_hash,role,email_verified_at) VALUES('kreator@example.test','Kreator Demo',$1,'participant',now()) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id",
    [passwordHash(password)],
  );
  await c.query(
    "INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [r.rows[0].id],
  );
  await c.query(
    "INSERT INTO social_accounts(user_id,platform,handle) VALUES($1,'tiktok','@kreator_demo') ON CONFLICT DO NOTHING",
    [r.rows[0].id],
  );
  const staff = await c.query(
    "INSERT INTO users(email,name,password_hash,role,email_verified_at) VALUES('admin@example.test','Admin Demo',$1,'superadmin',now()) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id",
    [passwordHash(password)],
  );
  const items = [
    {
      title: "Rumah Tanpa Jendela",
      slug: "demo-rumah-tanpa-jendela",
      studio: "Kaca Pictures (Demo)",
      genre: "Horor",
      color: "#832139",
      rules: {
        model: "CPM_LINEAR",
        rate: 2000,
        minViews: 5000,
        cap: 100000,
        tiers: [],
      },
    },
    {
      title: "Sepatu Ayah",
      slug: "demo-sepatu-ayah",
      studio: "Layar Timur (Demo)",
      genre: "Drama keluarga",
      color: "#986326",
      rules: {
        model: "VIEW_TIER_HIGHEST",
        rate: 0,
        minViews: 0,
        cap: 250000,
        tiers: [
          { views: 10000, amount: 25000 },
          { views: 50000, amount: 100000 },
          { views: 100000, amount: 250000 },
        ],
      },
    },
    {
      title: "Ojol Cinta Kilat",
      slug: "demo-ojol-cinta-kilat",
      studio: "Sinema Gembira (Demo)",
      genre: "Komedi romantis",
      color: "#177965",
      rules: {
        model: "FIXED_APPROVED",
        rate: 20000,
        minViews: 0,
        cap: 20000,
        tiers: [],
      },
    },
    {
      title: "Lintang & Laut",
      slug: "demo-lintang-laut",
      studio: "Kaca Pictures (Demo)",
      genre: "Petualangan",
      color: "#266c9c",
      rules: {
        model: "CPM_LINEAR",
        rate: 1500,
        minViews: 3000,
        cap: 75000,
        tiers: [],
      },
    },
  ];
  for (const v of items) {
    if (
      (await c.query("SELECT 1 FROM campaigns WHERE slug=$1", [v.slug]))
        .rowCount
    )
      continue;
    const f = await c.query(
      "INSERT INTO films(title,studio,genre) VALUES($1,$2,$3) RETURNING id",
      [v.title, v.studio, v.genre],
    );
    const campaign = await c.query(
      "INSERT INTO campaigns(film_id,slug,title,brief,phase,platforms,status,quota,budget,upload_deadline,cutoff_at,color,created_by) VALUES($1,$2,$3,$4,'Trailer',ARRAY['tiktok','instagram'],'open',120,30000000,now()+interval '7 days',now()+interval '14 days',$5,$6) RETURNING id",
      [
        f.rows[0].id,
        v.slug,
        v.title,
        "DATA DEMO — Film, studio, dan reward pada kampanye ini adalah contoh, bukan tawaran pekerjaan. Buat video reaksi orisinal 15–45 detik. Ikuti panduan promosi berbayar platform dan hindari spoiler. Jangan menggunakan materi berhak cipta tanpa izin.",
        v.color,
        staff.rows[0].id,
      ],
    );
    const rule = await c.query(
      "INSERT INTO campaign_rules(campaign_id,version,config) VALUES($1,1,$2) RETURNING id",
      [campaign.rows[0].id, JSON.stringify(v.rules)],
    );
    await c.query("UPDATE campaigns SET current_rule_id=$2 WHERE id=$1", [
      campaign.rows[0].id,
      rule.rows[0].id,
    ]);
  }
});
console.log(
  "Demo dibuat. Akun kreator@example.test dan admin@example.test memakai DEMO_PASSWORD. Admin wajib mengaktifkan TOTP.",
);
await db.end();
