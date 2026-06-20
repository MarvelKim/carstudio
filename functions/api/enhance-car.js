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
  if (!env.OPENAI_API_KEY) {
    return json({ error: "OpenAI API 키가 아직 연결되지 않았습니다." }, 500);
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
  const model = env.OPENAI_IMAGE_MODEL || "gpt-image-1";

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1536x1024",
        quality: "high",
        output_format: "webp",
        n: 1,
        user: seedHash.slice(0, 64)
      })
    });
  } catch (error) {
    return json({ error: "OpenAI image generation request failed" }, 502);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({ error: data.error?.message || "OpenAI image generation failed" }, response.status);
  }

  const image = data.data?.[0];
  if (image?.url) {
    return json({ imageUrl: image.url });
  }

  if (!image?.b64_json) {
    return json({ error: "OpenAI response did not include an image" }, 502);
  }

  return json({
    imageUrl: `data:image/webp;base64,${image.b64_json}`
  });
}
