import { redirect, notFound } from "next/navigation";
import { pageData } from "@/lib/data";
import { Experience } from "@/components/experience";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path = [] } = await params;
  const route = path.join("/");
  const known = [
    "",
    "kampanye",
    "bantuan",
    "masuk",
    "daftar",
    "lupa-password",
    "reset",
    "verifikasi",
    "kebijakan",
    "syarat",
    "app",
    "app/kampanye",
    "app/pekerjaan",
    "app/pendapatan",
    "app/cairkan",
    "app/payout",
    "app/profil",
    "app/notifikasi",
    "ops",
    "ops/kampanye",
    "ops/review",
    "ops/sengketa",
    "ops/pengguna",
    "ops/audit",
    "finance",
  ];
  if (!known.includes(route) && !/^kampanye\/[a-z0-9-]+$/.test(route))
    notFound();
  let data;
  try {
    data = await pageData(route);
  } catch (error) {
    console.error("Page data unavailable", {
      type: error instanceof Error ? error.name : "unknown",
    });
    return <Experience path="unavailable" data={{}} />;
  }
  if ("requiresLogin" in data && data.requiresLogin) redirect("/masuk");
  if ("accessDenied" in data)
    return (
      <Experience path="forbidden" data={JSON.parse(JSON.stringify(data))} />
    );
  if (
    route.startsWith("kampanye/") &&
    !data.campaigns.some((c) => c.slug === route.split("/")[1])
  )
    notFound();
  const search = await searchParams;
  return (
    <Experience
      path={route}
      data={JSON.parse(JSON.stringify(data))}
      token={typeof search.token === "string" ? search.token : ""}
    />
  );
}
