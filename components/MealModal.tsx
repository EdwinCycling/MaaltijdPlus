"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  shoppingList?: string;
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
  const [editShoppingList, setEditShoppingList] = useState(meal.shoppingList || "");
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
    document.body.classList.add("modal-open");
    return () => {
      document.body.style.overflow = "unset";
      document.body.classList.remove("modal-open");
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
        shoppingList: editShoppingList,
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
    const text = `🍴 ${meal.title}\n\n📝 Beschrijving:\n${meal.description}\n\n🥕 Ingrediënten:\n${meal.ingredients || "Geen ingrediënten opgegeven"}\n\n👨‍🍳 Bereiding:\n${meal.recipe || "Geen bereidingswijze opgegeven"}\n\n🛒 Boodschappenlijst (AH - 2 pers):\n${meal.shoppingList || "Geen boodschappenlijst opgegeven"}\n\n📅 Datum: ${new Date(meal.date).toLocaleDateString('nl-NL')}\n⭐ Gezondheidsscore: ${meal.healthScore || "N/A"}`;
    navigator.clipboard.writeText(text);
    toast.success("Tekst gekopieerd naar klembord");
  };

  const handleCopyShoppingList = () => {
    if (!meal.shoppingList) {
      toast.error("Geen boodschappenlijst beschikbaar");
      return;
    }
    const text = `🛒 Boodschappenlijst voor ${meal.title} (2 personen):\n\n${meal.shoppingList}`;
    navigator.clipboard.writeText(text);
    toast.success("Boodschappenlijst gekopieerd!");
  };

  const handleShare = async () => {
    const shareData = {
      title: meal.title,
      text: `🍴 Bekijk deze maaltijd: ${meal.title}\n\n${meal.description}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast.success("Gedeeld!");
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error("Share failed", err);
          handleCopy();
        }
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

  const handleCopySection = (title: string, content: string) => {
    navigator.clipboard.writeText(content);
    toast.success(`${title} gekopieerd naar klembord`);
  };

  const CopyButton = ({ title, content }: { title: string, content: string }) => (
    <button 
      onClick={() => handleCopySection(title, content)}
      className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 print:hidden"
      title={`${title} kopiëren`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
      </svg>
    </button>
  );

  const isOwner = user && user.uid === meal.userId;

  const modalContent = (
    <div className="fixed inset-0 z-50 meal-modal-container flex items-center justify-center p-4 sm:p-6 print:relative print:block print:p-0 print:z-0">
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
        className="relative bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl flex flex-col print:shadow-none print:max-w-none print:max-h-none print:overflow-visible print:bg-white print:text-black print:block print:static print-only"
      >
        {/* Header Image */}
        <div className="relative h-64 sm:h-80 w-full shrink-0 print:h-auto print:w-full print:block print:shrink group">
          <div className="relative w-full h-full print:h-64 print:overflow-hidden print:rounded-3xl">
            <Image 
              src={meal.imageUrl} 
              alt={meal.title} 
              fill
              className="object-cover print:relative print:block print:!h-full print:!w-full"
              priority
              unoptimized={true} // Helps with printing sometimes
            />
          </div>
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

          <div className="absolute bottom-0 left-0 p-6 sm:p-8 w-full print:static print:p-0 print:mt-4 print:text-black">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2 drop-shadow-md print:text-black print:drop-shadow-none">
              {meal.title}
            </h2>
            <div className="flex items-center gap-3 text-white/90 text-sm font-medium print:text-black print:mb-4">
              <span className="bg-blue-600 px-2 py-0.5 rounded text-xs uppercase tracking-wider print:border print:border-black print:bg-transparent">
                {meal.userEmail.split('@')[0]}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="opacity-60">📅</span> {meal.date}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-8 print:p-0 print:space-y-6">
          {/* Action Buttons - Print Hidden */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl font-bold transition-all"
              >
                <span>🖨️</span> Print / PDF
              </button>
              <button 
                onClick={handleCopyPicture}
                className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl font-bold transition-all"
              >
                <span>🖼️</span> Kopieer Foto
              </button>
              <button 
                onClick={() => {
                  const text = `${meal.title}\n\nBeschrijving: ${meal.description}\n\nIngrediënten:\n${meal.ingredients || "Geen"}\n\nRecept:\n${meal.recipe || "Geen"}`;
                  navigator.clipboard.writeText(text);
                  toast.success("Gekopieerd naar klembord!");
                }}
                className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl font-bold transition-all"
              >
                <span>📋</span> Kopieer Tekst
              </button>
              
              <button 
                onClick={handleShare}
                className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-xl font-bold transition-all"
              >
                <span>🔗</span> Deel
              </button>
              
              {/* Shopping List Copy Button */}
              {meal.shoppingList && (
                <button 
                  onClick={() => {
                    const text = `🛒 Boodschappenlijst voor ${meal.title} (2 personen):\n\n${meal.shoppingList}`;
                    navigator.clipboard.writeText(text);
                    toast.success("Boodschappenlijst gekopieerd!");
                  }}
                  className="flex items-center gap-2 bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-800 text-orange-700 dark:text-orange-300 px-4 py-2 rounded-xl font-bold transition-all"
                >
                  <span>🛒</span> Kopieer Lijst
                </button>
              )}
            </div>

            {isOwner && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-all"
                  title="Bewerken"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-all"
                  title="Verwijderen"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Edit Mode / View Mode */}
          {isEditing ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-500 dark:text-slate-400 ml-1">Titel</label>
                  <input 
                    type="text" 
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="input-field"
                    placeholder="Naam van het gerecht"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-500 dark:text-slate-400 ml-1">Datum</label>
                  <input 
                    type="date" 
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500 dark:text-slate-400 ml-1">Beschrijving</label>
                <textarea 
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="input-field min-h-[100px] py-3"
                  placeholder="Wat voor lekkers is dit?"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-500 dark:text-slate-400 ml-1">Ingrediënten</label>
                  <textarea 
                    value={editIngredients}
                    onChange={(e) => setEditIngredients(e.target.value)}
                    className="input-field min-h-[150px] py-3 font-mono text-sm"
                    placeholder="Lijst met ingrediënten..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-500 dark:text-slate-400 ml-1">Bereidingswijze</label>
                  <textarea 
                    value={editRecipe}
                    onChange={(e) => setEditRecipe(e.target.value)}
                    className="input-field min-h-[150px] py-3 font-mono text-sm"
                    placeholder="Stap-voor-stap instructies..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500 dark:text-slate-400 ml-1">Boodschappenlijst (AH, 2 pers)</label>
                <textarea 
                  value={editShoppingList}
                  onChange={(e) => setEditShoppingList(e.target.value)}
                  className="input-field min-h-[100px] py-3 font-mono text-sm"
                  placeholder="Groepeer per afdeling..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/20 disabled:opacity-50"
                >
                  {isUpdating ? "Bijwerken..." : "Wijzigingen opslaan"}
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 sm:space-y-10 animate-in fade-in duration-500 print:space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 print:block">
                {/* Left Column: Description & Ingredients */}
                <div className="space-y-10 print:space-y-4">
                  <section className="break-inside-avoid">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2 print:text-sm print:mb-1">
                      <span>📝</span> Beschrijving
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-lg print:text-xs">
                      {meal.description}
                    </p>
                  </section>

                  {meal.ingredients && (
                    <section className="break-inside-avoid">
                      <div className="flex items-center justify-between mb-4 print:mb-1">
                        <h3 className="text-xl font-bold flex items-center gap-2 print:text-sm">
                          <span>🥕</span> Ingrediënten
                        </h3>
                        <CopyButton title="Ingrediënten" content={meal.ingredients} />
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/50 print:p-0 print:bg-transparent print:border-none">
                        <pre className="whitespace-pre-wrap font-sans text-slate-600 dark:text-slate-300 leading-relaxed print:text-[10pt]">
                          {meal.ingredients}
                        </pre>
                      </div>
                    </section>
                  )}

                  {/* Recipe only on detail page if it exists and fits better here on mobile, but let's keep it below Ingredients on desktop */}
                  {meal.recipe && (
                    <section className="break-inside-avoid lg:hidden print:hidden">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                          <span>👨‍🍳</span> Bereidingswijze
                        </h3>
                        <CopyButton title="Bereidingswijze" content={meal.recipe} />
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/50">
                        <pre className="whitespace-pre-wrap font-sans text-slate-600 dark:text-slate-300 leading-relaxed">
                          {meal.recipe}
                        </pre>
                      </div>
                    </section>
                  )}
                </div>

                {/* Right Column: Health Score & Shopping List */}
                <div className="space-y-8 print:space-y-4">
                  {meal.healthScore && (
                    <section className="bg-blue-50/50 dark:bg-blue-900/10 p-6 sm:p-8 rounded-3xl border border-blue-100/50 dark:border-blue-800/30 break-inside-avoid print:p-0 print:bg-transparent print:border-none">
                      <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2 print:text-sm print:mb-0">
                        <span>⭐</span> Health Score: <span className="text-2xl print:text-sm font-black text-blue-600">{meal.healthScore}/10</span>
                      </h3>
                      <div className="mt-4 w-full bg-blue-200/50 dark:bg-blue-800/50 h-2.5 rounded-full overflow-hidden print:hidden">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-1000 shadow-[0_0_10px_rgba(37,99,235,0.3)]" 
                          style={{ width: `${meal.healthScore * 10}%` }}
                        ></div>
                      </div>
                    </section>
                  )}

                  {meal.shoppingList && (
                    <section className="bg-orange-50/50 dark:bg-orange-900/10 p-6 sm:p-8 rounded-3xl border border-orange-100/50 dark:border-orange-800/30 break-inside-avoid print:p-3 print:bg-slate-50 print:border print:border-slate-200 print:rounded-xl">
                      <div className="flex items-center justify-between mb-4 print:mb-1">
                        <h3 className="text-lg font-bold text-orange-900 dark:text-orange-100 flex items-center gap-2 print:text-sm">
                          <span>🛒</span> Boodschappen (AH, 2 pers)
                        </h3>
                        <CopyButton title="Boodschappenlijst" content={meal.shoppingList} />
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-orange-800/80 dark:text-orange-200/80 leading-relaxed text-sm print:text-[9pt]">
                        {meal.shoppingList}
                      </pre>
                    </section>
                  )}
                </div>
              </div>

              {/* Recipe Section (Full Width below the grid on Desktop) */}
              {meal.recipe && (
                <section className="break-inside-avoid hidden lg:block print:block print:mt-6">
                  <div className="flex items-center justify-between mb-4 print:mb-1">
                    <h3 className="text-xl font-bold flex items-center gap-2 print:text-sm">
                      <span>👨‍🍳</span> Bereidingswijze
                    </h3>
                    <CopyButton title="Bereidingswijze" content={meal.recipe} />
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-8 rounded-3xl border border-slate-100 dark:border-slate-800/50 print:p-0 print:bg-transparent print:border-none">
                    <pre className="whitespace-pre-wrap font-sans text-slate-600 dark:text-slate-300 leading-relaxed text-lg print:text-[10pt]">
                      {meal.recipe}
                    </pre>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
}
