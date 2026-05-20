const imageToDataUrl = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Erro ao baixar imagem gerada pelo Pollinations.");
  }

  const contentType = response.headers.get("Content-Type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
};

export async function generatePollinationsImage(prompt) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1536&nologo=true&private=true`;
  return {
    imageUrl: await imageToDataUrl(url),
    model: "pollinations",
    provider: "pollinations",
  };
}
