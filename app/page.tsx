"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import Login from "@/components/Login";
import AddMealForm from "@/components/AddMealForm";
import MealFeed from "@/components/MealFeed";
import ThemeToggle from "@/components/ThemeToggle";
import UpdateNotification from "@/components/UpdateNotification";

export const maxDuration = 25; // Verhoog timeout voor alle server acties op deze pagina

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [feedRefreshTrigger, setFeedRefreshTrigger] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isIOS] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
  });
  const [isStandalone] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(display-mode: standalone)").matches;
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      if (!("prompt" in event)) {
        return;
      }
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowInstallModal(true);
    }
  };

  const handleMealAdded = () => {
    setFeedRefreshTrigger(prev => prev + 1);
    setIsFormOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen pb-10 transition-colors duration-400" style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}>
      <div className="print:hidden">
        {/* Header */}
        <header className="bg-white/10 dark:bg-slate-900/10 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 transition-colors duration-400">
          <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-0">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🥗</span>
                <h1 className="text-xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  MaaltijdPlus
                </h1>
              </div>
              {/* Mobile-only toggle or spacing if needed, but flex-col handles the rest */}
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 w-full sm:w-auto border-t border-slate-200/50 dark:border-slate-800/50 pt-2 sm:pt-0 sm:border-0">
              <div className="flex items-center gap-2 sm:gap-4">
                {!isStandalone && (deferredPrompt || isIOS) && (
                  <button 
                    onClick={handleInstallClick}
                    className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-xl text-sm font-bold border border-blue-200 dark:border-blue-800 hover:scale-105 transition-all"
                  >
                    <span>📲</span> <span className="hidden sm:inline">Installeren</span>
                  </button>
                )}
                <span className="text-sm text-slate-500 dark:text-slate-400 hidden md:inline font-medium">
                  {user.email}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button 
                  onClick={logout}
                  className="flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 px-4 py-2 rounded-xl text-sm font-bold border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all"
                >
                  <span>🚪</span>
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-8">
          {/* Header with Title and Add Button */}
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="text-blue-500">🍱</span> Overzicht maaltijden
            </h2>
            <button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <span>{isFormOpen ? "✖ Sluiten" : "➕ Maaltijd toevoegen"}</span>
            </button>
          </div>

          {/* Top Section: Add Meal (Conditional) */}
          {isFormOpen && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-300">
              <AddMealForm onMealAdded={handleMealAdded} onCancel={() => setIsFormOpen(false)} />
            </div>
          )}

          {/* Bottom Section: Feed */}
          <div>
            <MealFeed refreshTrigger={feedRefreshTrigger} />
          </div>
        </div>
      </main>
      </div>

      {/* PWA Install Modal for iOS */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold">App Installeren</h3>
              <button onClick={() => setShowInstallModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-slate-600 dark:text-slate-400">
                Installeer MaaltijdPlus op je iPhone voor de beste ervaring:
              </p>
              
              <div className="flex items-start gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                <span className="text-2xl">1️⃣</span>
                <div>
                  <p className="font-bold">Tik op de deel-knop</p>
                  <p className="text-sm text-slate-500">Onderaan in de browser (vierkantje met pijl omhoog)</p>
                </div>
              </div>

              <div className="flex items-start gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                <span className="text-2xl">2️⃣</span>
                <div>
                  <p className="font-bold">Zet op beginscherm</p>
                  <p className="text-sm text-slate-500">Scroll naar beneden en tik op &apos;Zet op beginscherm&apos;</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowInstallModal(false)}
              className="w-full mt-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
            >
              Begrepen
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto py-8 text-center text-slate-400 dark:text-slate-500 text-sm border-t border-slate-100 dark:border-slate-800/50">
        <p>© 2026 MaaltijdPlus • Jouw gezondheid, onze passie • v 1.260126.3</p>
      </footer>

      <UpdateNotification />
    </div>
  );
}
