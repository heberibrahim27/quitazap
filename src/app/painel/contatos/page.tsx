import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TIPOS_CONTATO, LABEL_TIPO_CONTATO, normalizarContato, type TipoContato } from "@/lib/contatos-sociais";
import { ExcluirForm } from "@/components/ExcluirForm";
import { IconLink, IconPlus, IconCheckCircle, IconAlertTriangle } from "@/components/icons";

const MENSAGEM_ERRO: Record<string, string> = {
  nome: "Informe um nome pra identificar o canal.",
};

function revalidarConsumidoresPublicos() {
  revalidatePath("/painel/contatos");
  revalidatePath("/");
  revalidatePath("/privacidade");
  revalidatePath("/dashboard/plano");
}

export default async function ContatosSociaisPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { ok, erro } = await searchParams;

  const contatos = await prisma.contatoSocial.findMany({ orderBy: { ordem: "asc" } });

  async function criarContato(formData: FormData) {
    "use server";

    const tipo = String(formData.get("tipo") || "");
    const nome = String(formData.get("nome") || "").trim();
    const valorBruto = String(formData.get("valorBruto") || "").trim();

    if (!nome) redirect("/painel/contatos?erro=nome");

    const normalizado = normalizarContato(tipo, valorBruto);
    if (!normalizado.ok) redirect(`/painel/contatos?erro=${encodeURIComponent(normalizado.erro)}`);

    const ultimaOrdem = await prisma.contatoSocial.count();
    await prisma.contatoSocial.create({
      data: { tipo, nome, valorBruto, link: normalizado.link, ordem: ultimaOrdem },
    });

    revalidarConsumidoresPublicos();
    redirect("/painel/contatos?ok=criado");
  }

  async function alternarAtivo(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const ativoAtual = formData.get("ativoAtual") === "1";

    await prisma.contatoSocial.update({ where: { id }, data: { ativo: !ativoAtual } });

    revalidarConsumidoresPublicos();
    redirect("/painel/contatos");
  }

  async function excluirContato(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));

    await prisma.contatoSocial.delete({ where: { id } });

    revalidarConsumidoresPublicos();
    redirect("/painel/contatos?ok=excluido");
  }

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Contatos / Redes Sociais</h1>
          <p className="qa-page-subtitle">
            Canais mostrados no rodapé do site, na Política de Privacidade e no plano do Cobrador.
            Sem nenhum canal ativo, esses blocos ficam ocultos automaticamente.
          </p>
        </div>
      </div>

      {ok === "criado" && (
        <div className="qa-alert qa-alert-emerald" style={{ marginBottom: 16 }}>
          <IconCheckCircle size={16} /> Canal cadastrado com sucesso.
        </div>
      )}
      {ok === "excluido" && (
        <div className="qa-alert qa-alert-emerald" style={{ marginBottom: 16 }}>
          <IconCheckCircle size={16} /> Canal removido.
        </div>
      )}
      {erro && (
        <div className="qa-alert qa-alert-red" style={{ marginBottom: 16 }}>
          <IconAlertTriangle size={16} /> {MENSAGEM_ERRO[erro] ?? erro}
        </div>
      )}

      <div className="qa-card" style={{ maxWidth: 520, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span className="qa-nav-icon"><IconLink size={16} /></span>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Novo canal</h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--qa-gray-400)", marginBottom: 18 }}>
          Pra WhatsApp, digite o número com DDD (e o 55 do Brasil, se for o caso). Pra e-mail, digite o e-mail.
          Pra redes sociais, digite o link completo ou o endereço do perfil.
        </p>

        <form action={criarContato} style={{ display: "grid", gap: 16 }}>
          <label className="qa-label">
            Tipo de canal
            <select name="tipo" defaultValue={TIPOS_CONTATO[0]} required className="qa-input">
              {TIPOS_CONTATO.map((tipo) => (
                <option key={tipo} value={tipo}>{LABEL_TIPO_CONTATO[tipo]}</option>
              ))}
            </select>
          </label>
          <div className="qa-input-group">
            <input type="text" name="nome" placeholder=" " required />
            <label>Nome de exibição (ex: "Suporte QuitaZAP")</label>
          </div>
          <div className="qa-input-group">
            <input type="text" name="valorBruto" placeholder=" " required />
            <label>Número, e-mail ou link</label>
          </div>
          <button type="submit" className="qa-btn-primary" style={{ marginTop: 4 }}>
            <IconPlus size={15} /> Adicionar canal
          </button>
        </form>
      </div>

      <div className="qa-card">
        {contatos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>Nenhum canal cadastrado ainda</p>
            <p style={{ margin: 0, color: "var(--qa-gray-400)" }}>
              Os campos de contato no site e no app ficam ocultos até você cadastrar o primeiro canal aqui.
            </p>
          </div>
        ) : (
          <div>
            {contatos.map((contato) => (
              <div key={contato.id} className="qa-list-row" style={{ cursor: "default" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <strong style={{ fontSize: 14.5 }}>{contato.nome}</strong>
                    <span className="qa-badge qa-badge-blue">{LABEL_TIPO_CONTATO[contato.tipo as TipoContato] ?? contato.tipo}</span>
                    <span className={`qa-badge ${contato.ativo ? "qa-badge-emerald" : ""}`}>
                      {contato.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <a href={contato.link} target="_blank" rel="noreferrer" style={{ display: "block", color: "var(--qa-gray-400)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {contato.link}
                  </a>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <form action={alternarAtivo}>
                    <input type="hidden" name="id" value={contato.id} />
                    <input type="hidden" name="ativoAtual" value={contato.ativo ? "1" : "0"} />
                    <button type="submit" className="qa-btn-secondary">
                      {contato.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                  <ExcluirForm
                    action={excluirContato}
                    fields={{ id: contato.id }}
                    mensagem={`Remover o canal "${contato.nome}"? Essa ação não pode ser desfeita.`}
                    tamanho="pequeno"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
