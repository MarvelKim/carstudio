export const buildCarImagePrompt = (carName, profileSeed = "") => {
  const futureOffset = 20 + (Math.abs(String(profileSeed).length) % 11);
  return [
    `Using the reference vehicle image, create a clearly new AI concept render of the ${carName} as it could look ${futureOffset} to ${futureOffset + 2} years in the future.`,
    "Do not copy or reproduce the reference image. Keep only the broad vehicle class and brand character, then visibly redesign the body panels, lighting signature, wheels, stance, front fascia, rear haunches, material finish, and studio setting.",
    "Make the result obviously different from the source at first glance: more premium, futuristic, dramatic, and custom-built, while still plausible as an automotive design.",
    "Use a natural 3:2 landscape composition with the full vehicle visible, realistic perspective, balanced reflections, premium materials, sharp but not overprocessed details, and soft studio lighting.",
    "Avoid text, labels, people, watermarks, stretched proportions, warped wheels, and random logos."
  ].join(" ");
};

const imageUrlToInlineData = async (imageUrl, fetchImpl) => {
  if (!imageUrl) return null;

  const response = await fetchImpl(imageUrl);
  if (!response.ok) {
    throw new Error("Reference vehicle image could not be loaded");
  }

  const contentType = response.headers.get("content-type") || "image/webp";
  const buffer = await response.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return {
    mimeType: contentType.split(";")[0],
    data: btoa(binary)
  };
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
    parts.push({ inlineData: sourceImage });
  }

  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        parts
      }],
      generationConfig: {
        responseModalities: ["Image"]
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini image generation failed");
  }

  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const image = responseParts.find((part) => part.inlineData?.data);
  if (!image?.inlineData?.data) {
    throw new Error("Gemini response did not include an image");
  }

  return {
    imageUrl: `data:${image.inlineData.mimeType || "image/png"};base64,${image.inlineData.data}`,
    prompt
  };
};
