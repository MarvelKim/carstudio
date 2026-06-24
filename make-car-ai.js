export const buildCarImagePrompt = (carName, profileSeed = "") => {
  const futureOffset = 20 + (Math.abs(String(profileSeed).length) % 11);
  return [
    `Using the reference vehicle image, create a clearly new AI concept render of the ${carName} as it could look ${futureOffset} to ${futureOffset + 2} years in the future.`,
    "Do not copy or reproduce the reference image. Keep only the broad vehicle class and brand character, then visibly redesign the body panels, lighting signature, wheels, stance, front fascia, rear haunches, material finish, and studio setting.",
    "Make the result obviously different from the source at first glance: more premium, futuristic, dramatic, and custom-built, while still plausible as an automotive design.",
    "Use a natural 16:10 landscape composition with the full vehicle visible, realistic perspective, balanced reflections, premium materials, sharp but not overprocessed details, and soft studio lighting.",
    "Preserve believable automotive proportions: normal vehicle height, round wheels, natural cabin height, and no vertically compressed or flattened body shape.",
    "Avoid text, labels, people, watermarks, stretched proportions, warped wheels, and random logos."
  ].join(" ");
};

const buildFallbackPrompt = (carName, profileSeed = "") => {
  const futureOffset = 20 + (Math.abs(String(profileSeed).length) % 11);
  return [
    `A cinematic hyper-realistic automotive concept render of a future ${carName}, ${futureOffset} years from now.`,
    "Full vehicle visible, premium futuristic redesign, dramatic studio lighting, glossy reflections, 3/4 front view, realistic wheels, sharp body surfacing, luxury material finish.",
    "Natural 16:10 landscape car studio composition, normal vehicle height, round wheels, believable cabin height, not vertically squeezed, not flattened, not stretched.",
    "Clean dark studio background, professional car commercial photography, no people, no text, no watermark, no distorted wheels, no random logos."
  ].join(" ");
};

const hashText = (value) => {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const imageUrlToInlineData = async (imageUrl, fetchImpl) => {
  if (!imageUrl) return null;

  const response = await fetchImpl(imageUrl);
  if (!response.ok) {
    throw new Error("Reference vehicle image could not be loaded");
  }

  const contentType = response.headers.get("content-type") || "image/webp";
  const buffer = await response.arrayBuffer();

  return {
    mimeType: contentType.split(";")[0],
    data: bytesToBase64(new Uint8Array(buffer))
  };
};

const buildGeminiGenerationConfig = (model) => {
  const image = { aspectRatio: "16:9" };
  if (model === "gemini-3.1-flash-image" || model === "gemini-3-pro-image") {
    image.imageSize = "1K";
  }

  return {
    responseModalities: ["TEXT", "IMAGE"],
    responseFormat: { image }
  };
};

const normalizeGeminiPart = (part) => {
  if (part.text) return { text: part.text };
  const inlineData = part.inlineData || part.inline_data;
  if (!inlineData) return part;

  return {
    inline_data: {
      mime_type: inlineData.mimeType || inlineData.mime_type || "image/png",
      data: inlineData.data
    }
  };
};

const findInlineImage = (data) => {
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  return responseParts.find((part) => part.inlineData?.data || part.inline_data?.data);
};

export const createCarAiImage = async ({
  apiKey,
  carName,
  profileSeed = "",
  sourceImageUrl = "",
  model = "gemini-3.1-flash-image",
  fetchImpl = fetch
}) => {
  if (!apiKey) {
    throw new Error("Gemini API key is required");
  }

  const prompt = buildCarImagePrompt(carName, profileSeed);
  const sourceImage = await imageUrlToInlineData(sourceImageUrl, fetchImpl);
  const parts = [{ text: prompt }];
  if (sourceImage) {
    parts.push({
      inline_data: {
        mime_type: sourceImage.mimeType,
        data: sourceImage.data
      }
    });
  }

  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        parts: parts.map(normalizeGeminiPart)
      }],
      generationConfig: buildGeminiGenerationConfig(model)
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini image generation failed");
  }

  const image = findInlineImage(data);
  const inlineData = image?.inlineData || image?.inline_data;
  if (!inlineData?.data) {
    throw new Error("Gemini response did not include an image");
  }

  return {
    imageUrl: `data:${inlineData.mimeType || inlineData.mime_type || "image/png"};base64,${inlineData.data}`,
    prompt
  };
};

export const createFreeFallbackCarImage = async ({
  carName,
  profileSeed = "",
  fetchImpl = fetch
}) => {
  const prompt = buildFallbackPrompt(carName, profileSeed);
  const seed = hashText(`${carName}|${profileSeed}`);
  const imageUrl = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  imageUrl.searchParams.set("width", "1280");
  imageUrl.searchParams.set("height", "800");
  imageUrl.searchParams.set("seed", String(seed));
  imageUrl.searchParams.set("model", "flux");
  imageUrl.searchParams.set("nologo", "true");
  imageUrl.searchParams.set("enhance", "true");

  const response = await fetchImpl(imageUrl.toString(), {
    headers: {
      "Accept": "image/png,image/jpeg,image/webp"
    }
  });
  if (!response.ok) {
    throw new Error("Free image fallback failed");
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = await response.arrayBuffer();
  const data = bytesToBase64(new Uint8Array(buffer));

  return {
    imageUrl: `data:${contentType.split(";")[0]};base64,${data}`,
    prompt
  };
};
