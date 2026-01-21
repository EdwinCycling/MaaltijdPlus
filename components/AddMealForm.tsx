"use client";

import { useState, useRef, ChangeEvent, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { analyzeMeal } from "@/app/actions";
import toast from "react-hot-toast";

interface AIResult {
  isFood: boolean;
  title?: string;
  details?: string;
  ingredients?: string[];
  recipe?: string;
  healthScore?: number;
}

export default function AddMealForm({ onMealAdded, onCancel }: { onMealAdded: () => void; onCancel?: () => void }) {
  const { user } = useAuth();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [recipe, setRecipe] = useState("");
  const [healthScore, setHealthScore] = useState<number>(5);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new (window as any).Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas to Blob failed'));
          }
        }, 'image/jpeg', 0.8); // 80% quality JPEG
        URL.revokeObjectURL(img.src);
      };
      img.onerror = (err) => reject(err);
    });
  };

  // Focus on dropzone when component mounts
  useEffect(() => {
    if (dropzoneRef.current) {
      dropzoneRef.current.focus();
    }
  }, []);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerAnalyze = async () => {
    if (!imageFile || !imagePreview) return;
    setIsAnalyzing(true);
    setAiResult(null);
    try {
      const base64Data = imagePreview.split(",")[1];
      const mimeType = imageFile.type;
      const result = await analyzeMeal(base64Data, mimeType);
      
      if (!result.isFood) {
        toast.error("AI denkt dat dit geen maaltijd is.");
      } else {
        setAiResult(result);
        if (result.title) setTitle(result.title);
        if (result.details) setDescription(result.details);
        
        // Populate new fields
        if (result.ingredients && Array.isArray(result.ingredients)) {
          setIngredients(result.ingredients.join("\n"));
        }
        if (result.recipe) setRecipe(result.recipe);
        if (result.healthScore) setHealthScore(result.healthScore);
        
        toast.success("Analyse voltooid en velden ingevuld!");
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Analyse mislukt";
      toast.error(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !imageFile) {
      toast.error("Selecteer eerst een foto");
      return;
    }

    // Storage Limit Check (100 photos/month)
    try {
      // Create a query for meals by this user in the current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const q = query(
        collection(db, "meals"),
        where("userId", "==", user.uid),
        where("createdAt", ">=", startOfMonth)
      );
      
      const snapshot = await getDocs(q);
      const monthlyUploads = snapshot.size;

      if (monthlyUploads >= 100) {
        toast.error("Opslaglimiet bereikt! Je kunt maximaal 100 maaltijden per maand opslaan.");
        return;
      }
    } catch (limitError) {
      console.error("Error checking limits:", limitError);
      // Fail open (allow upload if check fails) or handle accordingly
    }

    // Basic sanitization and validation
    const cleanTitle = title.trim().substring(0, 100);
    const cleanDescription = description.trim().substring(0, 500);
    const cleanIngredients = ingredients.trim().substring(0, 1000);
    const cleanRecipe = recipe.trim().substring(0, 2000);

    if (!cleanTitle) {
      toast.error("Titel is verplicht");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const compressedBlob = await compressImage(imageFile);
      const storageRef = ref(storage, `meals/${user.uid}/${Date.now()}_${imageFile.name.split('.')[0].replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`);
      await uploadBytes(storageRef, compressedBlob);
      const imageUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "meals"), {
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0],
        userEmail: user.email,
        imageUrl,
        title: cleanTitle,
        description: cleanDescription,
        ingredients: cleanIngredients,
        recipe: cleanRecipe,
        healthScore: Number(healthScore),
        date,
        createdAt: serverTimestamp(),
      });

      toast.success("Maaltijd opgeslagen!");
      setImageFile(null);
      setImagePreview(null);
      setTitle("");
      setDescription("");
      setIngredients("");
      setRecipe("");
      setHealthScore("");
      setAiResult(null);
      onMealAdded();
    } catch (error) {
      console.error(error);
      toast.error("Opslaan mislukt");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card w-full mb-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Left Column: Image & Analysis */}
        <div className="w-full md:w-1/3 flex flex-col gap-4">
          <h3 className="text-xl font-bold flex items-center gap-2 md:hidden">
            <span className="text-blue-500">📸</span> Nieuwe Maaltijd
          </h3>
          
          <div 
            ref={dropzoneRef}
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`relative aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500
              ${imagePreview ? 'border-transparent' : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 bg-slate-50 dark:bg-slate-900/50'}`}
          >
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                  <p className="text-white font-medium">Klik om te wijzigen</p>
                </div>
              </>
            ) : (
              <div className="text-center p-4">
                <div className="text-5xl mb-3">📷</div>
                <p className="font-medium text-lg">Foto toevoegen</p>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Klik of sleep</p>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageChange} 
              accept="image/*" 
              className="hidden" 
            />
          </div>

          {imagePreview && (
            <button
              type="button"
              onClick={triggerAnalyze}
              disabled={isAnalyzing}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-blue-900/20 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isAnalyzing ? (
                <><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> AI Analyseert...</>
              ) : (
                <><span className="text-lg">✨</span> AI Analyse</>
              )}
            </button>
          )}

          {/* Helper info */}
          <div className="text-xs text-slate-400 dark:text-slate-500 px-2">
            <p>Tips:</p>
            <ul className="list-disc ml-4 space-y-1 mt-1">
              <li>Upload een duidelijke foto</li>
              <li>Laat AI de velden invullen</li>
              <li>Controleer en pas aan waar nodig</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Form Fields */}
        <div className="w-full md:w-2/3 space-y-5">
          <div className="hidden md:flex items-center justify-between mb-2">
            <h3 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-blue-500">📸</span> Nieuwe Maaltijd
            </h3>
            {aiResult && (
               <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium animate-in fade-in">
                 ✨ AI gegevens geladen
               </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Titel <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  placeholder="Bijv: Boerenkool met worst"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.substring(0, 100))}
                  className="input-field mt-1"
                  required
                  maxLength={100}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Datum <span className="text-red-500">*</span></label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input-field mt-1"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Beschrijving</label>
              <textarea 
                placeholder="Korte omschrijving van het gerecht..."
                value={description}
                onChange={(e) => setDescription(e.target.value.substring(0, 500))}
                className="input-field mt-1 min-h-[80px]"
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Ingrediënten</label>
                <textarea 
                  placeholder="- Aardappelen&#10;- Boerenkool&#10;- Rookworst"
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value.substring(0, 1000))}
                  className="input-field mt-1 min-h-[120px] font-mono text-sm"
                  rows={5}
                  maxLength={1000}
                />
              </div>
              
              <div>
                 <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Recept / Bereiding</label>
                <textarea 
                  placeholder="1. Kook de aardappelen...&#10;2. Bak de spekjes..."
                  value={recipe}
                  onChange={(e) => setRecipe(e.target.value.substring(0, 2000))}
                  className="input-field mt-1 min-h-[120px]"
                  rows={5}
                  maxLength={2000}
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                    🥗 Gezondheidsscore: <span className={`px-2 py-0.5 rounded text-xs font-bold text-black ${
                      Number(healthScore) >= 7 ? 'bg-green-400' : 
                      Number(healthScore) >= 4 ? 'bg-yellow-400' : 
                      'bg-red-400'
                    }`}>{healthScore}</span>
                  </label>
                </div>
                <div className="px-1">
                  <input 
                    type="range" 
                    min="1" 
                    max="10"
                    step="1"
                    value={healthScore} 
                    onChange={(e) => setHealthScore(Number(e.target.value))}
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
              
              <div className="flex-1 flex justify-end items-end h-full">
                <div className="flex gap-3 w-full">
                  {onCancel && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="flex-1 py-4 px-6 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                    >
                      Annuleren
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting || !imageFile}
                    className="flex-[2] py-4 px-6 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-blue-900/20 hover:bg-blue-700 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <><div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> Opslaan...</>
                    ) : (
                      "Maaltijd Opslaan"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
