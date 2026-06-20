const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const hashText = async (value) => {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const buildPrompt = (carName, profileSeed) => {
  const futureOffset = 20 + (Math.abs(profileSeed.length) % 11);
  return [
    `Create a high-end realistic automotive studio render of the ${carName} as it could look ${futureOffset} to ${futureOffset + 2} years in the future.`,
    "Keep the original brand character, vehicle class, body proportions, and recognizable silhouette, but redesign it with plausible next-generation luxury details.",
    "Use a natural 3:2 landscape composition with the full vehicle visible, realistic perspective, balanced reflections, premium materials, sharp but not overprocessed details, and soft studio lighting.",
    "Avoid stretched proportions, crushed bodywork, warped wheels, exaggerated sci-fi parts, text, labels, people, watermarks, and logos not already implied by the vehicle."
  ].join(" ");
};

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: "Gemini API 키가 아직 연결되지 않았습니다." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const carName = String(payload.carName || "").trim();
  const profileSeed = String(payload.profileSeed || "");

  if (!carName) {
    return json({ error: "carName is required" }, 400);
  }

  const prompt = buildPrompt(carName, profileSeed);
  const seedHash = await hashText(`${carName}|${profileSeed}`);
  const model = env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${prompt}\nRequest id: ${seedHash.slice(0, 16)}` }]
        }]
      })
    });
  } catch (error) {
    return json({ error: "Gemini 이미지 생성 요청에 연결하지 못했습니다." }, 502);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({ error: data.error?.message || "Gemini 이미지 생성에 실패했습니다." }, response.status);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const image = parts.find((part) => part.inlineData?.data);
  if (!image?.inlineData?.data) {
    return json({ error: "Gemini 응답에 이미지가 포함되지 않았습니다." }, 502);
  }

  return json({
    imageUrl: `data:${image.inlineData.mimeType || "image/png"};base64,${image.inlineData.data}`
  });
}
