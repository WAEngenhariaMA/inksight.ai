const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateReplicateImage(prompt, options = {}) {
  if (!process.env.REPLICATE_API_TOKEN?.trim()) {
    throw new Error("REPLICATE_API_TOKEN nao esta configurado no backend.");
  }

  const model = options.model || process.env.REPLICATE_MODEL;
  if (!model?.trim()) {
    throw new Error("REPLICATE_MODEL nao esta configurado no backend.");
  }

  const endpoint = model.includes("/")
    ? `https://api.replicate.com/v1/models/${model}/predictions`
    : "https://api.replicate.com/v1/predictions";
  const body = model.includes("/") ? { input: { prompt } } : { version: model, input: { prompt } };

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify(body),
  });

  let payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || "Erro ao gerar imagem no Replicate.");
  }

  for (let attempt = 0; payload?.status && !["succeeded", "failed", "canceled"].includes(payload.status) && attempt < 24; attempt += 1) {
    await sleep(1500);
    response = await fetch(payload.urls?.get, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    payload = await response.json().catch(() => null);
  }

  if (payload?.status !== "succeeded") {
    throw new Error("Replicate nao concluiu a geracao da imagem.");
  }

  const output = Array.isArray(payload.output) ? payload.output[0] : payload.output;
  if (!output) {
    throw new Error("Replicate nao retornou URL de imagem.");
  }

  return {
    imageUrl: output,
    model,
    provider: "replicate",
  };
}
