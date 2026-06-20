export const buildCarImagePrompt = (carName, profileSeed = "") => {
  const futureOffset = 20 + (Math.abs(String(profileSeed).length) % 11);
  return [
    `Create a high-end realistic automotive studio render of the ${carName} as it could look ${futureOffset} to ${futureOffset + 2} years in the future.`,
    "Keep the original brand character, vehicle class, body proportions, and recognizable silhouette, but redesign it with plausible next-generation luxury details.",
    "Use a natural 3:2 landscape composition with the full vehicle visible, realistic perspective, balanced reflections, premium materials, sharp but not overprocessed details, and soft studio lighting.",
    "Avoid stretched proportions, crushed bodywork, warped wheels, exaggerated sci-fi parts, text, labels, people, watermarks, and logos not already implied by the vehicle."
  ].join(" ");
};

export const createCarAiImage = async ({
  apiKey,
  carName,
  profileSeed = "",
  model = "gemini-3.1-flash-image",
  fetchImpl = fetch
}) => {
  if (!apiKey) {
    throw new Error("Gemini API key is required");
  }

  const prompt = buildCarImagePrompt(carName, profileSeed);
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini image generation failed");
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const image = parts.find((part) => part.inlineData?.data);
  if (!image?.inlineData?.data) {
    throw new Error("Gemini response did not include an image");
  }

  return {
    imageUrl: `data:${image.inlineData.mimeType || "image/png"};base64,${image.inlineData.data}`,
    prompt
  };
};
