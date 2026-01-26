"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
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

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const getErrorCode = (error: unknown) => {
  if (typeof error === "object" && error && "code" in error) {
    const codeValue = (error as { code?: unknown }).code;
    return typeof codeValue === "string" ? codeValue : undefined;
  }
  return undefined;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const safeLocalStorageGet = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeLocalStorageSet = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  };

  const safeLocalStorageRemove = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  };

  const checkAccess = useCallback(async (currentUser: User) => {
    try {
      const email = currentUser.email;
      if (!email) throw new Error("Geen e-mailadres gevonden bij Google account");

      // 1. Check local cache (localStorage) for faster initial load
      const cachedAccess = safeLocalStorageGet(`access_${email}`);
      const cacheTimestamp = safeLocalStorageGet(`access_ts_${email}`);
      const isCacheValid = cacheTimestamp && (Date.now() - Number(cacheTimestamp) < 30 * 24 * 60 * 60 * 1000); // 30 days cache

      if (cachedAccess === 'true' && isCacheValid) {
        setUser(currentUser);
        setLoading(false);
        return; // Early return, but we might want to re-validate in background occasionally? For now, speed first.
      }

      if (HARDCODED_ALLOW_LIST.includes(email)) {
        setUser(currentUser);
        safeLocalStorageSet(`access_${email}`, "true");
        safeLocalStorageSet(`access_ts_${email}`, Date.now().toString());
        setLoading(false);
        return;
      }

      try {
        // Use a more direct check
        const { doc, getDoc } = await import("firebase/firestore");
        const docRef = doc(db, "users_whitelist", email);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setUser(currentUser);
          safeLocalStorageSet(`access_${email}`, "true");
          safeLocalStorageSet(`access_ts_${email}`, Date.now().toString());
        } else {
          // Double check with query if direct doc get fails (backward compatibility)
          const q = query(collection(db, "users_whitelist"), where("email", "==", email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
             setUser(currentUser);
             safeLocalStorageSet(`access_${email}`, "true");
             safeLocalStorageSet(`access_ts_${email}`, Date.now().toString());
          } else {
             await signOut(auth);
             setUser(null);
             safeLocalStorageRemove(`access_${email}`);
             safeLocalStorageRemove(`access_ts_${email}`);
             toast.error(`Toegang geweigerd: ${email} staat niet op de lijst.`);
          }
        }
      } catch (dbError: unknown) {
        console.error("Database access error:", dbError);
        // If DB fails but we had a valid user, maybe allow? 
        // No, security first. But show clear error.
        await signOut(auth);
        setUser(null);
        toast.error("Fout bij controleren toegangslijst. Probeer het later opnieuw.");
      }
    } catch (error: unknown) {
      console.error("Access check failed:", error);
      await signOut(auth);
      setUser(null);
      toast.error(getErrorMessage(error) || "Authenticatie mislukt.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let isActive = true;

    const initializeAuth = async () => {
      setLoading(true);
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        console.error("Persistence init error:", error);
      }

      // 1. Check for redirect result FIRST
      let redirectUser: User | null = null;
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          console.log("Redirect login successful", result.user.email);
          redirectUser = result.user;
        }
      } catch (error) {
        console.error("Redirect Error:", error);
        toast.error("Fout bij inloggen via redirect.");
      }

      // 2. Listen for auth state changes
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (!isActive) return;
        
        const finalUser = currentUser || redirectUser;
        
        if (finalUser) {
          await checkAccess(finalUser);
        } else {
          setUser(null);
          setLoading(false);
        }
      });
    };

    void initializeAuth();

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [checkAccess]);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      await setPersistence(auth, browserLocalPersistence);
      
      if (isMobile) {
        // Op mobiel: Redirect (Pagina ververst) - Dit fixt het iOS probleem
        await signInWithRedirect(auth, googleProvider);
      } else {
        // Op desktop: Popup (Blijft op pagina) - Dit is gebruiksvriendelijker
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error: unknown) {
      console.error("Login failed:", error);
      const errorMessage = getErrorMessage(error);
      const errorCode = getErrorCode(error);
      toast.error(`Login failed (${errorCode}): ${errorMessage}`);
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
