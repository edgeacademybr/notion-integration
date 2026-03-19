import { Client } from "@notionhq/client";

// ─── Database IDs ─────────────────────────────────────────────────────────────
const DB_ALUNOS =
	process.env.NOTION_DB_ALUNOS ?? "c2678666e07f82789d9a015c65cc7a69";
const DB_AULAS =
	process.env.NOTION_DB_AULAS ?? "cfc78666e07f8237b2a381fcef970b25";
const DB_PROGRESSO =
	process.env.NOTION_DB_PROGRESSO ?? "ff678666e07f838e983b0174338fec58";

// ─── Exact property names ─────────────────────────────────────────────────────
const PROP = {
	AULA_NUMBER: "Número",
	PROG_ALUNO: "Aluno",
	PROG_AULA: "Aula",
	PROG_STATUS: "Status",
	STATUS_NOT_STARTED: "Não iniciado",
	STATUS_IN_PROGRESS: "Em andamento",
} as const;

// ─── SDK v5 with API version 2026-03-11 ───────────────────────────────────────
const notion = new Client({
	auth: process.env.NOTION_TOKEN as string,
	notionVersion: "2026-03-11",
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lesson {
	id: string;
	number: number;
}

interface NotionPage {
	id: string;
	properties: Record<string, NotionProperty>;
}

// Discriminated union — each member has a unique literal "type" field,
// which allows TypeScript to narrow correctly inside if/switch blocks
type NotionProperty =
	| { type: "number"; number: number | null }
	| { type: "relation"; relation: Array<{ id: string }> }
	| { type: "people"; people: Array<{ id: string }> }
	| { type: "status"; status: { name: string } | null };

interface DataSourceQueryResponse {
	results: NotionPage[];
	has_more: boolean;
	next_cursor: string | null;
}

interface DatabaseResponse {
	data_sources: Array<{ id: string; name: string }>;
}

interface PageResponse {
	created_by: { id: string };
}

// ─── Retrieve the first data source ID for a given database ──────────────────
async function getDataSourceId(databaseId: string): Promise<string> {
	const db = (await notion.databases.retrieve({
		database_id: databaseId,
	})) as unknown as DatabaseResponse;

	const dataSource = db.data_sources?.[0];
	if (!dataSource) {
		throw new Error(
			`Nenhum data source encontrado para a database: ${databaseId}`,
		);
	}

	return dataSource.id;
}

// ─── Query a data source with pagination support ──────────────────────────────
async function queryDataSource(
	dataSourceId: string,
	body: Record<string, unknown>,
): Promise<DataSourceQueryResponse> {
	return notion.request<DataSourceQueryResponse>({
		method: "post",
		path: `data_sources/${dataSourceId}/query`,
		body,
	});
}

// ─── Cast raw API property to our discriminated union (or undefined) ──────────
function castProperty(raw: unknown): NotionProperty | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const p = raw as Record<string, unknown>;

	switch (p["type"]) {
		case "number":
			return {
				type: "number",
				number: typeof p["number"] === "number" ? p["number"] : null,
			};
		case "relation":
			return {
				type: "relation",
				relation: Array.isArray(p["relation"])
					? (p["relation"] as Array<{ id: string }>)
					: [],
			};
		case "people":
			return {
				type: "people",
				people: Array.isArray(p["people"])
					? (p["people"] as Array<{ id: string }>)
					: [],
			};
		case "status": {
			const s = p["status"];
			return {
				type: "status",
				status:
					s && typeof s === "object" ? (s as { name: string }) : null,
			};
		}
		default:
			return undefined;
	}
}

// ─── Fetch all lessons ordered by Número ─────────────────────────────────────
async function fetchAllLessons(): Promise<Lesson[]> {
	const dataSourceId = await getDataSourceId(DB_AULAS);
	const lessons: Lesson[] = [];
	let cursor: string | undefined;

	do {
		const body: Record<string, unknown> = {
			sorts: [{ property: PROP.AULA_NUMBER, direction: "ascending" }],
			page_size: 100,
			...(cursor && { start_cursor: cursor }),
		};

		const response = await queryDataSource(dataSourceId, body);

		for (const page of response.results) {
			const prop = castProperty(page.properties[PROP.AULA_NUMBER]);
			const number = prop?.type === "number" ? (prop.number ?? 0) : 0;
			lessons.push({ id: page.id, number });
		}

		cursor = response.has_more
			? (response.next_cursor ?? undefined)
			: undefined;
	} while (cursor);

	return lessons;
}

// ─── Fetch lesson IDs that already have a progress entry for this user ────────
async function fetchExistingLessonIds(
	notionUserId: string,
): Promise<Set<string>> {
	const dataSourceId = await getDataSourceId(DB_PROGRESSO);
	const lessonIds = new Set<string>();
	let cursor: string | undefined;

	do {
		const body: Record<string, unknown> = {
			filter: {
				property: PROP.PROG_ALUNO,
				people: { contains: notionUserId },
			},
			page_size: 100,
			...(cursor && { start_cursor: cursor }),
		};

		const response = await queryDataSource(dataSourceId, body);

		for (const page of response.results) {
			const prop = castProperty(page.properties[PROP.PROG_AULA]);
			if (prop?.type !== "relation") continue;
			for (const rel of prop.relation) {
				lessonIds.add(rel.id);
			}
		}

		cursor = response.has_more
			? (response.next_cursor ?? undefined)
			: undefined;
	} while (cursor);

	return lessonIds;
}

// ─── Create a single progress entry ──────────────────────────────────────────
async function createProgressEntry(
	notionUserId: string,
	lessonId: string,
	dataSourceId: string,
	status: string,
): Promise<void> {
	await notion.request({
		method: "post",
		path: "pages",
		body: {
			parent: {
				type: "data_source_id",
				data_source_id: dataSourceId,
			},
			properties: {
				[PROP.PROG_ALUNO]: {
					type: "people",
					people: [{ object: "user", id: notionUserId }],
				},
				[PROP.PROG_AULA]: {
					type: "relation",
					relation: [{ id: lessonId }],
				},
				[PROP.PROG_STATUS]: {
					type: "status",
					status: { name: status },
				},
			},
		},
	});
}

// ─── Create entries in batches to avoid API rate limits ──────────────────────
async function createEntriesInBatches(
	notionUserId: string,
	lessons: Lesson[],
	progressDataSourceId: string,
	batchSize = 5,
): Promise<void> {
	for (let i = 0; i < lessons.length; i += batchSize) {
		const batch = lessons.slice(i, i + batchSize);

		await Promise.all(
			batch.map((lesson, indexInBatch) => {
				const isFirst = i === 0 && indexInBatch === 0;
				const status = isFirst
					? PROP.STATUS_IN_PROGRESS
					: PROP.STATUS_NOT_STARTED;
				return createProgressEntry(
					notionUserId,
					lesson.id,
					progressDataSourceId,
					status,
				);
			}),
		);
	}
}

// ─── Main exported function ───────────────────────────────────────────────────
export async function initStudentProgress(notionUserId: string): Promise<{
	message: string;
	created: number;
	alreadyExisted: number;
}> {
	if (!process.env.NOTION_TOKEN) {
		throw new Error(
			"A variável de ambiente NOTION_TOKEN não está definida.",
		);
	}

	const [allLessons, existingLessonIds, progressDataSourceId] =
		await Promise.all([
			fetchAllLessons(),
			fetchExistingLessonIds(notionUserId),
			getDataSourceId(DB_PROGRESSO),
		]);

	if (allLessons.length === 0) {
		throw new Error("Nenhuma aula encontrada na database.");
	}

	const missedLessons = allLessons.filter(
		(l) => !existingLessonIds.has(l.id),
	);

	if (missedLessons.length === 0) {
		return {
			message: "Progresso já inicializado para todas as aulas.",
			created: 0,
			alreadyExisted: existingLessonIds.size,
		};
	}

	await createEntriesInBatches(
		notionUserId,
		missedLessons,
		progressDataSourceId,
	);

	return {
		message: "Progresso inicializado com sucesso.",
		created: missedLessons.length,
		alreadyExisted: existingLessonIds.size,
	};
}
