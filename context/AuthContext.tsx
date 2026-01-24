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
  browserLocalPersistence,
  browserSessionPersistence
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

  const getPreferredPersistence = () => {
    // Force local persistence for better reliability across redirects on mobile
    return browserLocalPersistence;
  };

  const checkAccess = useCallback(async (currentUser: User) => {
    try {
      const email = currentUser.email;
      if (!email) throw new Error("Geen e-mailadres gevonden bij Google account");

      // 1. Check local cache (localStorage) for faster initial load
      const cachedAccess = localStorage.getItem(`access_${email}`);
      const cacheTimestamp = localStorage.getItem(`access_ts_${email}`);
      const isCacheValid = cacheTimestamp && (Date.now() - Number(cacheTimestamp) < 30 * 24 * 60 * 60 * 1000); // 30 days cache

      if (cachedAccess === 'true' && isCacheValid) {
        setUser(currentUser);
        setLoading(false);
        return; // Early return, but we might want to re-validate in background occasionally? For now, speed first.
      }

      if (HARDCODED_ALLOW_LIST.includes(email)) {
        setUser(currentUser);
        localStorage.setItem(`access_${email}`, 'true');
        localStorage.setItem(`access_ts_${email}`, Date.now().toString());
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
          localStorage.setItem(`access_${email}`, 'true');
          localStorage.setItem(`access_ts_${email}`, Date.now().toString());
        } else {
          // Double check with query if direct doc get fails (backward compatibility)
          const q = query(collection(db, "users_whitelist"), where("email", "==", email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
             setUser(currentUser);
             localStorage.setItem(`access_${email}`, 'true');
             localStorage.setItem(`access_ts_${email}`, Date.now().toString());
          } else {
             await signOut(auth);
             setUser(null);
             localStorage.removeItem(`access_${email}`);
             localStorage.removeItem(`access_ts_${email}`);
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
      // Ensure persistence is set to LOCAL
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        console.error("Persistence init error:", error);
      }

      // Listen for auth state changes - this is the source of truth
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (!isActive) return;
        
        if (currentUser) {
          // User is signed in (or restored from persistence)
          // We don't set loading=false here yet, checkAccess will do it
          await checkAccess(currentUser);
        } else {
          // No user found... BUT, are we returning from a redirect?
          // getRedirectResult might still yield a user
          try {
             const result = await getRedirectResult(auth);
             if (result?.user) {
               await checkAccess(result.user);
             } else {
               // Really no user
               setUser(null);
               setLoading(false);
             }
          } catch (redirectError) {
            console.error("Redirect check error:", redirectError);
            setUser(null);
            setLoading(false);
          }
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
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      await setPersistence(auth, browserLocalPersistence);
      
      // Always use redirect for mobile devices for better stability
      if (isMobile || isStandalone) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        try {
          await signInWithPopup(auth, googleProvider);
        } catch (popupError: any) {
          console.warn("Popup failed, falling back to redirect", popupError);
          await signInWithRedirect(auth, googleProvider);
        }
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
