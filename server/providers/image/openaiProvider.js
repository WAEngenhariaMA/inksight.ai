import OpenAI from "openai";

export async function generateOpenAIImage(prompt, options = {}) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY nao esta configurada no backend.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = options.model || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const response = await openai.images.generate({
    model,
    prompt,
    size: options.size || process.env.OPENAI_IMAGE_SIZE || "1024x1536",
    quality: "high",
    background: "opaque",
    output_format: "png",
  });

  const imageBase64 = response.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("A OpenAI nao retornou imagem em base64.");
  }

  return {
    imageUrl: `data:image/png;base64,${imageBase64}`,
    model,
    provider: "openai",
  };
}
