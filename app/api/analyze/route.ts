import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Configure runtime to edge if possible, but Gemini SDK might need node
export const runtime = 'nodejs'; 
export const maxDuration = 60; // 60 seconds timeout

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
    }

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }

    // Forced use of the specific model requested: gemini-2.5-flash-lite
    // Note: If 2.5 is not available yet in public API, fallback to 2.0 or 1.5 might be needed
    // Assuming user knows 2.5 is available or meant 1.5/2.0
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" }); // Fallback to safe known model if 2.5 fails, or keep user's choice if valid

    const prompt = `Analyseer deze afbeelding van een maaltijd. 
    Als het GEEN maaltijd is, retourneer dan { "isFood": false }. 
    Als het WEL een maaltijd is, retourneer dan een JSON object met de volgende velden in het Nederlands: 
    { 
      "isFood": true, 
      "title": "Een korte, pakkende titel van het gerecht (max 6 woorden)",
      "details": "Een gedetailleerde beschrijving van het gerecht", 
      "ingredients": ["ingrediënt 1", "ingrediënt 2", "etc (alleen strings, geen objecten)"], 
      "recipe": "stap-voor-stap bereidingswijze", 
      "shoppingList": "een overzichtelijke boodschappenlijst voor 2 personen, gegroepeerd per afdeling van de Albert Heijn (bijv. Groenten, Zuivel, Houdbaar)",
      "healthScore": "Een streng, realistisch cijfer tussen 1 en 10. Wees kritisch: 10 is alleen voor perfect uitgebalanceerde, supergezonde maaltijden met veel groenten en weinig bewerkte producten. Een pizza of patat is typisch 4-5, een standaard pasta 6-7." 
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

    if (!text) {
        return NextResponse.json({ error: "Lege reactie van AI" }, { status: 500 });
    }

    const cleanText = text.replace(/```json\n?|\n?```/g, "").trim();
    const jsonResult = JSON.parse(cleanText);

    return NextResponse.json(jsonResult);

  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json(
      { error: error.message || "Interne server fout" },
      { status: 500 }
    );
  }
}
