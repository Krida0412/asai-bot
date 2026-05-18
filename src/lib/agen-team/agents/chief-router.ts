/**
 * Chief Router — ported from python-engine/app/crews/main_crew/chief_agent.py
 * handle_chief_conversation() function.
 * Routes user natural language to structured intent using Mistral LLM.
 *
 * @deprecated Agentic Chief v3 routes production traffic through
 * `src/lib/agen-team/chief/scope-router.ts` and
 * `/api/agen-team/chief-chat`. This legacy LangChain router is retained
 * only for dev tooling behind `AGEN_TEAM_LEGACY_API_ENABLED=true`.
 */
import { ChatMistralAI } from "@langchain/mistralai";
import {
  ChiefMessageResponseSchema,
  type ChiefMessageResponse,
} from "../schemas";

const SYSTEM_PROMPT = `Anda adalah Chief Agent (CEO) di AI Company MVP.
Tujuan Anda adalah menavigasi percakapan dengan 'Direktur' (pengguna) untuk memahami tugas eksekusi.
Keahlian sistem saat ini adalah:
1. Intelligence: Riset internet (tren, fakta komprehensif), mencari aset foto.
2. Marketing: Menulis copywriting berdasarkan data intelijen (Instagram/Medsos tunggal atau carousel), lalu menyimpannya sebagai Draft untuk Persetujuan.
3. Operations: Melaporkan audit biaya penggunaan dan statistik task.

Jika pengguna meminta sesuatu di luar ini (seperti koding, puisi, curhat), tolak dengan sopan dan kembalikan ke lingkup operasional kita.
Tentukan balasan (messageText) yang berwibawa namun asisten.
Tentukan opsi (options) maksimal 3 kalimat klik-cepat untuk memandu user. Boleh kosong jika aksi butuh konfirmasi.
Set 'requiresAction' menjadi True HANYA jika pengguna konfirmasi 'Kerjakan' / 'Mulai Riset' atau instruksi yang sudah jelas topiknya dan mereka ingin Anda menjadikannya eksekusi task final.
Jika requiresAction True, pastikan metadata diisi dengan intent ('research_only', 'full_auto_publish', atau 'ask_operations_cost') beserta 'topic' (topik inti).`;

/**
 * Handles the interactive Chief conversation before task execution.
 * Parses natural language to extract intent, required actions, and generated dialogue.
 */
export async function handleChiefConversation(
  _userId: string,
  message: string,
  _sessionId?: string,
): Promise<ChiefMessageResponse> {
  if (process.env.AGEN_TEAM_LEGACY_API_ENABLED !== "true") {
    console.warn("legacy chief router called without flag");
    return {
      messageText:
        "Chief legacy router sudah dinonaktifkan. Gunakan Chief Chat v3.",
      options: [],
      state: "Deprecated",
      requiresAction: false,
    };
  }

  try {
    const llm = new ChatMistralAI({
      model: "mistral-large-latest",
      temperature: 0.3,
    });

    const structuredLlm = llm.withStructuredOutput(ChiefMessageResponseSchema);

    const response = await structuredLlm.invoke([
      ["system", SYSTEM_PROMPT],
      ["human", message],
    ]);

    return response as ChiefMessageResponse;
  } catch (e: any) {
    console.error("LLM Routing Error:", e);
    return {
      messageText: `Terjadi kesalahan saat memproses niat Anda, Direktur. (${e.message})`,
      options: ["Mulai ulang instruksi terakhir", "Kembali ke Menu Utama"],
      state: "Error",
      requiresAction: false,
    };
  }
}
