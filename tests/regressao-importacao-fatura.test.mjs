import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

const { lerArquivoFatura, parseValor, decodificarTexto } = loadTsModule("src/lib/importacao-fatura.ts");
const fx = (nome) => fs.readFileSync(path.join(root, "tests/fixtures", nome));
const soma = (compras) => Math.round(compras.reduce((s, c) => s + c.valor, 0) * 100) / 100;

test("OFX e CSV do Nubank dão exatamente a mesma fatura", () => {
  const ofx = lerArquivoFatura("Nubank_2026-11-01.ofx", fx("Nubank_2026-11-01.ofx"));
  const csv = lerArquivoFatura("Nubank_2026-11-01.csv", fx("Nubank_2026-11-01.csv"));
  assert.equal(ofx.formato, "OFX");
  assert.equal(csv.formato, "CSV");
  assert.deepEqual(ofx.fatura.compras, csv.fatura.compras);
  assert.deepEqual(ofx.fatura.parceladas, csv.fatura.parceladas);
  // 22 linhas no arquivo, 1 é "Pagamento recebido" (não é gasto)
  assert.equal(csv.fatura.compras.length, 21);
  assert.equal(soma(csv.fatura.compras), 2644.42);
  assert.equal(csv.fatura.emissor, "Nubank");
  assert.equal(csv.fatura.vencimentoFatura, "2026-11-01");
  assert.equal(csv.fatura.vencimentoEstimado, undefined);
});

test("parcelas: descrição limpa, só as que ainda têm parcela futura", () => {
  const { fatura } = lerArquivoFatura("Nubank_2026-11-01.csv", fx("Nubank_2026-11-01.csv"));
  const nomes = fatura.parceladas.map((p) => `${p.descricao} ${p.parcelaAtual}/${p.totalParcelas}`).sort();
  assert.deepEqual(nomes, ["Asa*Upward Creative Ac 1/10", "Atacadao Atakarejo 1/3", "Kiwify *Afiliadasp 10/12", "O Baratao Auto Pecas L 2/3"]);
  const atacadao = fatura.parceladas.find((p) => p.descricao.startsWith("Atacadao"));
  assert.equal(atacadao.valorParcela, 30.9);
  assert.equal(atacadao.dataCompra, "2026-10-06"); // 1ª parcela = data da compra
  assert.equal(fatura.parceladas.find((p) => p.descricao.startsWith("Kiwify")).dataCompra, undefined);
});

test("CSV de outro banco: separador ;, datas dd/mm/aaaa, valor com R$ e sinal invertido", () => {
  const csv = "Data;Estabelecimento;Valor (R$)\n05/10/2026;Padaria Central;-R$ 12,50\n04/10/2026;Loja X 03/10;-R$ 1.234,56\n01/10/2026;Pagamento de fatura;R$ 900,00\n";
  const r = lerArquivoFatura("fatura-itau.csv", Buffer.from(csv, "utf8"));
  assert.equal(r.fatura.compras.length, 2);
  assert.equal(r.fatura.compras[1].valor, 1234.56);
  assert.deepEqual(r.fatura.parceladas.map((p) => [p.descricao, p.parcelaAtual, p.totalParcelas]), [["Loja X", 3, 10]]);
  assert.equal(r.fatura.emissor, null); // sem nome no arquivo → quem chama usa o cartão do cliente
  assert.equal(r.fatura.vencimentoEstimado, true);
  assert.equal(r.fatura.vencimentoFatura, "2026-11-10"); // mês seguinte à última compra
});

test("OFX em Windows-1252 mantém acentos", () => {
  const ofx = "OFXHEADER:100\r\nENCODING:USASCII\r\nCHARSET:1252\r\n<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006000000[-3:BRT]<TRNAMT>-10.00<FITID>1<MEMO>Z\xe9 Delivery</STMTTRN></BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>";
  const r = lerArquivoFatura("x.ofx", Buffer.from(ofx, "latin1"));
  assert.equal(r.fatura.compras[0].descricao, "Zé Delivery");
});

test("estrutura irreconhecível devolve null em vez de adivinhar", () => {
  assert.equal(lerArquivoFatura("a.csv", Buffer.from("foo,bar\n1,2\n")), null);
  assert.equal(lerArquivoFatura("a.txt", Buffer.from("texto qualquer")), null);
});

test("parseValor entende formatos de valor brasileiros e internacionais", () => {
  assert.equal(parseValor("12,50"), 12.5);
  assert.equal(parseValor("- 2.815,88"), -2815.88);
  assert.equal(parseValor("R$ 1.234,56"), 1234.56);
  assert.equal(parseValor("-12.50"), -12.5);
  assert.equal(parseValor("1,234.56"), 1234.56);
  assert.equal(parseValor("abc"), null);
  assert.equal(decodificarTexto(new Uint8Array([0x5a, 0xe9])), "Zé");
});
