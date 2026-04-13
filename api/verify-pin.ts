export async function POST(req: Request) {
  try {
    const { pin } = await req.json();
    const adminPin = process.env.ADMIN_PIN;

    if (!adminPin) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin PIN not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const ok = pin === adminPin;

    return new Response(JSON.stringify({ ok }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
