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

  const nome     = String(formData.get("nome") || "").trim();
  const telefone = String(formData.get("telefone") || "").trim();
  const cpf      = String(formData.get("cpf") || "").trim();
  const email    = String(formData.get("email") || "").trim();
  const obs      = String(formData.get("obs") || "").trim();
  const ativarBot = formData.get("ativarBot") === "on";
  const gratuito  = formData.get("gratuito") === "on";

  const rendaTexto    = String(formData.get("rendaMensal") || "").replace(",", ".");
  const despesasTexto = String(formData.get("despesasFixas") || "").replace(",", ".");
  const dispTexto     = String(formData.get("valorDisponivelMensal") || "").replace(",", ".");
  const statusAtend   = String(formData.get("statusAtendimento") || "NOVO");

  if (!nome || !telefone) throw new Error("Nome e telefone são obrigatórios.");

  const cliente = await prisma.cliente.create({
    data: {
      nome,
      telefone,
      cpf:   cpf   || null,
      email: email || null,
      obs:   obs   || null,
      gratuito,
      statusAtendimento: statusAtend,
      rendaMensal:           rendaTexto    ? Number(rendaTexto)    : null,
      despesasFixas:         despesasTexto ? Number(despesasTexto) : null,
      valorDisponivelMensal: dispTexto     ? Number(dispTexto)     : null,
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
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Novo cliente</h1>
          <p className="page-subtitle">Cadastre os dados do cliente atendido pelo QuitaZAP.</p>
        </div>

        <form action={criarCliente} style={formStyle}>

          {/* ── Dados básicos ── */}
          <h3 style={sectionTitle}>Dados básicos</h3>

          <label style={labelStyle}>
            Nome *
            <input name="nome" required placeholder="Ex: João Silva" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Telefone / WhatsApp *
            <input name="telefone" required placeholder="Ex: 71999999999 (com DDD, sem +55)" style={inputStyle} />
          </label>

          <div style={gridDois}>
            <label style={labelStyle}>
              CPF
              <input name="cpf" placeholder="Opcional" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              E-mail
              <input name="email" type="email" placeholder="Opcional" style={inputStyle} />
            </label>
          </div>

          <label style={labelStyle}>
            Status de atendimento
            <select name="statusAtendimento" defaultValue="NOVO" style={inputStyle}>
              <option value="NOVO">🆕 Novo</option>
              <option value="AGUARDANDO_INFORMACOES">⏳ Aguardando informações</option>
              <option value="PLANO_GERADO">📋 Plano gerado</option>
              <option value="ACOMPANHAMENTO">🔄 Acompanhamento</option>
              <option value="ENCERRADO">✅ Encerrado</option>
            </select>
          </label>

          <label style={labelStyle}>
            Observações
            <textarea name="obs" placeholder="Resumo da situação do cliente" rows={3} style={inputStyle} />
          </label>

          {/* ── Contexto financeiro ── */}
          <h3 style={{ ...sectionTitle, marginTop: 8 }}>
            Contexto financeiro{" "}
            <span style={{ fontWeight: 400, fontSize: 13, color: "#94a3b8" }}>(opcional)</span>
          </h3>

          <div style={gridDois}>
            <label style={labelStyle}>
              Renda mensal
              <input name="rendaMensal" type="text" placeholder="Ex: 3000,00" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Despesas fixas mensais
              <input name="despesasFixas" type="text" placeholder="Ex: 1500,00" style={inputStyle} />
            </label>
          </div>

          <label style={labelStyle}>
            Valor disponível por mês para pagar dívidas
            <input name="valorDisponivelMensal" type="text" placeholder="Ex: 500,00" style={inputStyle} />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Se preenchido, será usado como base do cenário realista no plano.
            </span>
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
                Marque para família e amigos. Não contabiliza nas receitas e exibe "Gratuito" no perfil.
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
                O bot envia automaticamente a mensagem de boas-vindas com as perguntas de perfil.
                Use para amigos, familiares ou qualquer cliente adicionado manualmente.
              </span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
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
  padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", display: "grid", gap: 16,
};
const sectionTitle: React.CSSProperties = {
  margin: "4px 0 0", fontSize: 15, fontWeight: 700, color: "#0f172a",
  borderBottom: "1px solid #f1f5f9", paddingBottom: 8,
};
const gridDois: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 6, color: "#0f172a", fontWeight: "bold", fontSize: 14 };
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #cbd5e1", borderRadius: 12,
  padding: "11px 14px", fontSize: 15, outline: "none", background: "#ffffff", color: "#0f172a",
};
const btnPrimary: React.CSSProperties = {
  background: "#16a34a", color: "#ffffff", border: "none",
  padding: "12px 20px", borderRadius: 12, fontWeight: "bold", cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#e2e8f0", color: "#0f172a", padding: "12px 20px", borderRadius: 12, fontWeight: "bold",
};
