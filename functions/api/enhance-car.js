import { createCarAiImage, createFreeFallbackCarImage } from "../../make-car-ai.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const defaultModels = ["gemini-3.1-flash-image", "gemini-3-pro-image", "gemini-2.5-flash-image"];

const getCandidateModels = (preferredModel) => {
  const models = [preferredModel, ...defaultModels]
    .map((model) => String(model || "").trim())
    .filter(Boolean);
  return [...new Set(models)];
};

const isRetryableGeminiModelError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return [
    "quota",
    "resource_exhausted",
    "rate limit",
    "not found",
    "not supported",
    "permission",
    "response did not include an image"
  ].some((term) => message.includes(term));
};

const userFacingGeminiError = (error) => {
  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("quota") || lowerMessage.includes("resource_exhausted") || lowerMessage.includes("rate limit")) {
    return "현재 연결된 Gemini API 키의 무료 이미지 생성 한도가 소진되었거나 제한되었습니다. 잠시 후 다시 시도하거나 Google AI Studio에서 해당 API 키의 한도/결제 설정을 확인해야 합니다.";
  }

  if (lowerMessage.includes("api key")) {
    return "Gemini API 키가 아직 연결되지 않았습니다.";
  }

  return message || "Gemini 이미지 생성에 실패했습니다.";
};

export async function onRequestPost({ request, env }) {
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
    let lastError;
    const models = getCandidateModels(env.GEMINI_IMAGE_MODEL);

    if (env.GEMINI_API_KEY) {
      for (const model of models) {
        try {
          const result = await createCarAiImage({
            apiKey: env.GEMINI_API_KEY,
            carName,
            profileSeed,
            sourceImageUrl: carImageUrl,
            model,
            fetchImpl: fetch
          });

          return json({ imageUrl: result.imageUrl, model, provider: "gemini" });
        } catch (error) {
          lastError = error;
          if (!isRetryableGeminiModelError(error)) {
            break;
          }
        }
      }
    }

    if (env.DISABLE_FREE_IMAGE_FALLBACK !== "true") {
      const result = await createFreeFallbackCarImage({
        carName,
        profileSeed,
        fetchImpl: fetch
      });

      return json({ imageUrl: result.imageUrl, model: "pollinations-flux", provider: "pollinations" });
    }

    throw lastError || new Error("Gemini API 키가 아직 연결되지 않았습니다.");
  } catch (error) {
    return json({ error: userFacingGeminiError(error) }, 502);
  }
}
