"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function Install() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [dismissed, setDismissed] = useState(true);
  const pathname = usePathname();
  useEffect(() => {
    setDismissed(
      Number(localStorage.getItem("cc-install-later") || 0) > Date.now() ||
        window.matchMedia("(display-mode: standalone)").matches,
    );
    const listener = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const installed = () => setDismissed(true);
    window.addEventListener("beforeinstallprompt", listener);
    window.addEventListener("appinstalled", installed);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {});
    return () => {
      window.removeEventListener("beforeinstallprompt", listener);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (
    !prompt ||
    dismissed ||
    pathname.startsWith("/admin") ||
    ["/kitchen", "/pos", "/login"].includes(pathname)
  )
    return null;
  function later() {
    localStorage.setItem(
      "cc-install-later",
      String(Date.now() + 30 * 86400000),
    );
    setDismissed(true);
  }
  return (
    <aside className="install" aria-label="Install app">
      <div className="installIcon">C&C</div>
      <div>
        <b>Get Chics & Chips on your phone</b>
        <span>One-tap ordering, order history and Order Again.</span>
        <div className="rowActions">
          <button
            className="installBtn"
            onClick={async () => {
              await prompt.prompt();
              const choice = await prompt.userChoice;
              setPrompt(null);
              if (choice.outcome !== "accepted") later();
            }}
          >
            Install
          </button>
          <button onClick={later}>Maybe later</button>
        </div>
      </div>
    </aside>
  );
}
