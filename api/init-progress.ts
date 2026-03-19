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

	console.log("Recebido webhook para inicializar progresso do aluno.");
	console.log("Payload:", req.body);

	// The Notion automation sends {{current page.id}} — the Alunos database row.
	// The script resolves the Notion User ID from that page's created_by field.
	const { pageId } = req.body as { pageId?: string };
	if (!pageId) {
		return res.status(400).json({ error: "O campo pageId é obrigatório." });
	}

	try {
		const result = await initStudentProgress(pageId);
		return res.status(200).json(result);
	} catch (err: unknown) {
		console.error(err);
		const message = err instanceof Error ? err.message : "Erro interno.";
		return res.status(500).json({ error: message });
	}
}
