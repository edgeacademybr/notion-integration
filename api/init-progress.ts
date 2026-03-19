import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initStudentProgress } from "../lib/notion";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ error: "Método não permitido." });
	}

	const secret = req.headers["x-webhook-secret"];
	if (secret !== process.env.WEBHOOK_SECRET) {
		return res.status(401).json({ error: "Não autorizado." });
	}

	const { userId } = req.body as { userId?: string };
	if (!userId) {
		return res.status(400).json({ error: "O campo userId é obrigatório." });
	}

	try {
		const result = await initStudentProgress(userId);
		return res.status(200).json(result);
	} catch (err: unknown) {
		console.error(err);
		const message = err instanceof Error ? err.message : "Erro interno.";
		return res.status(500).json({ error: message });
	}
}
