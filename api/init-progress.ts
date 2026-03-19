import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initStudentProgress } from "../lib/notion";

/* 
	DATA:

	data: {
		object: 'page',
		id: '32878666-e07f-80fc-aca6-eb1532854985',
		created_time: '2026-03-19T02:14:00.000Z',
		last_edited_time: '2026-03-19T02:14:00.000Z',
		created_by: { object: 'user', id: 'bbf63052-7297-4d97-97b4-8aff89a8c9a7' },
		last_edited_by: { object: 'user', id: 'bbf63052-7297-4d97-97b4-8aff89a8c9a7' },
		cover: null,
		icon: null,
		parent: {
			type: 'data_source_id',
			data_source_id: '32878666-e07f-805e-9c32-000bef2d0e83',
			database_id: '32878666-e07f-80f6-bec1-d03dce9c2eeb'
		},
		in_trash: false,
		is_archived: false,
		is_locked: false,
		properties: { 'Criado por': [Object] },
		url: 'https://www.notion.so/Eduardo-Maciel-Alexandre-32878666e07f80fcaca6eb1532854985',
		public_url: null,
		request_id: 'fdba9659-8fdb-46a6-984b-be1fe770beac'
	}
*/

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

	const { created_by } = req.body.data as { created_by: { id: string } };
	if (!created_by?.id) {
		return res
			.status(400)
			.json({ error: "O campo created_by é obrigatório." });
	}

	try {
		const result = await initStudentProgress(created_by.id);
		return res.status(200).json(result);
	} catch (err: unknown) {
		console.error(err);
		const message = err instanceof Error ? err.message : "Erro interno.";
		return res.status(500).json({ error: message });
	}
}
