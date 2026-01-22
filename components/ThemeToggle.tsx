"use client";

import { useTheme } from "@/context/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isClient = typeof window !== "undefined";

  if (!isClient) {
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
