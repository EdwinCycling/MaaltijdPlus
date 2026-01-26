"use client";

import { useState, useEffect } from "react";

const APP_VERSION = "1.260126.11";

export default function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);

  const checkVersion = async () => {
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.version && data.version !== APP_VERSION) {
          setShowUpdate(true);
        }
      }
    } catch (error) {
      console.error("Fout bij controleren van versie:", error);
    }
  };

  useEffect(() => {
    const handleFocus = () => {
      void checkVersion();
    };

    const timeoutId = window.setTimeout(() => {
      void checkVersion();
    }, 0);
    const interval = window.setInterval(checkVersion, 5 * 60 * 1000);

    window.addEventListener("focus", handleFocus);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm animate-in slide-in-from-bottom-10 duration-500">
      <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-2xl border border-blue-400 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚀</span>
          <div>
            <p className="font-bold text-sm">Nieuwe versie beschikbaar!</p>
            <p className="text-xs text-blue-100">Klik op update voor de nieuwste functies.</p>
          </div>
        </div>
        <button
          onClick={handleUpdate}
          className="bg-white text-blue-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-md active:scale-95"
        >
          Update
        </button>
      </div>
    </div>
  );
}
