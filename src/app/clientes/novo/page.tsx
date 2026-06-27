import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone } from "@/lib/zapi";

function msgBoasVindas(nome: string): string {
  return `Olá, ${nome}! 👋

Sou o *QuitaZAP*, seu consultor financeiro pessoal via WhatsApp.

Estou aqui para te ajudar a organizar suas dívidas e montar um plano claro de quitação — sem complicação.

Antes de começar, me conta um pouco sobre você:

1️⃣ Qual é seu *vínculo profissional*?
_(Ex: CLT, autônomo, MEI, empresário, desempregado)_

2️⃣ Qual é seu *objetivo principal* agora?
_(Ex: quitar dívidas, organizar as contas, criar uma reserva, investir)_

3️⃣ Você tem *dependentes*?
_(Filhos, cônjuge ou outras pessoas que dependem da sua renda)_

Pode responder as três de uma vez! 😊`;
}

async function criarCliente(formData: FormData) {
  "use server";

  const nome      = String(formData.get("nome") || "").trim();
  const telefone  = String(formData.get("telefone") || "").trim();
  const cpf       = String(formData.get("cpf") || "").trim();
  const email     = String(formData.get("email") || "").trim();
  const obs       = String(formData.get("obs") || "").trim();
  const ativarBot = formData.get("ativarBot") === "on";
  const gratuito  = formData.get("gratuito") === "on";

  if (!nome || !telefone) throw new Error("Nome e telefone são obrigatórios.");

  const cliente = await prisma.cliente.create({
    data: {
      nome,
      telefone,
      cpf:   cpf   || null,
      email: email || null,
      obs:   obs   || null,
      gratuito,
      statusAtendimento: "NOVO",
    },
  });

  if (ativarBot) {
    const tel = normalizarTelefone(telefone);
    const boasVindas = msgBoasVindas(nome);

    await prisma.botSessao.upsert({
      where: { telefone: tel },
      create: {
        telefone: tel,
        clienteId: cliente.id,
        etapa: "CONVERSANDO",
        nome,
        dividasTemp: JSON.stringify([{ role: "assistant", content: boasVindas }]),
      },
      update: {
        clienteId: cliente.id,
        etapa: "CONVERSANDO",
        nome,
        dividasTemp: JSON.stringify([{ role: "assistant", content: boasVindas }]),
        renda: null,
      },
    });

    try {
      await sendWhatsApp(tel, boasVindas);
    } catch (e) {
      console.error("[NovoCliente] Erro ao enviar WhatsApp:", e);
    }
  }

  redirect("/clientes?ok=criado");
}

export default function NovoClientePage() {
  return (
    <main className="page-shell">
      <section style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Novo cliente</h1>
          <p className="page-subtitle">Cadastre manualmente um cliente no QuitaZAP.</p>
        </div>

        <form action={criarCliente} style={formStyle}>

          <label style={labelStyle}>
            Nome *
            <input name="nome" required placeholder="Ex: João Silva" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Telefone / WhatsApp *
            <input name="telefone" required placeholder="Ex: 71999999999 (com DDD, sem +55)" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            CPF
            <input name="cpf" placeholder="Opcional" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            E-mail
            <input name="email" type="email" placeholder="Opcional" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Observações
            <textarea name="obs" placeholder="Anotações internas" rows={3} style={inputStyle} />
          </label>

          {/* ── Gratuito ── */}
          <div style={{
            background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12,
            padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <input
              type="checkbox"
              name="gratuito"
              id="gratuito"
              style={{ marginTop: 2, width: 18, height: 18, cursor: "pointer", accentColor: "#2563eb" }}
            />
            <label htmlFor="gratuito" style={{ cursor: "pointer" }}>
              <strong style={{ fontSize: 14, color: "#1e40af", display: "block", marginBottom: 2 }}>
                🎁 Acesso gratuito
              </strong>
              <span style={{ fontSize: 13, color: "#1d4ed8" }}>
                Família e amigos — não contabiliza na receita.
              </span>
            </label>
          </div>

          {/* ── Ativar bot ── */}
          <div style={{
            background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12,
            padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <input
              type="checkbox"
              name="ativarBot"
              id="ativarBot"
              style={{ marginTop: 2, width: 18, height: 18, cursor: "pointer", accentColor: "#16a34a" }}
            />
            <label htmlFor="ativarBot" style={{ cursor: "pointer" }}>
              <strong style={{ fontSize: 14, color: "#14532d", display: "block", marginBottom: 2 }}>
                📲 Iniciar conversa no WhatsApp
              </strong>
              <span style={{ fontSize: 13, color: "#166534" }}>
                O bot envia as boas-vindas com as perguntas de perfil automaticamente.
              </span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="submit" style={btnPrimary}>Salvar cliente</button>
            <Link href="/clientes" style={btnSecondary}>Cancelar</Link>
          </div>

        </form>
      </section>
    </main>
  );
}

const formStyle: React.CSSProperties = {
  background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 20,
  padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", display: "grid", gap: 18,
};
const labelStyle: React.CSSProperties = { display: "grid", gap: 8, color: "#0f172a", fontWeight: 600, fontSize: 14 };
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #cbd5e1", borderRadius: 12,
  padding: "11px 14px", fontSize: 15, outline: "none", background: "#ffffff", color: "#0f172a",
};
const btnPrimary: React.CSSProperties = {
  background: "#16a34a", color: "#ffffff", border: "none",
  padding: "12px 20px", borderRadius: 12, fontWeight: 700, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#e2e8f0", color: "#0f172a", padding: "12px 20px", borderRadius: 12, fontWeight: 700,
};
