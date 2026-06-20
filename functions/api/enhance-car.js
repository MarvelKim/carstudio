import { createCarAiImage } from "../../make-car-ai.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

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
  const carImageUrl = String(payload.carImageUrl || "").trim();

  if (!carName) {
    return json({ error: "carName is required" }, 400);
  }

  try {
    const result = await createCarAiImage({
      apiKey: env.GEMINI_API_KEY,
      carName,
      profileSeed,
      sourceImageUrl: carImageUrl,
      model: env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
      fetchImpl: fetch
    });

    return json({ imageUrl: result.imageUrl });
  } catch (error) {
    return json({ error: error.message || "Gemini 이미지 생성에 실패했습니다." }, 502);
  }
}
