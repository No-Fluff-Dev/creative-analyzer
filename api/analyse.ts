export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not set in environment" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json();

    // Convert Anthropic-style messages to Gemini format
    const systemPrompt = body.system || "";
    const lastMessage = body.messages[body.messages.length - 1];

    // Build Gemini parts from the message content
    let parts: object[] = [];

    if (typeof lastMessage.content === "string") {
      parts = [{ text: systemPrompt + "\n\n" + lastMessage.content }];
    } else {
      // Handle array content (image + text)
      const textParts = lastMessage.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { text: string }) => ({ text: c.text }));

      const imageParts = lastMessage.content
        .filter((c: { type: string }) => c.type === "image")
        .map((c: { source: { media_type: string; data: string } }) => ({
          inline_data: {
            mime_type: c.source.media_type,
            data: c.source.data,
          },
        }));

      parts = [{ text: systemPrompt }, ...imageParts, ...textParts];
    }

    const geminiBody = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: body.max_tokens || 2000,
        temperature: 0.4,
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.error?.message || "Gemini API error" }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Convert Gemini response back to Anthropic-style format
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const anthropicStyle = {
      content: [{ type: "text", text }],
    };

    return new Response(JSON.stringify(anthropicStyle), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

//Anthropic setings
// export async function POST(req: Request) {
//   try {
//     const apiKey = process.env.ANTHROPIC_API_KEY;

//     if (!apiKey) {
//       return new Response(
//         JSON.stringify({
//           error: "ANTHROPIC_API_KEY is not set in environment",
//         }),
//         {
//           status: 500,
//           headers: { "Content-Type": "application/json" },
//         },
//       );
//     }

//     const body = await req.json();

//     const response = await fetch("https://api.anthropic.com/v1/messages", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "x-api-key": apiKey,
//         "anthropic-version": "2023-06-01",
//       },
//       body: JSON.stringify(body),
//     });

//     const data = await response.json();
//     return new Response(JSON.stringify(data), {
//       status: response.status,
//       headers: { "Content-Type": "application/json" },
//     });
//   } catch (error: any) {
//     return new Response(JSON.stringify({ error: error.message }), {
//       status: 500,
//       headers: { "Content-Type": "application/json" },
//     });
//   }
// }
