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

      const log = (msg: string) => {
        const logs = JSON.parse(sessionStorage.getItem("auth_logs") || "[]");
        logs.push(`${new Date().toISOString()}: ${msg}`);
        sessionStorage.setItem("auth_logs", JSON.stringify(logs.slice(-20)));
        console.log(msg);
      };

      log(`Checking access for: ${email}`);

      if (HARDCODED_ALLOW_LIST.includes(email)) {
        log("Access granted via hardcoded list");
        setUser(currentUser);
        setLoading(false);
        return;
      }

      try {
        const q = query(collection(db, "users_whitelist"), where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          log("Access granted via Firestore query");
          setUser(currentUser);
        } else {
          const { doc, getDoc } = await import("firebase/firestore");
          const docRef = doc(db, "users_whitelist", email);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            log("Access granted via Firestore doc ID");
            setUser(currentUser);
          } else {
            log(`Access denied: ${email} not in whitelist`);
            await signOut(auth);
            setUser(null);
            toast.error(`Toegang geweigerd: ${email} staat niet op de lijst.`);
          }
        }
      } catch (dbError: unknown) {
        log(`Database access error: ${getErrorMessage(dbError)}`);
        await signOut(auth);
        setUser(null);
        toast.error("Fout bij controleren toegangslijst.");
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

    const log = (msg: string) => {
      const logs = JSON.parse(sessionStorage.getItem("auth_logs") || "[]");
      logs.push(`${new Date().toISOString()}: ${msg}`);
      sessionStorage.setItem("auth_logs", JSON.stringify(logs.slice(-20)));
      console.log(msg);
    };

    const initializeAuth = async () => {
      log(`Initializing Auth (Domain: ${auth.config.authDomain})...`);
      try {
        await setPersistence(auth, getPreferredPersistence());
        log("Persistence set to LOCAL");
      } catch (error) {
        log(`Persistence error: ${getErrorMessage(error)}`);
      }

      try {
        // Small delay to ensure browser storage is ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        log("Checking redirect result...");
        const result = await getRedirectResult(auth);
        if (result?.user) {
          log(`Redirect result found: ${result.user.email}`);
          await checkAccess(result.user);
        } else {
          log("No redirect result found");
        }
      } catch (error: unknown) {
        log(`Redirect error: ${getErrorMessage(error)}`);
        const errorCode = getErrorCode(error);
        if (errorCode !== "auth/popup-closed-by-user" && errorCode !== "auth/cancelled-popup-request") {
          toast.error("Fout bij inloggen: " + (getErrorMessage(error) || "onbekende fout"));
        }
        if (isActive) {
          setLoading(false);
        }
      }

      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          log(`Auth state changed: user logged in as ${currentUser.email}`);
          await checkAccess(currentUser);
        } else {
          log("Auth state changed: no user");
          if (isActive) {
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
    const log = (msg: string) => {
      const logs = JSON.parse(sessionStorage.getItem("auth_logs") || "[]");
      logs.push(`${new Date().toISOString()}: ${msg}`);
      sessionStorage.setItem("auth_logs", JSON.stringify(logs.slice(-20)));
      console.log(msg);
    };

    log("Starting Google Sign-In process...");
    try {
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      log(`Device info: isStandalone=${isStandalone}, isIOS=${isIOS}, isMobile=${isMobile}`);
      
      await setPersistence(auth, browserLocalPersistence);
      log("Persistence set to LOCAL");
      
      // On iOS Chrome/Safari, popups often work better than redirects unless in PWA mode
      if (isIOS && !isStandalone) {
        log("iOS detected: Trying signInWithPopup first...");
        try {
          await signInWithPopup(auth, googleProvider);
          log("Popup login successful");
          return;
        } catch (popupError: any) {
          log(`Popup failed or blocked: ${getErrorMessage(popupError)}. Falling back to redirect...`);
          // If popup is blocked or fails, fall back to redirect
          await signInWithRedirect(auth, googleProvider);
        }
      } else if (isStandalone || isMobile) {
        log("Mobile/PWA detected: Using signInWithRedirect");
        await signInWithRedirect(auth, googleProvider);
      } else {
        log("Desktop detected: Using signInWithPopup");
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error: unknown) {
      log(`Login error: ${getErrorMessage(error)}`);
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
