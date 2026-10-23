import type { Metadata } from "next";
import "../../public/fonts/fonts.css";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Sparksviu — Feed Kreator Film",
    template: "%s | Sparksviu",
  },
  description:
    "Temukan kampanye film, kirim karya, dan pantau reward kreator dalam satu tempat.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
