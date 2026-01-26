
import { GoogleGenAI, Type } from "@google/genai";
import { StatusLogEntry } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getDailyInsights = async (history: StatusLogEntry[]) => {
  const historyText = history.map(h => 
    `${h.status} started at ${new Date(h.timestamp).toLocaleTimeString()}`
  ).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this office worker's day and provide a summary and 3 actionable productivity or wellness tips. 
      The person has the following status log:\n${historyText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            productivityScore: { type: Type.NUMBER }
          },
          required: ["summary", "recommendations", "productivityScore"]
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return null;
  }
};
