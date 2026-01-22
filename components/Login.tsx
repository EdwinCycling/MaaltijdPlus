"use client";

import { useAuth } from "@/context/AuthContext";
import Image from "next/image";

export default function Login() {
  const { signInWithGoogle, loading } = useAuth();

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 hover:scale-105"
        style={{ backgroundImage: "url('/intro.jpg')" }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
      </div>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        <div className="hero-section glass max-w-4xl w-full p-8 md:p-16 rounded-[2.5rem] shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <h1 className="hero-title text-4xl md:text-6xl font-black mb-6 text-white leading-tight">
            Gezond eten begint hier
          </h1>
          <p className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed">
            Je persoonlijke AI-maaltijdtracker. Houd bij wat je eet, krijg direct voedingsadvies en bewaar je favoriete recepten. Alles in één simpele app.
          </p>
          
          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="group relative bg-white text-slate-900 py-5 px-10 rounded-2xl hover:bg-slate-100 transition-all flex items-center justify-center gap-4 font-bold text-lg shadow-xl active:scale-[0.98] disabled:opacity-50 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            {loading ? (
              <div className="animate-spin h-6 w-6 border-3 border-slate-300 border-t-blue-600 rounded-full" />
            ) : (
              <Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width={24} height={24} />
            )}
            {loading ? "Inloggen..." : "Start met Google"}
          </button>

          {/* Color Blocks */}
          <div className="color-blocks">
            <div className="color-block block-1 flex items-center justify-center text-white font-bold">Tracker</div>
            <div className="color-block block-2 flex items-center justify-center text-slate-900 font-bold">AI Advies</div>
            <div className="color-block block-3 flex items-center justify-center text-white font-bold">Recepten</div>
            <div className="color-block block-4 flex items-center justify-center text-white font-bold">Gezondheid</div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 p-6 text-center text-white/60 text-sm">
        <p>© 2026 MaaltijdPlus • Jouw gezondheid, onze passie • v 1.260122.1</p>
      </footer>
    </div>
  );
}
