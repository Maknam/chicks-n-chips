import "./globals.css";
import "./system.css";
import Install from "../components/install";

export const viewport = {
  themeColor: "#17130f",
  width: "device-width",
  initialScale: 1,
};

export const metadata = {
  title: "Chics & Chips | Pent Hall",
  description: "Skip the queue. Order ahead from Chics & Chips at Pent Hall.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chics & Chips",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Install />
      </body>
    </html>
  );
}
