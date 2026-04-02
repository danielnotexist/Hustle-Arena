import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const outDir = path.join(process.cwd(), "public", "images");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const imagesToGenerate = [
  { name: "hero.png", prompt: "A cinematic, high-energy esports arena with neon lights, a large screen showing a competitive game like CS:GO or Valorant, and a cheering crowd in the background. Futuristic aesthetic, 4k, professional photography." },
  { name: "pro-player.png", prompt: "A professional esports player sitting in a high-tech gaming chair, wearing a headset, focused on a glowing monitor. Intense atmosphere, neon blue lighting, high detail." },
  { name: "tourney-1.png", prompt: "esports tactical shooter tournament stage with players at computers" },
  { name: "tourney-2.png", prompt: "esports battle royale tournament stage with players at computers" },
  { name: "tourney-3.png", prompt: "esports moba tournament stage with players at computers" },
  { name: "pro-gear.png", prompt: "A collection of high-end esports gaming peripherals: a glowing mechanical keyboard, a precision mouse, and a sleek headset on a dark desk. Cyberpunk aesthetic, neon cyan accents, professional esports gear." },
  { name: "mode-5v5.png", prompt: "esports 5v5 tactical shooter gameplay screenshot" },
  { name: "mode-2v2.png", prompt: "esports 2v2 tactical shooter gameplay screenshot" },
  { name: "mode-royale.png", prompt: "esports battle royale gameplay screenshot" },
  { name: "battlefield-hero.png", prompt: "esports tournament stage with players and large screen" },
  { name: "pulse-1.png", prompt: "esports gameplay highlight screenshot 1" },
  { name: "pulse-2.png", prompt: "esports gameplay highlight screenshot 2" },
  { name: "pulse-3.png", prompt: "esports gameplay highlight screenshot 3" }
];

async function generateAll() {
  const batchSize = 3;
  for (let i = 0; i < imagesToGenerate.length; i += batchSize) {
    const batch = imagesToGenerate.slice(i, i + batchSize);
    await Promise.all(batch.map(async (img) => {
      console.log(`Generating ${img.name}...`);
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: { parts: [{ text: img.prompt }] },
          config: { imageConfig: { aspectRatio: "16:9" } }
        });
        
        let found = false;
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const buffer = Buffer.from(part.inlineData.data, "base64");
            fs.writeFileSync(path.join(outDir, img.name), buffer);
            console.log(`Saved ${img.name}`);
            found = true;
            break;
          }
        }
        if (!found) console.log(`No image data for ${img.name}`);
      } catch (e) {
        console.error(`Error generating ${img.name}:`, e.message);
      }
    }));
  }
}

generateAll();
