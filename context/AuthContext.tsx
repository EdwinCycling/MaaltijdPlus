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
        const result = await getRedirectResult(auth);
        if (result?.user) {
          await checkAccess(result.user);
        }
      } catch (error) {
        console.error("Redirect login error:", error);
        toast.error("Fout bij inloggen via redirect.");
      }
    };
    checkRedirect();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await checkAccess(currentUser);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const checkAccess = async (currentUser: User) => {
    try {
      const email = currentUser.email;
      if (!email) throw new Error("No email found");

      // 1. Check Hardcoded List
      if (HARDCODED_ALLOW_LIST.includes(email)) {
        setUser(currentUser);
        setLoading(false);
        return;
      }

      // 2. Check Firestore Whitelist
      // Assuming 'users_whitelist' collection with documents where email field matches, or document ID is email
      // User requirement: users_whitelist: { email: string }
      try {
        const q = query(collection(db, "users_whitelist"), where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          setUser(currentUser);
        } else {
          // Extra check: see if doc ID is the email
          const { doc, getDoc } = await import("firebase/firestore");
          const docRef = doc(db, "users_whitelist", email);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setUser(currentUser);
          } else {
            await signOut(auth);
            setUser(null);
            toast.error("Toegang geweigerd: Je staat niet op de toegestane lijst.");
          }
        }
      } catch (dbError: any) {
        console.error("Database access error during whitelist check:", dbError);
        if (dbError.code === "permission-denied") {
          toast.error("Database permissie fout. Controleer of de 'users_whitelist' collectie leesbaar is.");
        }
        throw dbError; // Re-throw to be caught by the outer catch
      }
    } catch (error) {
      console.error("Access check failed:", error);
      await signOut(auth);
      setUser(null);
      // Only show general error if it wasn't already handled by the specific dbError toast
      if (!(error as any).code || (error as any).code !== "permission-denied") {
        toast.error("Authenticatie mislukt of geen toegang.");
      }
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
