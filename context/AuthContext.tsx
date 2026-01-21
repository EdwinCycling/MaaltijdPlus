"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  User, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged, 
  setPersistence, 
  browserLocalPersistence 
} from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, googleProvider, db } from "@/lib/firebase";
import toast from "react-hot-toast";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hardcoded allow-list for fallback/initial admin
const HARDCODED_ALLOW_LIST: string[] = [
  // Add emails here for initial access if needed
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for redirect result when the app loads
    const checkRedirect = async () => {
      try {
        // Alleen checken als we echt in een redirect flow zitten
        // Firebase onAuthStateChanged handelt de rest af
        const result = await getRedirectResult(auth);
        if (result?.user) {
          console.log("Redirect login succesvol voor:", result.user.email);
          await checkAccess(result.user);
        }
      } catch (error: any) {
        console.error("Redirect login error:", error);
        // Voorkom oneindige loops door alleen te toasten bij echte fouten
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
          toast.error("Fout bij inloggen: " + (error.message || "onbekende fout"));
        }
        setLoading(false);
      }
    };
    
    checkRedirect();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        console.log("Auth state change: gebruiker ingelogd", currentUser.email);
        await checkAccess(currentUser);
      } else {
        console.log("Auth state change: geen gebruiker");
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const checkAccess = async (currentUser: User) => {
    try {
      const email = currentUser.email;
      if (!email) throw new Error("Geen e-mailadres gevonden bij Google account");

      console.log("Checking access for:", email);

      // 1. Check Hardcoded List
      if (HARDCODED_ALLOW_LIST.includes(email)) {
        console.log("Access granted via hardcoded list");
        setUser(currentUser);
        setLoading(false);
        return;
      }

      // 2. Check Firestore Whitelist
      try {
        const q = query(collection(db, "users_whitelist"), where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          console.log("Access granted via Firestore query");
          setUser(currentUser);
        } else {
          // Extra check: see if doc ID is the email
          const { doc, getDoc } = await import("firebase/firestore");
          const docRef = doc(db, "users_whitelist", email);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            console.log("Access granted via Firestore doc ID");
            setUser(currentUser);
          } else {
            console.warn("Access denied: email not in whitelist");
            await signOut(auth);
            setUser(null);
            toast.error(`Toegang geweigerd: ${email} staat niet op de lijst.`);
          }
        }
      } catch (dbError: any) {
        console.error("Database access error:", dbError);
        // Bij permissie-fouten (bijv. als de gebruiker nog niet is geautoriseerd om te lezen)
        // proberen we het toch als succes te zien als Firebase Auth zegt dat ze ingelogd zijn?
        // Nee, we houden de whitelist aan voor veiligheid.
        await signOut(auth);
        setUser(null);
        toast.error("Fout bij controleren toegangslijst.");
      }
    } catch (error: any) {
      console.error("Access check failed:", error);
      await signOut(auth);
      setUser(null);
      toast.error(error.message || "Authenticatie mislukt.");
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      
      // Check if we are on iOS or in a PWA (standalone mode)
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      
      if (isStandalone || isIOS) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      // checkAccess will be triggered by onAuthStateChanged or getRedirectResult
    } catch (error: unknown) {
      console.error("Login failed", error);
      toast.error((error as Error).message || "Login failed");
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Logout failed", error);
      toast.error("Logout failed");
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
