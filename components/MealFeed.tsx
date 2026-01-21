"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, getDocs, Timestamp } from "firebase/firestore";
import Image from "next/image";
import MealModal from "./MealModal";

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
  createdAt: Timestamp;
}

type SortField = 'date' | 'user' | 'score';
type SortDirection = 'asc' | 'desc';

export default function MealFeed({ refreshTrigger }: { refreshTrigger: number }) {
  const { user } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<"all" | "mine" | "others">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    fetchMeals();
  }, [refreshTrigger]);

  const fetchMeals = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const mealsRef = collection(db, "meals");
      // Initial fetch is just by createdAt desc to get latest
      const baseQuery = query(mealsRef, orderBy("createdAt", "desc"));
      
      const snapshot = await getDocs(baseQuery);
      const fetchedMeals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Meal));
      
      setMeals(fetchedMeals);
    } catch (error) {
      console.error("Error fetching meals:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to desc for new field usually feels better
    }
  };

  const getSortedMeals = (mealsToSort: Meal[]) => {
    return [...mealsToSort].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        case 'user':
          const userA = a.userEmail.split('@')[0];
          const userB = b.userEmail.split('@')[0];
          comparison = userA.localeCompare(userB);
          break;
        case 'score':
          const scoreA = a.healthScore || 0;
          const scoreB = b.healthScore || 0;
          comparison = scoreA - scoreB;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const filteredMeals = meals.filter(meal => {
    if (filterMode === "mine" && user && meal.userId !== user.uid) return false;
    if (filterMode === "others" && user && meal.userId === user.uid) return false;
    return (
      meal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meal.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const displayedMeals = getSortedMeals(filteredMeals);

  const handleMealDelete = (id: string) => {
    setMeals(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="space-y-6 print:hidden">
      {/* Controls */}
      <div className="flex flex-col xl:flex-row gap-4 items-center justify-between glass p-4 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors duration-400">
        
        {/* Filter & Search Group */}
        <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
          <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-full sm:w-auto">
            <button 
              onClick={() => setFilterMode("all")}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterMode === "all" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
            >
              Iedereen
            </button>
            <button 
              onClick={() => setFilterMode("mine")}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterMode === "mine" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
            >
              🙋‍♂️ Van mij
            </button>
            <button 
              onClick={() => setFilterMode("others")}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterMode === "others" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
            >
              👥 Anderen
            </button>
          </div>

          <div className="relative w-full sm:w-80">
            <svg 
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Zoeken op titel of beschrijving..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field !pl-12"
              maxLength={100}
            />
          </div>
        </div>

        {/* Sorting Group */}
        <div className="flex items-center gap-2 overflow-x-auto w-full xl:w-auto pb-2 xl:pb-0 scrollbar-hide">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Sorteer op:</span>
          
          <button 
            onClick={() => handleSort('date')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1
              ${sortField === 'date' 
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'}`}
          >
            📅 Datum {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>
          
          <button 
            onClick={() => handleSort('user')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1
              ${sortField === 'user' 
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'}`}
          >
            👤 Wie {sortField === 'user' && (sortDirection === 'asc' ? 'A-Z' : 'Z-A')}
          </button>

          <button 
            onClick={() => handleSort('score')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1
              ${sortField === 'score' 
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'}`}
          >
            ⭐ Score {sortField === 'score' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card h-80 animate-pulse"></div>
          ))}
        </div>
      ) : displayedMeals.length === 0 ? (
        <div className="text-center py-20 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <div className="bg-slate-100 dark:bg-slate-800 h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 dark:text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">No data available</p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 gap-6 space-y-6">
          {displayedMeals.map((meal, index) => (
            <div 
              key={meal.id} 
              onClick={() => setSelectedMeal(meal)}
              className="break-inside-avoid group card !p-0 overflow-hidden hover:border-blue-200 dark:hover:border-blue-800/50 cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1"
            >
              <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <Image 
                  src={meal.imageUrl} 
                  alt={meal.title || "Maaltijd"} 
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority={index < 2}
                />
                {meal.healthScore && (
                  <div className="absolute top-3 right-3">
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm backdrop-blur-md border ${
                      meal.healthScore >= 7 ? 'bg-green-500/90 border-green-400 text-white' : 
                      meal.healthScore >= 4 ? 'bg-yellow-500/90 border-yellow-400 text-white' : 
                      'bg-red-500/90 border-red-400 text-white'
                    }`}>
                      Score: {meal.healthScore}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex justify-between items-start mb-2 gap-2">
                  <h3 className="font-bold leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {meal.title || "Maaltijd zonder titel"}
                  </h3>
                </div>
                
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                    {meal.userEmail[0]}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                    {new Date(meal.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} • {meal.userEmail.split('@')[0]}
                  </div>
                </div>
                
                {meal.description && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-3 text-slate-600 dark:text-slate-400">
                    {meal.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMeal && (
        <MealModal 
          meal={selectedMeal} 
          onClose={() => setSelectedMeal(null)} 
          onDelete={(id) => {
            setMeals(prev => prev.filter(m => m.id !== id));
            setSelectedMeal(null);
          }}
          onUpdate={(updatedMeal) => {
            setMeals(prev => prev.map(m => m.id === updatedMeal.id ? updatedMeal : m));
            setSelectedMeal(updatedMeal);
          }}
        />
      )}
    </div>
  );
}
