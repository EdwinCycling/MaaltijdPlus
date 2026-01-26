"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import {
  User,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from "firebase/auth";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import toast from "react-hot-toast";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sendMagicLink: (email: string) => Promise<void>;
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
    } catch { }
  };

  const safeLocalStorageRemove = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch { }
  };

  const checkAccess = useCallback(async (currentUser: User) => {
    const email = currentUser.email;
    console.log("Checking access for:", email);

    try {
      if (!email) throw new Error("Geen e-mailadres gevonden");

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
        
        // 1. Try allowed_users collection (as seen in screenshot: email as field)
        const allowedUsersQ = query(collection(db, "allowed_users"), where("email", "==", email));
        const allowedUsersSnap = await getDocs(allowedUsersQ);

        if (!allowedUsersSnap.empty) {
          console.log("Access granted via allowed_users query");
          setUser(currentUser);
          safeLocalStorageSet(`access_${email}`, "true");
          safeLocalStorageSet(`access_ts_${email}`, Date.now().toString());
          setLoading(false);
          return;
        }

        // 2. Try users_whitelist direct doc (email as ID)
        const docRef = doc(db, "users_whitelist", email);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          console.log("Access granted via users_whitelist (direct doc)");
          setUser(currentUser);
          safeLocalStorageSet(`access_${email}`, "true");
          safeLocalStorageSet(`access_ts_${email}`, Date.now().toString());
        } else {
          console.log("Direct doc not found in users_whitelist, trying query...");
          // 3. Try users_whitelist query (email as field)
          const q = query(collection(db, "users_whitelist"), where("email", "==", email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            console.log("Access granted via users_whitelist (query)");
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
    let unsubscribe = () => { };

    const initializeAuth = async () => {
      if (isInitializing.current) return;
      isInitializing.current = true;

      setLoading(true);

      // Check if this is a Magic Link sign-in
      if (isSignInWithEmailLink(auth, window.location.href)) {
        console.log("Detected Magic Link sign-in");
        let email = safeLocalStorageGet('emailForSignIn');
        
        if (!email) {
          // If email is not in storage, ask user for it (could happen if they click link on different device)
          email = window.prompt('Bevestig je e-mailadres voor inloggen:');
        }

        if (email) {
          try {
            await setPersistence(auth, browserLocalPersistence);
            const result = await signInWithEmailLink(auth, email, window.location.href);
            console.log("Magic Link sign-in successful:", result.user.email);
            safeLocalStorageRemove('emailForSignIn');
            // The onAuthStateChanged listener will handle the rest (checkAccess)
          } catch (error) {
            console.error("Magic Link sign-in error:", error);
            toast.error("Inloggen met link mislukt. Vraag een nieuwe link aan.");
            setLoading(false); // Make sure to stop loading if error
          }
        } else {
            setLoading(false);
        }
      }

      console.log("Setting up onAuthStateChanged listener...");
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          console.log("Auth state changed: User logged in", currentUser.email);
          await checkAccess(currentUser);
        } else {
          console.log("Auth state changed: No user");
          setUser(null);
          setLoading(false);
        }
      });
    };

    void initializeAuth();

    return () => {
      unsubscribe();
    };
  }, [checkAccess]);

  const sendMagicLink = async (email: string) => {
    console.log("Starting Magic Link send for:", email);
    setLoading(true);

    try {
        // 1. Whitelist Check BEFORE sending
        if (HARDCODED_ALLOW_LIST.includes(email)) {
            console.log("Email is in hardcoded whitelist, proceeding...");
        } else {
            console.log("Checking Firestore whitelist...");
            
            // 1. Try allowed_users (email as field - as seen in screenshot)
            const allowedUsersQ = query(collection(db, "allowed_users"), where("email", "==", email));
            const allowedUsersSnap = await getDocs(allowedUsersQ);
            
            if (allowedUsersSnap.empty) {
                console.log("Not found in allowed_users field, trying direct doc IDs...");
                
                // 2. Try allowed_users (email as ID)
                const docRef = doc(db, "allowed_users", email);
                const docSnap = await getDoc(docRef);
                
                if (!docSnap.exists()) {
                    console.log("Not found in allowed_users, trying users_whitelist...");
                    
                    // 3. Try users_whitelist (email as ID or field)
                    const legacyRef = doc(db, "users_whitelist", email);
                    const legacySnap = await getDoc(legacyRef);
                    
                    if (!legacySnap.exists()) {
                        const q = query(collection(db, "users_whitelist"), where("email", "==", email));
                        const qSnap = await getDocs(q);
                        
                        if (qSnap.empty) {
                            throw new Error(`Email ${email} not authorized`);
                        }
                    }
                }
            }
        }

      const actionCodeSettings = {
        // URL you want to redirect back to. The domain (www.example.com) for this
        // URL must be in the authorized domains list in the Firebase Console.
        url: window.location.origin,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      safeLocalStorageSet('emailForSignIn', email);
      toast.success("Check je email om in te loggen!");
      
    } catch (error: unknown) {
      console.error("Send Magic Link failed:", error);
      const errorMessage = getErrorMessage(error);
      if (errorMessage.includes("not authorized")) {
        toast.error(`Email niet geautoriseerd: ${email}`);
      } else {
        toast.error(`Versturen mislukt: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      toast.success("Uitgelogd");
    } catch (error) {
      console.error("Logout failed", error);
      toast.error("Uitloggen mislukt");
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, sendMagicLink, logout }}>
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
