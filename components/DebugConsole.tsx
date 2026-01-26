"use client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";

interface LogEntry {
  type: "log" | "error" | "warn";
  message: string;
  timestamp: string;
}

const STORAGE_KEY = "maaltijd_debug_logs";

export default function DebugConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load existing logs from session storage
    const savedLogs = sessionStorage.getItem(STORAGE_KEY);
    if (savedLogs) {
      try {
        setLogs(JSON.parse(savedLogs));
      } catch (e) {
        console.error("Failed to parse saved logs", e);
      }
    }

    // Intercept console
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const addLog = (type: LogEntry["type"], args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)))
        .join(" ");
      
      const newEntry: LogEntry = {
        type,
        message,
        timestamp: new Date().toLocaleTimeString(),
      };

      setLogs((prev) => {
        const updated = [...prev, newEntry].slice(-100); // Keep last 100 logs
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    };

    console.log = (...args) => {
      originalLog(...args);
      addLog("log", args);
    };
    console.error = (...args) => {
      originalError(...args);
      addLog("error", args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      addLog("warn", args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, logs]);

  const copyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Logs gekopieerd naar klembord");
  };

  const clearLogs = () => {
    setLogs([]);
    sessionStorage.removeItem(STORAGE_KEY);
    toast.success("Logs gewist");
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] bg-gray-800 text-white p-2 rounded-full opacity-50 hover:opacity-100 text-xs shadow-lg border border-gray-600"
        title="Open Debug Console"
      >
        🛠️
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black bg-opacity-90 flex flex-col font-mono text-[10px] md:text-xs">
      <div className="flex items-center justify-between p-2 border-b border-gray-700 bg-gray-900">
        <span className="text-gray-400 font-bold">DEBUG CONSOLE</span>
        <div className="flex gap-2">
          <button
            onClick={copyLogs}
            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
          >
            Copy
          </button>
          <button
            onClick={clearLogs}
            className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
          >
            Clear
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded"
          >
            Close
          </button>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-1"
      >
        {logs.length === 0 && (
          <div className="text-gray-600 italic">Geen logs beschikbaar...</div>
        )}
        {logs.map((log, i) => (
          <div 
            key={i} 
            className={`whitespace-pre-wrap break-words border-l-2 pl-2 ${
              log.type === "error" ? "text-red-400 border-red-500" :
              log.type === "warn" ? "text-yellow-400 border-yellow-500" :
              "text-green-400 border-green-500"
            }`}
          >
            <span className="text-gray-500 text-[8px] mr-1">[{log.timestamp}]</span>
            {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}
