import { generateOpenAIImage } from "./openaiProvider.js";
import { generatePollinationsImage } from "./pollinationsProvider.js";
import { generateReplicateImage } from "./replicateProvider.js";

export const imageProviderName = () => (process.env.IMAGE_PROVIDER || "openai").trim().toLowerCase();

export async function generateImageWithProvider(prompt, options = {}) {
  const provider = imageProviderName();

  if (provider === "openai") {
    return generateOpenAIImage(prompt, options);
  }

  if (provider === "replicate") {
    return generateReplicateImage(prompt, options);
  }

  if (provider === "pollinations") {
    return generatePollinationsImage(prompt, options);
  }

  throw new Error(`Provider de imagem nao suportado: ${provider}`);
}
