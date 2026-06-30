// ─────────────────────────────────────────
// GET /api/quita-score/[contatoId]
// Retorna PNG de velocímetro com o QuitaScore do contato
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getUsuarioId, erroNaoAutenticado } from "@/lib/get-usuario";
import {
  calcularQuitaScore,
  arcPath,
  scoreParaAngulo,
} from "@/lib/quita-score";

// Prisma requer Node.js runtime (não funciona em Edge)
export const runtime = "nodejs";

// ── Dimensões da imagem ──────────────────
const W = 600;
const H = 380;

// ── Geometria do velocímetro ─────────────
// O gauge ocupa a metade superior de um semicírculo
// Ângulo 180° = esquerda (score 0), 360° = direita (score 1000)
// O topo do arco fica em 270° (ponto mais alto)
const CX = 300; // centro horizontal
const CY = 270; // centro vertical (linha de base do semicírculo)
const R  = 165; // raio do centro do traço
const SW = 55;  // stroke-width (espessura da faixa)

// Zonas de cor [angulo inicio, angulo fim, cor, label]
const ZONAS = [
  { from: 180, to: 252, cor: "#ef4444" }, // 0-400   CRÍTICO
  { from: 252, to: 288, cor: "#f97316" }, // 400-600 REGULAR
  { from: 288, to: 315, cor: "#eab308" }, // 600-750 BOM
  { from: 315, to: 360, cor: "#22c55e" }, // 750-1000 EXCELENTE
];

// ────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contatoId: string }> },
) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const { contatoId } = await params;

  const contato = await prisma.contatoReceber.findFirst({
    where: { id: contatoId, usuarioId },
    include: {
      pendencias: {
        select: {
          status:    true,
          valor:     true,
          vencimento: true,
          pagoEm:    true,
        },
      },
    },
  });

  if (!contato) {
    return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  }

  const info = calcularQuitaScore(contato.pendencias);

  // ── Geometria do ponteiro ─────────────
  const anguloNeedle = scoreParaAngulo(info.score);
  const toRad = (d: number) => (d * Math.PI) / 180;
  const needleLen = R - 18;
  const nx = CX + needleLen * Math.cos(toRad(anguloNeedle));
  const ny = CY + needleLen * Math.sin(toRad(anguloNeedle));

  // Arco inativo (da posição atual até 360°) — escurece o lado não atingido
  const anguloInativo = scoreParaAngulo(Math.min(info.score, 999));
  const arcoInativo = anguloInativo < 359
    ? arcPath(CX, CY, R, anguloInativo, 360)
    : null;

  // Arco de fundo (semicírculo completo em azul escuro)
  const arcoBg = arcPath(CX, CY, R, 180, 360);

  // Primeiros caracteres do nome para não estourar
  const nomeExibido =
    contato.nome.length > 28 ? contato.nome.slice(0, 26) + "…" : contato.nome;

  // ── Escala: 3 ticks (0, 500, 1000) ───
  const tickPts = [
    { score: 0,    label: "0" },
    { score: 500,  label: "500" },
    { score: 1000, label: "1000" },
  ].map(({ score, label }) => {
    const a = scoreParaAngulo(score);
    const rTick = R + SW / 2 + 18;
    return {
      label,
      x: CX + rTick * Math.cos(toRad(a)),
      y: CY + rTick * Math.sin(toRad(a)),
    };
  });

  // ── JSX → ImageResponse ───────────────
  const image = (
    <div
      style={{
        width:           `${W}px`,
        height:          `${H}px`,
        background:      "linear-gradient(160deg, #0f172a 0%, #1e293b 100%)",
        display:         "flex",
        flexDirection:   "column",
        alignItems:      "center",
        fontFamily:      "sans-serif",
        position:        "relative",
        overflow:        "hidden",
      }}
    >
      {/* Marca d'água / logo */}
      <div
        style={{
          display:       "flex",
          alignItems:    "center",
          marginTop:     "14px",
          gap:           "6px",
        }}
      >
        <span style={{ fontSize: "13px", color: "#334155", letterSpacing: "4px" }}>
          QUITAZAP
        </span>
        <span style={{ fontSize: "13px", color: "#475569", letterSpacing: "4px" }}>
          ·
        </span>
        <span style={{ fontSize: "13px", color: "#334155", letterSpacing: "4px" }}>
          QUITASCORE
        </span>
      </div>

      {/* SVG do velocímetro */}
      <svg
        width={W}
        height="280"
        viewBox={`0 0 ${W} 280`}
        style={{ marginTop: "-10px" }}
      >
        {/* Arco de fundo (semicírculo escuro) */}
        <path
          d={arcoBg}
          stroke="#1e3a5f"
          strokeWidth={SW}
          fill="none"
          strokeLinecap="butt"
        />

        {/* Zonas coloridas */}
        {ZONAS.map((z, i) => (
          <path
            key={i}
            d={arcPath(CX, CY, R, z.from, z.to)}
            stroke={z.cor}
            strokeWidth={SW}
            fill="none"
            strokeLinecap="butt"
            opacity="0.85"
          />
        ))}

        {/* Overlay escuro sobre a parte não atingida */}
        {arcoInativo && (
          <path
            d={arcoInativo}
            stroke="#0f172a"
            strokeWidth={SW}
            fill="none"
            strokeLinecap="butt"
            opacity="0.72"
          />
        )}

        {/* Ticks de referência */}
        {tickPts.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={t.y + 5}
            textAnchor="middle"
            fill="#475569"
            fontSize="13"
            fontWeight="600"
          >
            {t.label}
          </text>
        ))}

        {/* Ponteiro (needle) */}
        <path
          d={`M ${CX.toFixed(1)} ${CY.toFixed(1)} L ${nx.toFixed(1)} ${ny.toFixed(1)}`}
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Hub central */}
        <circle cx={CX} cy={CY} r="13" fill="white" />
        <circle cx={CX} cy={CY} r="5"  fill="#0f172a" />
      </svg>

      {/* Score numérico */}
      <div
        style={{
          display:    "flex",
          fontSize:   "86px",
          fontWeight: "800",
          color:      "white",
          lineHeight: "1",
          marginTop:  "-32px",
        }}
      >
        {info.score}
      </div>

      {/* Classificação */}
      <div
        style={{
          display:       "flex",
          fontSize:      "20px",
          fontWeight:    "700",
          color:         info.cor,
          letterSpacing: "6px",
          marginTop:     "8px",
        }}
      >
        {info.classificacao}
      </div>

      {/* Nome do contato */}
      <div
        style={{
          display:    "flex",
          fontSize:   "15px",
          color:      "#64748b",
          marginTop:  "10px",
        }}
      >
        {nomeExibido}
      </div>

      {/* Rodapé com estatísticas */}
      <div
        style={{
          display:        "flex",
          flexDirection:  "row",
          gap:            "24px",
          marginTop:      "12px",
          fontSize:       "13px",
          color:          "#475569",
        }}
      >
        <span style={{ display: "flex", color: "#22c55e" }}>
          ✓ {info.pagas} pagas
        </span>
        <span style={{ display: "flex", color: info.vencidas > 0 ? "#ef4444" : "#475569" }}>
          ✗ {info.vencidas} vencidas
        </span>
        <span style={{ display: "flex" }}>
          ⏳ {info.pendentes} pendentes
        </span>
      </div>
    </div>
  );

  return new ImageResponse(image, { width: W, height: H });
}
