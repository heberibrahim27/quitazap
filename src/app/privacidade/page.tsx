import Link from "next/link";

export const metadata = { title: "Privacidade e Termos de Uso — QuitaZAP" };

// Contato de suporte oficial — configurável via env var; enquanto
// NEXT_PUBLIC_SUPORTE_CONTATO não for definido, cai no WhatsApp oficial do
// QuitaZap já usado em outras telas do produto (dashboard/plano).
const CONTATO_SUPORTE = process.env.NEXT_PUBLIC_SUPORTE_CONTATO || "WhatsApp (71) 9 9308-5436";
const CONTATO_SUPORTE_LINK = process.env.NEXT_PUBLIC_SUPORTE_LINK || "https://wa.me/5571993085436";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0a0a0a", marginBottom: 14 }}>{titulo}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: "#374151" }}>{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", textDecoration: "none" }}>
          ← QuitaZAP
        </Link>

        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#0a0a0a", margin: "20px 0 4px" }}>
          Privacidade e Termos de Uso
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 40 }}>Última atualização: setembro de 2026</p>

        <Secao titulo="Política de Privacidade">
          <p>O QuitaZap utiliza seus dados somente para prestar o serviço de organização financeira.</p>

          <p>Podemos tratar informações como:</p>
          <ul style={{ paddingLeft: 20, margin: "0 0 16px" }}>
            <li>nome, telefone, e-mail e dados de cadastro;</li>
            <li>receitas, despesas, cartões, dívidas, empréstimos e consignados;</li>
            <li>informações presentes em contracheques, comprovantes, recibos e documentos enviados pelo usuário;</li>
            <li>mensagens, áudios e imagens enviados ao QuitaZap para registrar ou consultar informações financeiras;</li>
            <li>dados necessários para identificar sua assinatura e liberar o acesso ao serviço.</li>
          </ul>

          <p>Esses dados são usados para:</p>
          <ul style={{ paddingLeft: 20, margin: "0 0 16px" }}>
            <li>organizar suas finanças;</li>
            <li>calcular saldos, despesas e comprometimento de renda;</li>
            <li>analisar seu contracheque;</li>
            <li>gerar simulações e projeções;</li>
            <li>responder perguntas feitas ao assistente do QuitaZap;</li>
            <li>identificar padrões de gastos e possíveis oportunidades de economia;</li>
            <li>fornecer alertas e funcionalidades contratadas.</li>
          </ul>

          <p>
            O QuitaZap pode utilizar fornecedores de tecnologia, hospedagem, inteligência artificial, mensageria e
            pagamento para operar o serviço. Esses fornecedores recebem apenas os dados necessários para executar
            suas respectivas funções.
          </p>

          <p><strong>Não vendemos seus dados pessoais ou financeiros.</strong></p>

          <p>
            O QuitaZap adota medidas técnicas para proteger as informações armazenadas, mas nenhum sistema conectado
            à internet pode garantir segurança absoluta.
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", margin: "20px 0 8px" }}>Exclusão dos dados</h3>
          <p>
            Você pode solicitar a exclusão da sua conta e dos seus dados pessoais entrando em contato com o suporte.
            Após a solicitação, os dados serão excluídos ou anonimizados conforme aplicável, exceto quando
            precisarmos manter alguma informação por obrigação legal, prevenção a fraude ou comprovação de operações.
          </p>
          <p>
            Contato:{" "}
            <a href={CONTATO_SUPORTE_LINK} target="_blank" rel="noreferrer" style={{ color: "#16a34a", fontWeight: 700 }}>
              {CONTATO_SUPORTE}
            </a>
          </p>
        </Secao>

        <Secao titulo="Termos de Uso">
          <p>Ao criar uma conta ou utilizar o QuitaZap, você concorda com estes termos.</p>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", margin: "20px 0 8px" }}>1. O que é o QuitaZap</h3>
          <p>
            O QuitaZap é uma ferramenta de organização financeira que permite registrar e acompanhar informações
            como receitas, despesas, cartões, dívidas, empréstimos, consignados e metas. O serviço também pode
            utilizar inteligência artificial para analisar informações registradas e apresentar explicações, alertas,
            simulações e sugestões.
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", margin: "20px 0 8px" }}>2. Informações fornecidas pelo usuário</h3>
          <p>
            As análises do QuitaZap dependem das informações registradas pelo próprio usuário. Se receitas,
            despesas, dívidas ou outros compromissos não forem cadastrados corretamente, as análises e simulações
            também poderão ficar incompletas. Por isso, respostas como &ldquo;Posso gastar R$300?&rdquo; são baseadas nos
            dados disponíveis no QuitaZap naquele momento e não representam o saldo real de uma conta bancária, salvo
            quando houver uma integração específica que forneça essa informação.
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", margin: "20px 0 8px" }}>3. Simulações e inteligência artificial</h3>
          <p>
            Simulações, projeções, classificações de saúde financeira e respostas da inteligência artificial têm
            caráter informativo e de apoio à organização pessoal. Elas não garantem economia, lucro, quitação de
            dívidas ou qualquer resultado financeiro específico. O QuitaZap não substitui orientação profissional
            financeira, contábil, jurídica ou bancária quando essa orientação for necessária.
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", margin: "20px 0 8px" }}>4. Documentos e contracheques</h3>
          <p>
            Ao enviar um contracheque, comprovante, recibo, imagem ou outro documento, você autoriza o QuitaZap a
            processar as informações necessárias para executar as funcionalidades solicitadas. Você deve enviar
            somente documentos que pertençam a você ou que esteja autorizado a utilizar.
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", margin: "20px 0 8px" }}>5. Conta e assinatura</h3>
          <p>
            O usuário é responsável por manter seus dados de acesso seguros. Planos, preços, condições de renovação
            e cancelamento serão apresentados no momento da contratação. Quando houver uma condição promocional ou
            Preço Fundador, serão aplicadas as regras informadas naquela oferta.
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", margin: "20px 0 8px" }}>6. Exclusão da conta</h3>
          <p>
            O usuário pode solicitar a exclusão da conta e dos dados pelo suporte:{" "}
            <a href={CONTATO_SUPORTE_LINK} target="_blank" rel="noreferrer" style={{ color: "#16a34a", fontWeight: 700 }}>
              {CONTATO_SUPORTE}
            </a>
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", margin: "20px 0 8px" }}>7. Alterações</h3>
          <p>
            O QuitaZap poderá atualizar estes termos ou sua Política de Privacidade quando necessário. Mudanças
            importantes serão comunicadas pelos canais disponíveis.
          </p>
        </Secao>

        <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", textDecoration: "none" }}>
          ← Voltar
        </Link>
      </div>
    </div>
  );
}
