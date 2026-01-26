"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
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
  const isInitializing = useRef(false);

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
    const email = currentUser.email;
    console.log("Checking access for:", email);
    
    try {
      if (!email) throw new Error("Geen e-mailadres gevonden bij Google account");

      // 1. Check local cache (localStorage) for faster initial load
      const cachedAccess = safeLocalStorageGet(`access_${email}`);
      const cacheTimestamp = safeLocalStorageGet(`access_ts_${email}`);
      const isCacheValid = cacheTimestamp && (Date.now() - Number(cacheTimestamp) < 30 * 24 * 60 * 60 * 1000); // 30 days cache

      if (cachedAccess === 'true' && isCacheValid) {
        console.log("Access granted via cache");
        setUser(currentUser);
        setLoading(false);
        return;
      }

      if (HARDCODED_ALLOW_LIST.includes(email)) {
        console.log("Access granted via hardcoded whitelist");
        setUser(currentUser);
        safeLocalStorageSet(`access_${email}`, "true");
        safeLocalStorageSet(`access_ts_${email}`, Date.now().toString());
        setLoading(false);
        return;
      }

      try {
        console.log("Checking database for whitelist...");
        const { doc, getDoc } = await import("firebase/firestore");
        const docRef = doc(db, "users_whitelist", email);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          console.log("Access granted via database (direct doc)");
          setUser(currentUser);
          safeLocalStorageSet(`access_${email}`, "true");
          safeLocalStorageSet(`access_ts_${email}`, Date.now().toString());
        } else {
          console.log("Direct doc not found, trying query...");
          // Double check with query if direct doc get fails (backward compatibility)
          const q = query(collection(db, "users_whitelist"), where("email", "==", email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
             console.log("Access granted via database (query)");
             setUser(currentUser);
             safeLocalStorageSet(`access_${email}`, "true");
             safeLocalStorageSet(`access_ts_${email}`, Date.now().toString());
          } else {
             console.warn("Access denied: User not in whitelist");
             await signOut(auth);
             setUser(null);
             safeLocalStorageRemove(`access_${email}`);
             safeLocalStorageRemove(`access_ts_${email}`);
             toast.error(`Toegang geweigerd: ${email} staat niet op de lijst.`);
          }
        }
      } catch (dbError: unknown) {
        console.error("Database access error:", dbError);
        // If DB fails, we should NOT sign out immediately if we already have a user in state
        // but for now we follow the security rule: No data, no access.
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
      if (isInitializing.current) {
        console.log("Auth already initializing, skipping...");
        return;
      }
      isInitializing.current = true;

      // Increased delay for Safari/iOS to ensure indexedDB/cookies are ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log("Initializing Auth...");
      console.log("Current URL:", window.location.href);
      console.log("Referrer:", document.referrer);
      setLoading(true);

      const isRedirectPending = safeLocalStorageGet("auth_redirect_pending") === "true";
      console.log("Is redirect pending in localStorage?", isRedirectPending);

      // 1. Setup the permanent listener FIRST
      // Sometimes the observer picks up the user before getRedirectResult finishes
      console.log("Setting up onAuthStateChanged listener...");
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (!isActive) return;
        
        if (currentUser) {
          console.log("Auth state changed: User logged in", currentUser.email);
          safeLocalStorageRemove("auth_redirect_pending");
          await checkAccess(currentUser);
        } else {
          console.log("Auth state changed: No user");
          const stillPending = safeLocalStorageGet("auth_redirect_pending") === "true";
          if (!stillPending) {
            setUser(null);
            setLoading(false);
          }
        }
      });

      try {
        // 2. Check for Redirect Result
        console.log("Checking getRedirectResult...");
        const result = await getRedirectResult(auth);
        
        if (result?.user) {
          console.log("Redirect result found:", result.user.email);
          safeLocalStorageRemove("auth_redirect_pending");
          await checkAccess(result.user);
          if (!isActive) return;
        } else {
          console.log("No redirect result found. (result is null)");
          if (isRedirectPending) {
            console.log("Redirect was pending but no result found. Waiting for listener or timeout...");
            
            // Final timeout for redirect
            setTimeout(() => {
              if (safeLocalStorageGet("auth_redirect_pending") === "true") {
                console.log("Redirect pending timeout reached.");
                safeLocalStorageRemove("auth_redirect_pending");
                if (!auth.currentUser) {
                  setLoading(false);
                }
              }
            }, 4000); // Total 5 seconds from start
          }
        }
      } catch (error) {
        console.error("Auth Initialization Error (getRedirectResult):", error);
        safeLocalStorageRemove("auth_redirect_pending");
        setLoading(false);
      }
    };

    void initializeAuth();

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [checkAccess]);

  const signInWithGoogle = async () => {
    console.log("Starting Google Sign In...");
    setLoading(true);
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      console.log("Device is mobile:", isMobile);
      
      await setPersistence(auth, browserLocalPersistence);

      if (isMobile) {
        console.log("Using signInWithRedirect");
        safeLocalStorageSet("auth_redirect_pending", "true");
        await signInWithRedirect(auth, googleProvider);
      } else {
        console.log("Using signInWithPopup");
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
