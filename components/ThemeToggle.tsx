"use client";

import { useTheme } from "@/context/ThemeContext";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-[60px] h-[34px]" />;
  }

  return (
    <div className="theme-switch-wrapper">
      <label className="theme-switch" htmlFor="checkbox">
        <input 
          type="checkbox" 
          id="checkbox" 
          onChange={toggleTheme} 
          checked={theme === "dark"}
        />
        <div className="slider round"></div>
      </label>
      <span className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        {theme === "light" ? "Light" : "Dark"}
      </span>
    </div>
  );
}
