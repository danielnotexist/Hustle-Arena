import { GoogleGenAI } from "@google/genai";

async function generateAppImages() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompts = [
    { name: "hero", prompt: "A cinematic, high-energy esports arena with neon lights, a large screen showing a competitive game, and a cheering crowd in the background. Futuristic aesthetic, 4k, professional photography." },
    { name: "auth_bg", prompt: "A dark, abstract futuristic background with subtle blue and orange neon lines, cybernetic patterns, high tech feel, 4k." },
    { name: "feature_1", prompt: "A futuristic tactical map of a city with glowing objective markers and data overlays, esports style, 4k." }
  ];

  for (const p of prompts) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts: [{ text: p.prompt }] },
        config: { imageConfig: { aspectRatio: "16:9" } }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          console.log(`IMAGE_DATA:${p.name}:${part.inlineData.data}`);
        }
      }
    } catch (error) {
      console.error(`Failed to generate ${p.name}:`, error);
    }
  }
}

generateAppImages();
