"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import ConfirmModal from "./ConfirmModal";

interface Meal {
  id: string;
  userId: string;
  userEmail: string;
  imageUrl: string;
  title: string;
  description: string;
  ingredients?: string;
  recipe?: string;
  date: string;
  healthScore?: number;
  createdAt: any;
}

interface MealModalProps {
  meal: Meal;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate?: (updatedMeal: Meal) => void;
}

export default function MealModal({ meal, onClose, onDelete, onUpdate }: MealModalProps) {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDivElement>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(meal.title);
  const [editDescription, setEditDescription] = useState(meal.description);
  const [editIngredients, setEditIngredients] = useState(meal.ingredients || "");
  const [editRecipe, setEditRecipe] = useState(meal.recipe || "");
  const [editDate, setEditDate] = useState(meal.date);
  const [editHealthScore, setEditHealthScore] = useState<number | "">(meal.healthScore || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // Prevent scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleUpdate = async () => {
    if (!editTitle) {
      toast.error("Titel is verplicht");
      return;
    }
    
    setIsUpdating(true);
    try {
      const mealRef = doc(db, "meals", meal.id);
      const updatedData = {
        title: editTitle,
        description: editDescription,
        ingredients: editIngredients,
        recipe: editRecipe,
        date: editDate,
        healthScore: editHealthScore === "" ? null : Number(editHealthScore),
      };
      
      await updateDoc(mealRef, updatedData);
      
      if (onUpdate) {
        onUpdate({
          ...meal,
          ...updatedData,
          healthScore: editHealthScore === "" ? undefined : Number(editHealthScore),
        });
      }
      
      setIsEditing(false);
      toast.success("Maaltijd bijgewerkt!");
    } catch (error) {
      console.error(error);
      toast.error("Bijwerken mislukt");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopy = () => {
    const text = `🍴 ${meal.title}\n\n📝 Beschrijving:\n${meal.description}\n\n🥕 Ingrediënten:\n${meal.ingredients || "Geen ingrediënten opgegeven"}\n\n👨‍🍳 Bereiding:\n${meal.recipe || "Geen bereidingswijze opgegeven"}\n\n📅 Datum: ${new Date(meal.date).toLocaleDateString('nl-NL')}\n⭐ Gezondheidsscore: ${meal.healthScore || "N/A"}`;
    navigator.clipboard.writeText(text);
    toast.success("Tekst gekopieerd naar klembord");
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: meal.title,
          text: `Check deze maaltijd: ${meal.title}`,
          url: window.location.href,
        });
      } catch (err) {
        console.error("Share failed", err);
      }
    } else {
      handleCopy();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    // For now, we use window.print() but we can style it better
    window.print();
  };

  const handleCopyPicture = async () => {
    try {
      // Use proxy to avoid CORS issues
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(meal.imageUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Proxy fetch failed");
      const blob = await response.blob();
      
      // Clipboard API needs PNG. If it's not PNG, we need to convert it.
      // Most browsers require image/png for ClipboardItem.
      let finalBlob = blob;
      
      if (blob.type !== 'image/png') {
        const img = new (window as any).Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = URL.createObjectURL(blob);
        });
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        
        finalBlob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });
        URL.revokeObjectURL(img.src);
      }

      const data = [new ClipboardItem({ [finalBlob.type]: finalBlob })];
      await navigator.clipboard.write(data);
      toast.success("Foto gekopieerd naar klembord");
    } catch (err) {
      console.error(err);
      toast.error("Foto kopiëren mislukt. Probeer het later opnieuw.");
    }
  };

  const handleDelete = async () => {
    setIsUpdating(true);
    try {
      await deleteDoc(doc(db, "meals", meal.id));
      toast.success("Maaltijd verwijderd");
      onDelete(meal.id);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Verwijderen mislukt");
    } finally {
      setIsUpdating(false);
      setShowDeleteConfirm(false);
    }
  };

  const isOwner = user && user.uid === meal.userId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 print:p-0">
      {/* Full Screen Image Overlay */}
      {isFullScreen && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-in fade-in duration-300">
          <button 
            onClick={() => setIsFullScreen(false)}
            className="absolute top-6 right-6 z-[110] bg-white/20 hover:bg-white/30 text-white p-3 rounded-full backdrop-blur-md transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative w-full h-full p-4 sm:p-12">
            <Image 
              src={meal.imageUrl} 
              alt={meal.title} 
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal 
        isOpen={showDeleteConfirm}
        title="Maaltijd verwijderen?"
        message="Weet je zeker dat je deze maaltijd wilt verwijderen? Dit kan niet ongedaan worden gemaakt."
        confirmText="Verwijderen"
        cancelText="Annuleren"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        type="danger"
      />

      {/* Blur Background */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity print:hidden"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div 
        ref={modalRef}
        className="relative bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl flex flex-col print:shadow-none print:max-w-none print:max-h-none print:overflow-visible print:bg-white print:text-black print-only"
      >
        {/* Header Image */}
        <div className="relative h-64 sm:h-80 w-full shrink-0 print:h-96 group">
          <Image 
            src={meal.imageUrl} 
            alt={meal.title} 
            fill
            className="object-cover print:relative print:block"
            priority
            unoptimized={true} // Helps with printing sometimes
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent print:hidden"></div>
          
          <div className="absolute top-4 right-4 flex gap-2 print:hidden">
            <button 
              onClick={() => setIsFullScreen(true)}
              className="bg-black/40 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-md transition-all flex items-center gap-2 px-3"
              title="Volledig scherm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span className="text-xs font-bold hidden sm:inline">Volledig scherm</span>
            </button>
            <button 
              onClick={onClose}
              className="bg-black/40 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-md transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="absolute bottom-0 left-0 p-6 sm:p-8 w-full print:relative print:p-0 print:mt-4 print:text-black">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2 drop-shadow-md print:text-black print:drop-shadow-none">
              {meal.title}
            </h2>
            <div className="flex items-center gap-3 text-white/90 text-sm font-medium print:text-black">
              <span className="bg-blue-600 px-2 py-0.5 rounded text-xs uppercase tracking-wider print:border print:border-black print:bg-transparent">
                {meal.userEmail.split('@')[0]}
              </span>
              <span>•</span>
              <span>{new Date(meal.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              {meal.healthScore && (
                 <span className={`px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold text-black ${
                  meal.healthScore >= 7 ? 'bg-green-400' : 
                  meal.healthScore >= 4 ? 'bg-yellow-400' : 
                  'bg-red-400'
                } print:border print:border-black print:bg-transparent`}>
                  Score: {meal.healthScore}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-8 flex-1 print:p-0 print:mt-8 print:block">
          {isEditing ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <label className="block text-sm font-bold mb-2">Titel</label>
                <input 
                  type="text" 
                  value={editTitle} 
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Datum</label>
                <input 
                  type="date" 
                  value={editDate} 
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Beschrijving</label>
                <textarea 
                  value={editDescription} 
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold mb-2">🥕 Ingrediënten</label>
                  <textarea 
                    value={editIngredients} 
                    onChange={(e) => setEditIngredients(e.target.value)}
                    rows={6}
                    placeholder="Eén ingrediënt per regel"
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">👨‍🍳 Bereiding</label>
                  <textarea 
                    value={editRecipe} 
                    onChange={(e) => setEditRecipe(e.target.value)}
                    rows={6}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-bold">Gezondheidsscore: <span className={`ml-1 px-2 py-0.5 rounded text-xs font-bold text-black ${
                    Number(editHealthScore) >= 7 ? 'bg-green-400' : 
                    Number(editHealthScore) >= 4 ? 'bg-yellow-400' : 
                    'bg-red-400'
                  }`}>{editHealthScore || 5}</span></label>
                </div>
                <div className="px-1">
                  <input 
                    type="range" 
                    min="1" 
                    max="10"
                    step="1"
                    value={editHealthScore || 5} 
                    onChange={(e) => setEditHealthScore(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span className="flex flex-col items-start">
                      <span>Slecht</span>
                      <span>(1)</span>
                    </span>
                    <span className="flex flex-col items-center">
                      <span>Gemiddeld</span>
                      <span>(5)</span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span>Gezond</span>
                      <span>(10)</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {meal.description && (
                <div className="print:break-inside-avoid">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                    📝 Beschrijving
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {meal.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:block print:space-y-8">
                {meal.ingredients && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl print:bg-transparent print:p-0 print:border-t print:pt-4 print:break-inside-avoid">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      🥕 Ingrediënten
                    </h3>
                    <ul className="space-y-2 text-slate-600 dark:text-slate-300 text-sm">
                      {meal.ingredients.split('\n').map((line, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1 print:text-black">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {meal.recipe && (
                  <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-900/20 print:bg-transparent print:p-0 print:border-t print:pt-4 print:break-inside-avoid">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      👨‍🍳 Bereiding
                    </h3>
                    <div className="space-y-4 text-slate-600 dark:text-slate-300 text-sm whitespace-pre-wrap">
                      {meal.recipe}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 print:hidden">
          {isEditing ? (
            <div className="flex flex-wrap gap-3 justify-end">
              <button 
                onClick={() => setIsEditing(false)}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                disabled={isUpdating}
              >
                Annuleren
              </button>
              <button 
                onClick={handleUpdate}
                disabled={isUpdating}
                className="flex-[2] sm:flex-none px-6 py-2 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all flex items-center justify-center gap-2"
              >
                {isUpdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Opslaan...
                  </>
                ) : (
                  "✅ Wijzigingen opslaan"
                )}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 justify-end">
              <button 
                onClick={onClose}
                className="col-span-2 sm:flex-none px-4 py-3 sm:py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700"
              >
                ✖ Sluiten
              </button>
              
              <button 
                onClick={handleCopy}
                className="px-4 py-3 sm:py-2 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all text-sm"
              >
                📋 Copy Tekst
              </button>

              <button 
                onClick={handleCopyPicture}
                className="px-4 py-3 sm:py-2 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all text-sm"
              >
                🖼️ Copy Foto
              </button>

              <button 
                onClick={handleDownloadPDF}
                className="col-span-2 sm:flex-none px-4 py-3 sm:py-2 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
              >
                📥 Download PDF
              </button>

              {isOwner && (
                <>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-3 sm:py-2 rounded-xl font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-slate-200 dark:border-slate-800 sm:border-transparent sm:hover:border-blue-200 transition-all text-sm"
                  >
                    ✏️ Wijzigen
                  </button>
                  
                  <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-3 sm:py-2 rounded-xl font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-200 dark:border-slate-800 sm:border-transparent sm:hover:border-red-200 transition-all text-sm"
                  >
                    🗑️ Verwijderen
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
