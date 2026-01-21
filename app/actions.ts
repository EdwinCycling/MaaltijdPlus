"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

// Server-side rate limiting for AI analysis (prevent script abuse)
const analysisRateLimit = new Map<string, { count: number; timestamp: number }>();

export async function analyzeMeal(imageBase64: string, mimeType: string) {
  // Simple IP-based rate limiting for the server action
  // In server actions, we get the IP from headers
  const { headers } = await import("next/headers");
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") || "unknown";
  
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 20; // max 20 analyses per hour per IP

  const currentLimit = analysisRateLimit.get(ip);
  if (currentLimit && (now - currentLimit.timestamp) < windowMs) {
    if (currentLimit.count >= maxRequests) {
      throw new Error("Je hebt de maximale limiet voor analyses per uur bereikt. Probeer het later opnieuw.");
    }
    currentLimit.count++;
  } else {
    analysisRateLimit.set(ip, { count: 1, timestamp: now });
  }

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  // Input validation
  if (!imageBase64 || !mimeType) {
    throw new Error("Ongeldige invoer voor analyse");
  }

  // Limit base64 size to prevent huge payloads (e.g. 10MB)
  if (imageBase64.length > 15 * 1024 * 1024) {
    throw new Error("Afbeelding is te groot voor analyse");
  }

  try {
    // Forced use of the specific model requested: gemini-2.5-flash-lite
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `Analyseer deze afbeelding van een maaltijd. 
    Als het GEEN maaltijd is, retourneer dan { "isFood": false }. 
    Als het WEL een maaltijd is, retourneer dan een JSON object met de volgende velden in het Nederlands: 
    { 
      "isFood": true, 
      "title": "Een korte, pakkende titel van het gerecht",
      "details": "Een gedetailleerde beschrijving van het gerecht", 
      "ingredients": ["lijst", "van", "ingrediënten"], 
      "recipe": "stap-voor-stap bereidingswijze", 
      "healthScore": een getal tussen 1 en 10 
    } 
    Retourneer ALLEEN de JSON.`;

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Clean up markdown code blocks if present
    const cleanText = text.replace(/```json\n?|\n?```/g, "").trim();
    
    return JSON.parse(cleanText);
  } catch (error: any) {
    console.error("Gemini analysis failed:", error);
    
    // Provide more specific error messages
    if (error.status === 429) {
      throw new Error("AI limiet bereikt. Probeer het over een minuutje weer.");
    }
    
    if (error.message?.includes("API key")) {
      throw new Error("Ongeldige API key. Controleer je instellingen.");
    }

    throw new Error("Analyse mislukt: " + (error.message || "onbekende fout"));
  }
}
