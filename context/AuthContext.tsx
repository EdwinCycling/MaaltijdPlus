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
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
    return isStandalone || isIOS ? browserSessionPersistence : browserLocalPersistence;
  };

  const checkAccess = useCallback(async (currentUser: User) => {
    try {
      const email = currentUser.email;
      if (!email) throw new Error("Geen e-mailadres gevonden bij Google account");

      console.log("Checking access for:", email);

      if (HARDCODED_ALLOW_LIST.includes(email)) {
        console.log("Access granted via hardcoded list");
        setUser(currentUser);
        setLoading(false);
        return;
      }

      try {
        const q = query(collection(db, "users_whitelist"), where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          console.log("Access granted via Firestore query");
          setUser(currentUser);
        } else {
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
      } catch (dbError: unknown) {
        console.error("Database access error:", dbError);
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

    const initializeAuth = async () => {
      try {
        await setPersistence(auth, getPreferredPersistence());
      } catch (error) {
        console.error("Persistence error:", error);
      }

      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          console.log("Redirect login succesvol voor:", result.user.email);
          await checkAccess(result.user);
        }
      } catch (error: unknown) {
        console.error("Redirect login error:", error);
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
          console.log("Auth state change: gebruiker ingelogd", currentUser.email);
          await checkAccess(currentUser);
        } else {
          console.log("Auth state change: geen gebruiker");
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
    console.log("Starting Google Sign-In...");
    try {
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const persistence = isStandalone || isIOS ? browserSessionPersistence : browserLocalPersistence;

      console.log("Auth details:", { isStandalone, isIOS, isMobile, persistence: persistence.type });
      
      await setPersistence(auth, persistence);
      console.log("Persistence set to:", persistence.type);
      
      if (isStandalone || isIOS || isMobile) {
        console.log("Using signInWithRedirect");
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
