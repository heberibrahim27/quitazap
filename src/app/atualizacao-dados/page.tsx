"use client";

import { useEffect, useState } from "react";
import { PLANILHAS_ANALYTICS } from "@/lib/analytics-planilhas";
import { IconUpload, IconCheckCircle } from "@/components/icons";

type StatusPlanilha = {
  nomeArquivo: string;
  totalLinhas: number;
  atualizadoEm: string;
} | null;

type EstadoEnvio = "idle" | "enviando" | "sucesso" | "erro";

function fmtData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function AtualizacaoDadosPage() {
  const [status, setStatus] = useState<Record<string, StatusPlanilha>>({});
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [envio, setEnvio] = useState<Record<string, EstadoEnvio>>({});
  const [erro, setErro] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all(
      PLANILHAS_ANALYTICS.map((p) =>
        fetch(`/api/analytics-planilhas/${p.chave}`)
          .then((r) => (r.ok ? r.json() : { registro: null }))
          .then((d) => [p.chave, d.registro as StatusPlanilha] as const)
      )
    ).then((entradas) => {
      setStatus(Object.fromEntries(entradas));
      setCarregando(false);
    });
  }, []);

  async function enviarArquivo(chave: string, arquivo: File) {
    setEnvio((s) => ({ ...s, [chave]: "enviando" }));
    setErro((e) => ({ ...e, [chave]: "" }));

    const formData = new FormData();
    formData.append("arquivo", arquivo);

    try {
      const res = await fetch(`/api/analytics-planilhas/${chave}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao importar o arquivo.");

      setStatus((s) => ({
        ...s,
        [chave]: { nomeArquivo: data.nomeArquivo, totalLinhas: data.totalLinhas, atualizadoEm: data.atualizadoEm },
      }));
      setEnvio((s) => ({ ...s, [chave]: "sucesso" }));
    } catch (e) {
      setErro((s) => ({ ...s, [chave]: e instanceof Error ? e.message : "Falha ao importar o arquivo." }));
      setEnvio((s) => ({ ...s, [chave]: "erro" }));
    }
  }

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Atualização de dados</h1>
          <p className="qa-page-subtitle">
            Importe as planilhas do Analytics para atualizar os cards do Dashboard.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {PLANILHAS_ANALYTICS.map((p) => {
          const reg = status[p.chave];
          const estaAberta = aberta === p.chave;
          const estadoEnvio = envio[p.chave] ?? "idle";

          return (
            <div key={p.chave} className="qa-card" style={{ padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => setAberta(estaAberta ? null : p.chave)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "16px 18px", background: "none", border: "none", cursor: "pointer",
                  textAlign: "left", fontFamily: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: "var(--qa-blue-soft)", color: "#7dc4ff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <IconUpload size={18} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: 14.5 }}>{p.nome}</strong>
                    <span style={{ fontSize: 12.5, color: "var(--qa-gray-400)" }}>{p.descricao}</span>
                  </div>
                </div>

                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  {carregando ? (
                    <span style={{ fontSize: 12, color: "var(--qa-gray-400)" }}>...</span>
                  ) : reg ? (
                    <span className="qa-badge qa-badge-emerald">
                      <IconCheckCircle size={11} /> {fmtData(reg.atualizadoEm)}
                    </span>
                  ) : (
                    <span className="qa-badge qa-badge-amber">Nunca importada</span>
                  )}
                </div>
              </button>

              {estaAberta && (
                <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    {reg && (
                      <p style={{ margin: 0, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
                        Última importação: <strong>{reg.nomeArquivo}</strong> · {reg.totalLinhas} linha{reg.totalLinhas !== 1 ? "s" : ""}
                      </p>
                    )}

                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      disabled={estadoEnvio === "enviando"}
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        if (arquivo) enviarArquivo(p.chave, arquivo);
                        e.target.value = "";
                      }}
                      style={{ fontSize: 13, color: "var(--qa-gray-300)" }}
                    />

                    {estadoEnvio === "enviando" && (
                      <p style={{ margin: 0, fontSize: 12.5, color: "#7dc4ff" }}>Importando e atualizando os cards...</p>
                    )}
                    {estadoEnvio === "sucesso" && (
                      <p style={{ margin: 0, fontSize: 12.5, color: "#6ee7b7" }}>Importado com sucesso — os cards do Dashboard já foram atualizados.</p>
                    )}
                    {estadoEnvio === "erro" && (
                      <p style={{ margin: 0, fontSize: 12.5, color: "#fca5a5" }}>{erro[p.chave]}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
